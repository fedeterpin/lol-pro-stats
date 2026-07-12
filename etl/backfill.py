"""Backfill masivo desde Leaguepedia Cargo.

Dos modos:
  · tournaments (default): descubre Tournaments por filtros y los carga uno por uno,
    con checkpoint reanudable (etl_meta 'loaded:<OverviewPage>'). Ideal para backfills
    acotados/targeted y para testear sin agotar el rate-limit.
  · full: para el backfill histórico completo. Trae dimensiones (Players, PlayerRedirects)
    en barrido completo, los scoreboards por AÑO (menos queries que por torneo), y
    tournament_results/players por torneo descubierto.

Ejemplos:
  python -m etl.backfill --leagues LEC --years 2024 --limit 2
  python -m etl.backfill --mode full --year-from 2011
  python -m etl.backfill --leagues "World Championship,Mid-Season Invitational,First Stand"

⚠️ El full run "todas las regiones desde 2011" necesita cuenta de bot (ver README):
   sin ella el rate-limit anónimo lo hace impracticablemente lento.
"""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

from etl import config, db
from etl.clients.cargo import CargoSource, cargo_escape
from etl.extract.tournament import extract_tournament, fetch_players_for_links, _distinct_links
from etl.transform import aggregate


# ---------------------------------------------------------------------------
def discover_tournaments(src: CargoSource, leagues=None, years=None, regions=None,
                         year_from=None, official_only=False) -> list[dict]:
    """Descubre torneos (Tournaments) según filtros. Devuelve dicts ordenados por fecha."""
    conds = []
    if leagues:
        conds.append(_in("League", leagues))
    if regions:
        conds.append(_in("Region", regions))
    if years:
        conds.append(_in("Year", [str(y) for y in years]))
    if year_from:
        conds.append(f'Year >= "{cargo_escape(str(year_from))}"')
    if official_only:
        conds.append('IsOfficial="1"')
    where = " AND ".join(conds) if conds else None
    spec = config.TABLES["tournaments"]
    rows = src.query(tables=spec.cargo_table,
                     fields=["OverviewPage", "Name", "League", "Region", "Year", "DateStart"],
                     where=where, order_by="DateStart")
    return rows


def _in(field: str, values) -> str:
    if isinstance(values, str):
        values = [v.strip() for v in values.split(",")]
    inner = ", ".join(f'"{cargo_escape(str(v))}"' for v in values)
    return f"{field} IN ({inner})"


# ---------------------------------------------------------------------------
def _is_loaded(conn: sqlite3.Connection, op: str) -> bool:
    row = conn.execute("SELECT 1 FROM etl_meta WHERE key = ?", (f"loaded:{op}",)).fetchone()
    return row is not None


def _mark_loaded(conn: sqlite3.Connection, op: str) -> None:
    db.set_meta(conn, f"loaded:{op}", "1")


def backfill_tournaments(src: CargoSource, conn: sqlite3.Connection, ops: list[str],
                         resume: bool = True, with_players: bool = True) -> None:
    total = len(ops)
    for i, op in enumerate(ops, 1):
        if resume and _is_loaded(conn, op):
            print(f"[{i}/{total}] SKIP (ya cargado) {op}")
            continue
        print(f"[{i}/{total}] {op}")
        extract_tournament(src, conn, op, with_players=with_players)
        _mark_loaded(conn, op)


# ---------------------------------------------------------------------------
def extract_scoreboards_by_year(src: CargoSource, conn: sqlite3.Connection, year: int) -> None:
    """Modo eficiente para el full run: scoreboards de un año en un barrido paginado."""
    where = (f'DateTime_UTC >= "{year}-01-01 00:00:00" AND '
             f'DateTime_UTC < "{year + 1}-01-01 00:00:00"')
    for name in ["scoreboard_games", "scoreboard_players"]:
        spec = config.TABLES[name]
        rows = src.extract_table(spec, where=where, store_key=f"year_{year}")
        n = db.upsert_rows(conn, spec, rows)
        print(f"  · {name:20s} {n:6d} filas ({year})")


