"""ETL orchestrator for a SLICE of a tournament (development/verification).

    python -m etl.run --tournament "2025 First Stand" --fresh

For the massive backfill (all regions since 2011) see `python -m etl.backfill`.
"""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

from etl import config, db
from etl.clients.cargo import CargoSource
from etl.extract.tournament import extract_tournament
from etl.transform import aggregate


def main() -> None:
    ap = argparse.ArgumentParser(description="ETL LoL Pro Stats (slice per tournament)")
    ap.add_argument("--tournament", default="2025 First Stand",
                    help="OverviewPage of the tournament to extract")
    ap.add_argument("--db", default=str(config.DB_PATH))
    ap.add_argument("--fresh", action="store_true", help="recreate the schema from scratch")
    args = ap.parse_args()

    db_path = Path(args.db)
    if args.fresh and db_path.exists():
        for p in [db_path, Path(str(db_path) + "-wal"), Path(str(db_path) + "-shm")]:
            p.unlink(missing_ok=True)

    conn = db.connect(db_path)
    db.apply_schema(conn)

    src = CargoSource()
    print(f"[extract] tournament: {args.tournament}")
    extract_tournament(src, conn, args.tournament)

    print("[transform] aggregating gold tables…")
    aggregate.run_all(conn)

    db.set_meta(conn, "attribution_leaguepedia", config.ATTRIBUTION["leaguepedia"])
    _summary(conn)
    conn.close()


def _summary(conn: sqlite3.Connection) -> None:
    print("\n[summary]")
    for tbl in ["scoreboard_players", "scoreboard_games", "players",
                "player_career_stats", "leaderboards", "records"]:
        n = conn.execute(f"SELECT COUNT(*) AS c FROM {tbl}").fetchone()["c"]
        print(f"  {tbl:22s} {n:6d}")


if __name__ == "__main__":
    main()
