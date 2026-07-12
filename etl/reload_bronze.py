"""Reprocesa el bronze (JSON crudo) hacia la DB normalizando las keys de Cargo
(espacios -> guión bajo). Recupera los campos con '_' (DateTime_UTC, Gamelength_Number,
Place_Number, N_PlayerInTeam) que quedaron NULL por el bug del parser, SIN re-crawlear.

Solo recarga las tablas afectadas (las que tienen campos con '_'); NO toca players
(para preservar players.Image que setea fetch_images).

    python -m etl.reload_bronze
"""
from __future__ import annotations

import gzip
import json

from etl import config, db
from etl.clients.cargo import normalize_keys

# Tablas con campos que llevan '_' en el nombre (se rompían con el bug).
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
        print(f"  {name:22s} {total:7d} filas desde {len(files)} archivos bronze")
    conn.close()
    print("[reload] listo — campos con '_' recuperados desde bronze")


if __name__ == "__main__":
    main()
