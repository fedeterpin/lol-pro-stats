"""Extracción por torneo (reutilizada por run.py y backfill.py)."""
from __future__ import annotations

import sqlite3

from etl import config, db
from etl.clients.cargo import CargoSource, cargo_escape

# Tablas scoped por OverviewPage (se extraen por torneo).
SCOPED_TABLES = ["tournaments", "scoreboard_games", "scoreboard_players",
                 "tournament_results", "tournament_players"]


def _in_clause(field: str, values: list[str]) -> str:
    escaped = ", ".join(f"'{cargo_escape(v)}'" for v in values if v)
    return f"{field} IN ({escaped})"


def _chunked(items: list[str], size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def extract_tournament(src: CargoSource, conn: sqlite3.Connection, overview_page: str,
                       with_players: bool = True, verbose: bool = True) -> dict:
    """Extrae y carga las tablas scoped de un torneo. Si with_players, además trae
    Players/PlayerRedirects de los jugadores que aparecieron (útil para un slice
    aislado; en el backfill conviene traer las dims en bloque con fetch_players_for_links)."""
    counts: dict[str, int] = {}
    op_where = f'OverviewPage="{cargo_escape(overview_page)}"'

    for name in SCOPED_TABLES:
        spec = config.TABLES[name]
        rows = src.extract_table(spec, where=op_where, store_key=overview_page)
        counts[name] = db.upsert_rows(conn, spec, rows)
        if verbose:
            print(f"  · {name:20s} {counts[name]:6d} filas")

    if with_players:
        links = _distinct_links(conn, overview_page)
        counts.update(fetch_players_for_links(src, conn, links, store_key=overview_page,
                                              verbose=verbose))
    return counts


def _distinct_links(conn: sqlite3.Connection, overview_page: str | None = None) -> list[str]:
    if overview_page:
        q = ("SELECT DISTINCT Link FROM scoreboard_players "
             "WHERE OverviewPage = ? AND Link IS NOT NULL AND Link <> ''")
        return [r["Link"] for r in conn.execute(q, (overview_page,)).fetchall()]
    q = "SELECT DISTINCT Link FROM scoreboard_players WHERE Link IS NOT NULL AND Link <> ''"
    return [r["Link"] for r in conn.execute(q).fetchall()]


def fetch_players_for_links(src: CargoSource, conn: sqlite3.Connection, links: list[str],
                            store_key: str = "links", skip_existing: bool = False,
                            verbose: bool = True) -> dict:
    """Trae Players + PlayerRedirects para una lista de Links (canónicos), en chunks."""
    if skip_existing:
        have = {r["OverviewPage"] for r in conn.execute(
            "SELECT OverviewPage FROM players").fetchall()}
        links = [l for l in links if l not in have]
    counts = {"players": 0, "player_redirects": 0}
    for name in ["players", "player_redirects"]:
        spec = config.TABLES[name]
        total = 0
        for i, chunk in enumerate(_chunked(links, 60)):
            rows = src.extract_table(spec, where=_in_clause("OverviewPage", chunk),
                                     store_key=f"{store_key}_{name}_{i}")
            total += db.upsert_rows(conn, spec, rows)
        counts[name] = total
        if verbose:
            print(f"  · {name:20s} {counts[name]:6d} filas  (de {len(links)} jugadores)")
    return counts
