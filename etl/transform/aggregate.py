"""Transform GOLD: tiers, player_career_stats, leaderboards y records.

Regla de KDA (no negociable): (ΣK+ΣA)/ΣD desde totales crudos, nunca promedio de
ratios por juego. Se usa MAX(deaths,1) en el denominador para el caso deaths=0.
"""
from __future__ import annotations

import json
import sqlite3

from etl import config


# ---------------------------------------------------------------------------
def compute_tiers(conn: sqlite3.Connection) -> None:
    """Etiqueta cada torneo con su tier (registra classify_tier como función SQL)."""
    conn.create_function("classify_tier", 3,
                         lambda lg, rg, pl: config.classify_tier(lg, rg, pl))
    conn.execute("UPDATE tournaments SET Tier = classify_tier(League, Region, IsPlayoffs)")
    conn.commit()


# ---------------------------------------------------------------------------
def _career_query(tier_filter: str | None) -> str:
    conditions = ["SP.Link IS NOT NULL", "SP.Link <> ''"]
    if tier_filter:
        conditions.append(f"T.Tier = '{tier_filter}'")
    where = " AND ".join(conditions)
    return f"""
        SELECT
            SP.Link AS player_id,
            COALESCE(P.ID, SP.Link) AS display_id,
            COUNT(DISTINCT SP.GameId) AS games,
            SUM(CASE WHEN SP.PlayerWin = 'Yes' THEN 1 ELSE 0 END) AS wins,
            SUM(COALESCE(SP.Kills, 0))   AS kills,
            SUM(COALESCE(SP.Deaths, 0))  AS deaths,
            SUM(COALESCE(SP.Assists, 0)) AS assists
        FROM scoreboard_players SP
        LEFT JOIN players P ON P.OverviewPage = SP.Link
        LEFT JOIN tournaments T ON T.OverviewPage = SP.OverviewPage
        WHERE {where}
        GROUP BY SP.Link
    """


