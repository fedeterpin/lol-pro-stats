"""Produce a 'slim' SQLite with only the GOLD tables (the ones the web reads) from
the ETL DB. Much smaller -> it gets committed and serves the Cloudflare build.

    python -m etl.build_web_db
"""
from __future__ import annotations

import shutil
import sqlite3

from etl import config

WEB_DB = config.DATA_DIR / "web.sqlite"
# Silver (scoreboard, etc.): the ETL uses them to compute gold, the web does not.
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
    # the ETL checkpoints are not useful in the web
    conn.execute("""DELETE FROM etl_meta WHERE key LIKE 'loaded:%' OR key LIKE 'sweep:%'
                    OR key LIKE 'month:%' OR key LIKE 'meta:%' OR key LIKE 'year:%'""")
    conn.commit()
    conn.execute("PRAGMA journal_mode=DELETE")
    conn.execute("VACUUM")
    conn.close()
    print(f"[web-db] {WEB_DB}  {WEB_DB.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
