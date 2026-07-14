"""Fetches each player's profile photo from Leaguepedia's PlayerImages table and
stores it in players.Image (the file name; the URL is built in aggregate).

Picks, per player, the MOST RECENT profile photo (IsProfileImage) based on the year
that appears in the file name (SortDate is usually empty).

WARNING: Writes to the live DB -> run AFTER the backfill.

    python -m etl.fetch_images
"""
from __future__ import annotations

import re
import sqlite3

from etl import db
from etl.clients.cargo import CargoSource
from etl.extract.tournament import _in_clause, _chunked


def _recency_key(filename: str) -> tuple:
    """Sorts by year and split extracted from the name (higher = more recent)."""
    years = re.findall(r"(20\d{2})", filename or "")
    year = max(int(y) for y in years) if years else 0
    sp = re.search(r"Split[ _](\d)", filename or "")
    return (year, int(sp.group(1)) if sp else 0)


def main() -> None:
    conn = db.connect()
    try:
        conn.execute("ALTER TABLE players ADD COLUMN Image TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # already exists

    links = [r["OverviewPage"] for r in
             conn.execute("SELECT OverviewPage FROM players").fetchall()]
    print(f"[images] looking up profile photo for {len(links)} players…")
    src = CargoSource()
    total_with = 0
    for i, chunk in enumerate(_chunked(links, 60), 1):
        where = _in_clause("Link", chunk) + ' AND IsProfileImage="1"'
        rows = src.query(tables="PlayerImages",
                         fields=["Link", "FileName", "IsProfileImage"], where=where)
        best: dict[str, tuple] = {}   # link -> (key, filename)
        for r in rows:
            link = r.get("Link")
            fn = (r.get("FileName") or "").strip()
            if not link or not fn:
                continue
            k = _recency_key(fn)
            if link not in best or k > best[link][0]:
                best[link] = (k, fn)
        for link, (_, fn) in best.items():
            conn.execute("UPDATE players SET Image = ? WHERE OverviewPage = ?", (fn, link))
        conn.commit()
        total_with += len(best)
        print(f"  batch {i}: +{len(best)} photos ({total_with} accumulated)")
    conn.close()
    print(f"[images] done: {total_with}/{len(links)} players with photo")


if __name__ == "__main__":
    main()
