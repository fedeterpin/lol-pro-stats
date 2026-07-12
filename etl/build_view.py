"""Genera una 'vista' consistente de la DB para que el dev server muestre el avance
del backfill SIN tocar la DB en escritura.

- Backup online (consistente) de data/site.sqlite -> tmp (reader WAL, no interfiere
  con el writer del backfill).
- Sobre el tmp (descartable): asegura columnas nuevas de silver + recrea las tablas
  gold con el esquema actual, y corre los agregados (SQL puro, sin API).
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

# Columnas de silver que pueden faltar en DBs viejas (se agregan a la copia).
SILVER_ADDS = [("players", "Image", "TEXT")]
# Tablas GOLD (derivadas): se recrean en cada build para tomar el esquema actual.
GOLD_TABLES = ["player_career_stats", "leaderboards", "records", "player_index",
               "player_champions", "player_titles", "champion_stats"]


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

    conn = db.connect(TMP)
    # Asegurar columnas de silver que quizás no existan en la DB live vieja.
    for table, col, coltype in SILVER_ADDS:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}")
        except sqlite3.OperationalError:
            pass  # ya existe
    # Recrear tablas gold con el esquema actual (son derivadas).
    for t in GOLD_TABLES:
        conn.execute(f"DROP TABLE IF EXISTS {t}")
    db.apply_schema(conn)
    conn.commit()

    aggregate.run_all(conn)
    games = conn.execute("SELECT COUNT(*) c FROM scoreboard_games").fetchone()["c"]
    prows = conn.execute("SELECT COUNT(*) c FROM scoreboard_players").fetchone()["c"]
    players = conn.execute("SELECT COUNT(*) c FROM player_career_stats WHERE scope='all'").fetchone()["c"]
    imgs = conn.execute("SELECT COUNT(*) c FROM player_index WHERE image_filename IS NOT NULL AND image_filename<>''").fetchone()["c"]
    top = conn.execute(
        "SELECT display_id, value FROM leaderboards "
        "WHERE stat='intl_titles' ORDER BY rank LIMIT 3").fetchall()
    conn.close()

    os.replace(TMP, VIEW)   # swap atómico
    top_s = ", ".join(f"{r['display_id']}({int(r['value'])})" for r in top) or "—"
    print(f"[view] games={games} player_rows={prows} jugadores={players} fotos={imgs} | "
          f"top títulos int.: {top_s}")


if __name__ == "__main__":
    build()
