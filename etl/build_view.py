"""Generates a consistent 'view' of the DB so the dev server can show the backfill
progress WITHOUT touching the DB being written to.

- Online (consistent) backup of data/site.sqlite -> tmp (WAL reader, does not interfere
  with the backfill writer).
- On the tmp (disposable): ensures new silver columns + recreates the gold tables with
  the current schema, and runs the aggregates (pure SQL, no API).
- Atomic swap tmp -> data/site_view.sqlite (the dev server reads it readonly).

Usage: python -m etl.build_view   (or in a loop every N seconds)
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

# Silver columns that may be missing in old DBs (added to the copy).
SILVER_ADDS = [("players", "Image", "TEXT")]
# GOLD tables (derived): recreated on every build to pick up the current schema.
GOLD_TABLES = ["player_career_stats", "leaderboards", "records", "player_index",
               "player_champions", "player_titles", "player_teams", "champion_stats"]


def build() -> None:
    if not LIVE.exists():
        print("[view] the live DB does not exist yet")
        return
    for p in (TMP, Path(str(TMP) + "-wal"), Path(str(TMP) + "-shm")):
        p.unlink(missing_ok=True)

    # Consistent online backup (does not block the backfill writer).
    src = sqlite3.connect(LIVE)
    dst = sqlite3.connect(TMP)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()

    conn = db.connect(TMP)
    # Ensure silver columns that may not exist in the old live DB.
    for table, col, coltype in SILVER_ADDS:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}")
        except sqlite3.OperationalError:
            pass  # already exists
    # Recreate gold tables with the current schema (they are derived).
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

    os.replace(TMP, VIEW)   # atomic swap
    top_s = ", ".join(f"{r['display_id']}({int(r['value'])})" for r in top) or "—"
    print(f"[view] games={games} player_rows={prows} players={players} photos={imgs} | "
          f"top intl titles: {top_s}")


if __name__ == "__main__":
    build()
