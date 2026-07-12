"""Cliente Cargo sobre mwcleric: paginación manual + throttle + backoff + bronze.

mwcleric.CargoClient.query auto-pagina pero no throttlea ni reintenta ante
'ratelimited' (y un fallo a mitad pierde el progreso). Acá paginamos por página
(limit=page_size desactiva auto_continue), serializamos, hacemos backoff exponencial
y persistimos cada pull crudo (bronze) en gzip para poder reconstruir sin re-pegarle
a la API.
"""
from __future__ import annotations

import gzip
import json
import os
import time
from pathlib import Path
from typing import Iterable

from mwrogue.esports_client import EsportsClient
from mwcleric.auth_credentials import AuthCredentials
from mwclient.errors import APIError

from etl import config

RETRYABLE_CODES = {"ratelimited", "maxlag", "readonly", "internal_api_error_DBQueryError"}


class CargoSource:
    def __init__(self, wiki: str = config.WIKI, raw_dir: Path | None = None,
                 min_interval: float = config.MIN_REQUEST_INTERVAL):
        self.wiki = wiki
        self.raw_dir = raw_dir or config.RAW_DIR
        self.min_interval = min_interval      # piso del intervalo adaptativo
        self._interval = min_interval         # intervalo actual (AIMD)
        self._last_request_ts = 0.0
        self._client: EsportsClient | None = None
        self._authed = False
        self._has_apihighlimits = False
        self._no_ratelimit = False

    # -- conexión (lazy) --------------------------------------------------
    @property
    def client(self) -> EsportsClient:
        if self._client is None:
            self._client = self._connect()
        return self._client

    def _connect(self) -> EsportsClient:
        user = os.environ.get("LEAGUEPEDIA_USERNAME")
        pwd = os.environ.get("LEAGUEPEDIA_PASSWORD")
        creds = None
        if user and pwd:
            creds = AuthCredentials(username=user, password=pwd)
            self._authed = True
        # El fork de mwcleric expone `user_agent` (lo mapea a clients_useragent
        # internamente); max_lag fluye por **kwargs hasta mwclient.Site.
        client = EsportsClient(
            self.wiki,
            credentials=creds,
            user_agent=config.USER_AGENT,
            max_lag=config.MAX_LAG,
        )
        # El tope real de cargoquery depende de apihighlimits (500 sin, 5000 con).
        # Lo detectamos de los rights de la sesión para elegir el page_size correcto
        # (evita el warning "must be between 1 and 500" y una query vacía extra).
        try:
            info = client.cargo_client.client.api(
                "query", meta="userinfo", uiprop="rights", format="json")
            rights = info.get("query", {}).get("userinfo", {}).get("rights", [])
            self._has_apihighlimits = "apihighlimits" in rights
            self._no_ratelimit = "noratelimit" in rights
            if self._no_ratelimit:      # grupo bot: sin throttle
                self._interval = 0.0
        except Exception:
            self._has_apihighlimits = False
        return client

    @property
    def page_size(self) -> int:
        return config.PAGE_SIZE_BOT if self._has_apihighlimits else config.PAGE_SIZE_ANON

    # -- throttle / backoff adaptativo (AIMD) ----------------------------
    def _throttle(self) -> None:
        if self._interval <= 0:            # noratelimit: sin throttle
            return
        elapsed = time.monotonic() - self._last_request_ts
        if elapsed < self._interval:
            time.sleep(self._interval - elapsed)
        self._last_request_ts = time.monotonic()

    def _decay_interval(self) -> None:
        """Éxito: bajar despacio el intervalo hacia el piso (additive-ish / multiplicative)."""
        if not self._no_ratelimit and self._interval > self.min_interval:
            self._interval = max(self.min_interval, self._interval * 0.9)

    def _grow_interval(self) -> None:
        """Rate-limit: subir agresivo el intervalo (hasta el techo)."""
        if not self._no_ratelimit:
            self._interval = min(config.MAX_INTERVAL, max(self._interval, 2.0) * 1.5)

    def _query_page(self, *, tables, fields, where=None, join_on=None,
                    group_by=None, order_by=None, limit=None, offset=0) -> list[dict]:
        # Llamada CRUDA a cargoquery: evita el retry recursivo/rápido del fork de
        # mwcleric (martilla el rate-limit y extiende el castigo). Nuestro backoff
        # adaptativo y paciente maneja 'ratelimited'.
        data = {"tables": tables, "fields": fields, "format": "json"}
        if join_on:
            data["join_on"] = join_on
        if where:
            data["where"] = where
        if group_by:
            data["group_by"] = group_by
        if order_by:
            data["order_by"] = order_by
        if limit is not None:
            data["limit"] = limit
        if offset:
            data["offset"] = offset
        site = self.client.cargo_client.client
        last_err = None
        for attempt in range(config.MAX_RETRIES):
            self._throttle()
            try:
                resp = site.api("cargoquery", **data)
                self._decay_interval()
                return [item["title"] for item in resp.get("cargoquery", [])]
            except APIError as e:
                code = getattr(e, "code", "")
                if code not in RETRYABLE_CODES:
                    raise
                last_err = e
                self._grow_interval()
                # Esperar QUIETO (sin reintentos ansiosos que extienden el castigo).
                wait = min(90.0, config.RATELIMIT_COOLDOWN * (attempt + 1))
                print(f"    [cargo] {code}; intervalo->{self._interval:.0f}s; "
                      f"espera quieta {wait:.0f}s ({attempt + 1}/{config.MAX_RETRIES})")
                time.sleep(wait)
        raise RuntimeError(f"Cargo query agotó reintentos: {last_err}")

    # -- API pública ------------------------------------------------------
    def query(self, *, tables: str, fields: Iterable[str] | str, where: str | None = None,
              join_on: str | None = None, group_by: str | None = None,
              order_by: str | None = None) -> list[dict]:
        """Query paginada completa (todas las páginas)."""
        if not isinstance(fields, str):
            fields = ", ".join(fields)
        # page_size ya es el tope real del server (500 sin apihighlimits, 5000 con) ->
        # un page más corto que ps es el último. Avanzamos por len(page) por robustez.
        ps = self.page_size
        rows: list[dict] = []
        offset = 0
        while True:
            page = self._query_page(tables=tables, fields=fields, where=where,
                                    join_on=join_on, group_by=group_by,
                                    order_by=order_by, limit=ps, offset=offset)
            if not page:
                break
            rows.extend(page)
            if len(page) < ps:
                break
            offset += len(page)
        return rows

    def extract_table(self, spec: config.TableSpec, where: str | None = None,
                      store_key: str | None = None) -> list[dict]:
        """Extrae una tabla silver según su spec, filtrando por `where`, y guarda bronze."""
        rows = self.query(
            tables=spec.cargo_table,
            fields=spec.fields,
            where=where,
            order_by=spec.order_by,
        )
        self._store_bronze(spec.name, rows, store_key)
        return rows

    def _store_bronze(self, name: str, rows: list[dict], store_key: str | None) -> Path:
        key = _slug(store_key) if store_key else "full"
        dest = self.raw_dir / name
        dest.mkdir(parents=True, exist_ok=True)
        path = dest / f"{key}.json.gz"
        with gzip.open(path, "wt", encoding="utf-8") as fh:
            json.dump(rows, fh, ensure_ascii=False)
        return path


def _slug(text: str) -> str:
    keep = []
    for ch in text:
        keep.append(ch if ch.isalnum() or ch in "-_" else "_")
    return "".join(keep)[:120] or "full"


def cargo_escape(value: str) -> str:
    """Escapa un valor para un `where` de Cargo (comillas simples)."""
    return value.replace("\\", "\\\\").replace("'", "\\'")