def compute_career_stats(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM player_career_stats")
    for scope, tier in [("all", None), ("intl_premier", "intl_premier")]:
        rows = conn.execute(_career_query(tier)).fetchall()
        payload = []
        for r in rows:
            kills, deaths, assists = r["kills"] or 0, r["deaths"] or 0, r["assists"] or 0
            games, wins = r["games"] or 0, r["wins"] or 0
            kda = (kills + assists) / max(deaths, 1)
            win_rate = wins / games if games else 0.0
            payload.append((r["player_id"], scope, r["display_id"], games, wins,
                            games - wins, kills, deaths, assists, round(kda, 4),
                            round(win_rate, 4)))
        conn.executemany(
            """INSERT INTO player_career_stats
               (player_id, scope, display_id, games, wins, losses, kills, deaths,
                assists, kda, win_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?)""", payload)
    conn.commit()


# ---------------------------------------------------------------------------
def _store_leaderboard(conn, stat: str, scope: str, ranked: list[tuple]) -> None:
    conn.execute("DELETE FROM leaderboards WHERE stat=? AND scope=?", (stat, scope))
    conn.executemany(
        """INSERT INTO leaderboards (stat, scope, rank, player_id, display_id, value, games)
           VALUES (?,?,?,?,?,?,?)""",
        [(stat, scope, i + 1, pid, did, val, games) for i, (pid, did, val, games) in enumerate(ranked)],
    )
    conn.commit()


def compute_leaderboards(conn: sqlite3.Connection, top_n: int = 200) -> None:
    kda_min = config.THRESHOLDS["career_kda"]
    wr_min = config.THRESHOLDS["win_rate"]

    # --- boards derivados de player_career_stats (scope 'all') ---
    def board(order_col, where=""):
        return conn.execute(
            f"""SELECT player_id, display_id, {order_col} AS value, games
                FROM player_career_stats WHERE scope='all' {where}
                ORDER BY value DESC, games DESC LIMIT ?""", (top_n,)).fetchall()

    _store_leaderboard(conn, "career_kda", "all",
                       [(r["player_id"], r["display_id"], r["value"], r["games"])
                        for r in board("kda", f"AND games >= {kda_min}")])
    _store_leaderboard(conn, "games_played", "all",
                       [(r["player_id"], r["display_id"], r["value"], r["games"])
                        for r in board("games")])
    _store_leaderboard(conn, "career_kills", "all",
                       [(r["player_id"], r["display_id"], r["value"], r["games"])
                        for r in board("kills")])
    _store_leaderboard(conn, "win_rate", "all",
                       [(r["player_id"], r["display_id"], r["value"], r["games"])
                        for r in board("win_rate", f"AND games >= {wr_min}")])

    # --- títulos internacionales y de Worlds (roster ganador con >=1 game) ---
    _store_leaderboard(conn, "intl_titles", "all", _titles(conn, league=None, top_n=top_n))
    _store_leaderboard(conn, "worlds_titles", "all", _titles(conn, league="Worlds", top_n=top_n))


def _titles(conn, league: str | None, top_n: int) -> list[tuple]:
    league_clause = f"AND T.League = '{league}'" if league else ""
    q = f"""
        WITH winners AS (
            -- Ganador = Place='1'. (Place_Number viene NULL desde Cargo; Place es fiable.)
            SELECT TR.OverviewPage AS op, TR.PageAndTeam AS pat
            FROM tournament_results TR
            JOIN tournaments T ON T.OverviewPage = TR.OverviewPage
            WHERE T.Tier = 'intl_premier' AND TRIM(TR.Place) = '1' {league_clause}
        ),
        winning_players AS (
            SELECT DISTINCT TP.Link AS player_id, W.op AS op
            FROM tournament_players TP
            JOIN winners W ON W.pat = TP.PageAndTeam
            WHERE TP.Link IS NOT NULL AND TP.Link <> ''
              AND EXISTS (
                SELECT 1 FROM scoreboard_players SP
                WHERE SP.Link = TP.Link AND SP.OverviewPage = TP.OverviewPage)
        )
        SELECT wp.player_id,
               COALESCE(P.ID, wp.player_id) AS display_id,
               COUNT(DISTINCT wp.op) AS titles
        FROM winning_players wp
        LEFT JOIN players P ON P.OverviewPage = wp.player_id
        GROUP BY wp.player_id
        ORDER BY titles DESC LIMIT ?
    """
    rows = conn.execute(q, (top_n,)).fetchall()
    # games = None (no aplica muestra); value = nº de títulos
    return [(r["player_id"], r["display_id"], r["titles"], None) for r in rows]


# ---------------------------------------------------------------------------
RECORD_LABELS = {
    "career_kda": "Mejor KDA histórico (carrera)",
    "games_played": "Más partidas oficiales jugadas",
    "career_kills": "Más kills de carrera",
    "win_rate": "Mejor win rate de carrera",
    "intl_titles": "Más títulos internacionales",
    "worlds_titles": "Más títulos de Worlds",
}


def compute_records(conn: sqlite3.Connection) -> None:
    """Toma el top-1 de cada leaderboard como récord del 'record book'."""
    conn.execute("DELETE FROM records")
    payload = []
    for stat, label in RECORD_LABELS.items():
        row = conn.execute(
            "SELECT player_id, display_id, value, games FROM leaderboards "
            "WHERE stat=? AND scope='all' AND rank=1", (stat,)).fetchone()
        if not row:
            continue
        ctx = {"games": row["games"], "threshold": config.THRESHOLDS.get(stat)}
        payload.append((f"most_{stat}", label, row["player_id"], row["display_id"],
                        row["value"], json.dumps(ctx, ensure_ascii=False)))
    conn.executemany(
        """INSERT OR REPLACE INTO records (record_key, label, ref_id, display_id, value, context)
           VALUES (?,?,?,?,?,?)""", payload)
    conn.commit()


def run_all(conn: sqlite3.Connection) -> None:
    compute_tiers(conn)
    compute_career_stats(conn)
    compute_leaderboards(conn)
    compute_records(conn)
