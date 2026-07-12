"""Genera una 'vista' consistente de la DB para que el dev server muestre el avance
del backfill SIN tocar la DB en escritura.

- Backup online (consistente) de data/site.sqlite -> tmp (reader WAL, no interfiere
  con el writer del backfill).
- Corre los agregados gold sobre el tmp (SQL puro, sin API).
- Swap atómico tmp -> data/site_view.sqlite (el dev server lo lee readonly).

Uso: python -m etl.build_view   (o en loop cada N segundos)
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from etl import config, db
from etl.transform import aggregate

LIVE = config.DB_PATH
VIEW = LIVE.parent / "site_view.sqlite"
TMP = LIVE.parent / "site_view.tmp.sqlite"


def build() -> None:
    if not LIVE.exists():
        print("[view] todavía no existe la DB live")
        return
    for p in (TMP, Path(str(TMP) + "-wal"), Path(str(TMP) + "-shm")):
        p.unlink(missing_ok=True)

    # Backup online consistente (no bloquea al writer del backfill).
    src = sqlite3.connect(LIVE)
    dst = sqlite3.connect(TMP)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()

    # Agregados gold sobre la copia. apply_schema (IF NOT EXISTS) asegura las tablas
    # gold nuevas aunque la DB live tenga un esquema más viejo.
    conn = db.connect(TMP)
    db.apply_schema(conn)
    aggregate.run_all(conn)
    games = conn.execute("SELECT COUNT(*) c FROM scoreboard_games").fetchone()["c"]
    prows = conn.execute("SELECT COUNT(*) c FROM scoreboard_players").fetchone()["c"]
    players = conn.execute("SELECT COUNT(*) c FROM player_career_stats WHERE scope='all'").fetchone()["c"]
    top = conn.execute(
        "SELECT display_id, value FROM leaderboards "
        "WHERE stat='intl_titles' ORDER BY rank LIMIT 3").fetchall()
    conn.close()

    os.replace(TMP, VIEW)   # swap atómico
    top_s = ", ".join(f"{r['display_id']}({int(r['value'])})" for r in top) or "—"
    print(f"[view] games={games} player_rows={prows} jugadores={players} | "
          f"top títulos int.: {top_s}")


if __name__ == "__main__":
    build()
