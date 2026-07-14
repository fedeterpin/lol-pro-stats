"""Reprocesses the bronze (raw JSON) into the DB, normalizing the Cargo keys
(spaces -> underscore). Recovers the '_' fields (DateTime_UTC, Gamelength_Number,
Place_Number, N_PlayerInTeam) that ended up NULL due to the parser bug, WITHOUT
re-crawling.

Only reloads the affected tables (the ones with '_' fields); does NOT touch players
(to preserve players.Image that fetch_images sets).

    python -m etl.reload_bronze
"""
from __future__ import annotations

import gzip
import json

from etl import config, db
from etl.clients.cargo import normalize_keys

# Tables with fields carrying '_' in the name (they broke with the bug).
RELOAD_TABLES = ["scoreboard_games", "scoreboard_players",
                 "tournament_results", "tournament_players"]


def main() -> None:
    conn = db.connect()
    db.apply_schema(conn)
    for name in RELOAD_TABLES:
        spec = config.TABLES[name]
        raw_dir = config.RAW_DIR / name
        files = sorted(raw_dir.glob("*.json.gz"))
        total = 0
        for f in files:
            with gzip.open(f, "rt", encoding="utf-8") as fh:
                rows = json.load(fh)
            rows = [normalize_keys(r) for r in rows]
            total += db.upsert_rows(conn, spec, rows)
        print(f"  {name:22s} {total:7d} rows from {len(files)} bronze files")
    conn.close()
    print("[reload] done — '_' fields recovered from bronze")


if __name__ == "__main__":
    main()
