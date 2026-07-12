"""Produce una SQLite 'slim' con solo las tablas GOLD (las que lee la web) a partir
de la DB del ETL. Mucho más chica -> se commitea y sirve para el build de Cloudflare.

    python -m etl.build_web_db
"""
from __future__ import annotations

import shutil
import sqlite3

from etl import config

WEB_DB = config.DATA_DIR / "web.sqlite"
# Silver (scoreboard, etc.): las usa el ETL para computar gold, la web no.
DROP_TABLES = ["scoreboard_players", "scoreboard_games", "players",
               "player_redirects", "tournaments", "tournament_results",
               "tournament_players"]


def main() -> None:
    shutil.copyfile(config.DB_PATH, WEB_DB)
    for suffix in ("-wal", "-shm"):
        p = WEB_DB.with_name(WEB_DB.name + suffix)
        if p.exists():
            p.unlink()
    conn = sqlite3.connect(WEB_DB)
    for t in DROP_TABLES:
        conn.execute(f"DROP TABLE IF EXISTS {t}")
    # los checkpoints del ETL no sirven en la web
    conn.execute("""DELETE FROM etl_meta WHERE key LIKE 'loaded:%' OR key LIKE 'sweep:%'
                    OR key LIKE 'month:%' OR key LIKE 'meta:%' OR key LIKE 'year:%'""")
    conn.commit()
    conn.execute("PRAGMA journal_mode=DELETE")
    conn.execute("VACUUM")
    conn.close()
    print(f"[web-db] {WEB_DB}  {WEB_DB.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
