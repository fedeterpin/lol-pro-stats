"""Trae la foto de perfil de cada jugador desde la tabla PlayerImages de Leaguepedia
y la guarda en players.Image (el nombre de archivo; la URL se construye en aggregate).

Elige, por jugador, la foto de perfil (IsProfileImage) MÁS RECIENTE según el año que
aparece en el nombre del archivo (SortDate suele venir vacío).

⚠️ Escribe en la DB live -> correr DESPUÉS del backfill.

    python -m etl.fetch_images
"""
from __future__ import annotations

import re
import sqlite3

from etl import db
from etl.clients.cargo import CargoSource
from etl.extract.tournament import _in_clause, _chunked


def _recency_key(filename: str) -> tuple:
    """Ordena por año y split extraídos del nombre (mayor = más reciente)."""
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
        pass  # ya existe

    links = [r["OverviewPage"] for r in
             conn.execute("SELECT OverviewPage FROM players").fetchall()]
    print(f"[images] buscando foto de perfil para {len(links)} jugadores…")
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
        print(f"  batch {i}: +{len(best)} fotos ({total_with} acumuladas)")
    conn.close()
    print(f"[images] listo: {total_with}/{len(links)} jugadores con foto")


if __name__ == "__main__":
    main()