def run_full(src: CargoSource, conn: sqlite3.Connection, year_from: int, year_to: int) -> None:
    print("[full] descubriendo torneos…")
    ops = [r["OverviewPage"] for r in discover_tournaments(src, year_from=year_from)]
    print(f"  {len(ops)} torneos")
    # tournaments + results + players por torneo (sin scoreboards ni dims acá)
    from etl.extract.tournament import SCOPED_TABLES
    scoped = [t for t in SCOPED_TABLES if t not in ("scoreboard_games", "scoreboard_players")]
    for i, op in enumerate(ops, 1):
        if _is_loaded(conn, f"meta:{op}"):
            continue
        op_where = f'OverviewPage="{cargo_escape(op)}"'
        for name in scoped:
            spec = config.TABLES[name]
            rows = src.extract_table(spec, where=op_where, store_key=op)
            db.upsert_rows(conn, spec, rows)
        db.set_meta(conn, f"meta:{op}", "1")
        if i % 25 == 0:
            print(f"  meta {i}/{len(ops)}")
    print("[full] scoreboards por año…")
    for year in range(year_from, year_to + 1):
        if _is_loaded(conn, f"year:{year}"):
            print(f"  SKIP año {year}")
            continue
        extract_scoreboards_by_year(src, conn, year)
        db.set_meta(conn, f"year:{year}", "1")
    print("[full] dims de jugadores…")
    links = _distinct_links(conn)
    fetch_players_for_links(src, conn, links, store_key="full", skip_existing=True)


# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill Cargo -> SQLite")
    ap.add_argument("--mode", choices=["tournaments", "full"], default="tournaments")
    ap.add_argument("--leagues", help="lista separada por comas (p.ej. 'LEC,LCK')")
    ap.add_argument("--regions", help="lista separada por comas")
    ap.add_argument("--years", help="lista separada por comas (p.ej. '2023,2024')")
    ap.add_argument("--year-from", type=int, help="año mínimo (>=)")
    ap.add_argument("--year-to", type=int, default=2026, help="año máximo (modo full)")
    ap.add_argument("--limit", type=int, help="máximo de torneos a cargar (test)")
    ap.add_argument("--ops", help="OverviewPages explícitos separados por ';' (salta discovery)")
    ap.add_argument("--official-only", action="store_true")
    ap.add_argument("--no-resume", action="store_true", help="recargar aunque estén marcados")
    ap.add_argument("--discover-only", action="store_true", help="solo listar torneos")
    ap.add_argument("--db", default=str(config.DB_PATH))
    args = ap.parse_args()

    conn = db.connect(Path(args.db))
    db.apply_schema(conn)
    src = CargoSource()

    if args.mode == "full":
        run_full(src, conn, args.year_from or 2011, args.year_to)
    elif args.ops:
        ops = [o.strip() for o in args.ops.split(";") if o.strip()]
        print(f"[ops] {len(ops)} torneos explícitos")
        backfill_tournaments(src, conn, ops, resume=not args.no_resume)
    else:
        ops_rows = discover_tournaments(
            src, leagues=args.leagues, regions=args.regions,
            years=(args.years.split(",") if args.years else None),
            year_from=args.year_from, official_only=args.official_only)
        print(f"[discover] {len(ops_rows)} torneos")
        for r in ops_rows[:30]:
            print(f"  - {r.get('Year'):>4} | {r.get('League'):24s} | {r['OverviewPage']}")
        if len(ops_rows) > 30:
            print(f"  … (+{len(ops_rows) - 30} más)")
        if args.discover_only:
            conn.close()
            return
        ops = [r["OverviewPage"] for r in ops_rows]
        if args.limit:
            ops = ops[:args.limit]
        backfill_tournaments(src, conn, ops, resume=not args.no_resume)

    print("[transform] agregando gold tables…")
    aggregate.run_all(conn)
    db.set_meta(conn, "attribution_leaguepedia", config.ATTRIBUTION["leaguepedia"])
    print("[ok] backfill terminado")
    conn.close()


if __name__ == "__main__":
    main()
