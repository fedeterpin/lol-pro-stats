"""Trae Players.Image (nombre de archivo de la foto) para todos los jugadores de la
DB y lo guarda en players.Image.

⚠️ Escribe en la DB live -> correr DESPUÉS del backfill (no en paralelo, para no
chocar con su writer). Es liviano: ~13 queries batcheadas para ~750 jugadores.

    python -m etl.fetch_images
"""
from __future__ import annotations

import sqlite3

from etl import db
from etl.clients.cargo import CargoSource
from etl.extract.tournament import _in_clause, _chunked


def main() -> None:
    conn = db.connect()
    try:
        conn.execute("ALTER TABLE players ADD COLUMN Image TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # la columna ya existe

    links = [r["OverviewPage"] for r in
             conn.execute("SELECT OverviewPage FROM players").fetchall()]
    print(f"[images] resolviendo foto para {len(links)} jugadores…")
    src = CargoSource()
    seen = 0
    with_img = 0
    for i, chunk in enumerate(_chunked(links, 60), 1):
        rows = src.query(tables="Players", fields=["OverviewPage", "Image"],
                         where=_in_clause("OverviewPage", chunk))
        for r in rows:
            img = (r.get("Image") or "").strip() or None
            conn.execute("UPDATE players SET Image = ? WHERE OverviewPage = ?",
                         (img, r["OverviewPage"]))
            if img:
                with_img += 1
        conn.commit()
        seen += len(rows)
        print(f"  batch {i}: {seen} procesados, {with_img} con foto")
    conn.close()
    print(f"[images] listo: {with_img}/{seen} jugadores con foto")


if __name__ == "__main__":
    main()
