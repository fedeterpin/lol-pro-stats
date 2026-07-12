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
        self.min_interval = min_interval
        self._last_request_ts = 0.0
        self._client: EsportsClient | None = None
        self._authed = False

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
        # clients_useragent y max_lag fluyen por **kwargs hasta mwclient.Site.
        return EsportsClient(
            self.wiki,
            credentials=creds,
            clients_useragent=config.USER_AGENT,
            max_lag=config.MAX_LAG,
        )

    @property
    def page_size(self) -> int:
        return config.PAGE_SIZE_BOT if self._authed else config.PAGE_SIZE_ANON

    # -- throttle / backoff ----------------------------------------------
    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_ts
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request_ts = time.monotonic()

    def _query_page(self, *, tables, fields, where=None, join_on=None,
                    group_by=None, order_by=None, limit=None, offset=0) -> list[dict]:
        last_err = None
        for attempt in range(config.MAX_RETRIES):
            self._throttle()
            try:
                return self.client.cargo_client.query(
                    tables=tables, fields=fields, where=where, join_on=join_on,
                    group_by=group_by, order_by=order_by, limit=limit, offset=offset,
                )
            except APIError as e:
                code = getattr(e, "code", "")
                if code not in RETRYABLE_CODES:
                    raise
                last_err = e
                wait = config.BACKOFF_BASE * (2 ** attempt)
                print(f"    [cargo] {code}; backoff {wait:.0f}s "
                      f"(intento {attempt + 1}/{config.MAX_RETRIES})")
                time.sleep(wait)
        raise RuntimeError(f"Cargo query agotó reintentos: {last_err}")

    # -- API pública ------------------------------------------------------
    def query(self, *, tables: str, fields: Iterable[str] | str, where: str | None = None,
              join_on: str | None = None, group_by: str | None = None,
              order_by: str | None = None) -> list[dict]:
        """Query paginada completa (todas las páginas)."""
        if not isinstance(fields, str):
            fields = ", ".join(fields)
        ps = self.page_size
        rows: list[dict] = []
        offset = 0
        while True:
            page = self._query_page(tables=tables, fields=fields, where=where,
                                    join_on=join_on, group_by=group_by,
                                    order_by=order_by, limit=ps, offset=offset)
            rows.extend(page)
            if len(page) < ps:
                break
            offset += ps
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
