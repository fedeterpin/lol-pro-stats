"""Transform GOLD: tiers, career stats (per scope/role), leaderboards, champion
pool, titles, champion stats, player index and records.

KDA rule (non-negotiable): (ΣK+ΣA)/ΣD from raw totals, never an average of per-game
ratios. MAX(deaths,1) is used in the denominator for the deaths=0 case.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3

from etl import config

ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"]

# --- Fandom CDN image URLs (no UA blocking; built by MD5) ---
_CDN = "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images"


def cdn_image(filename):
    """Direct URL to a Leaguepedia image given its file name."""
    if not filename:
        return None
    fn = str(filename).replace(" ", "_")
    h = hashlib.md5(fn.encode("utf-8")).hexdigest()
    return f"{_CDN}/{h[0]}/{h[:2]}/{fn}"


def team_logo(team):
    """URL of a team's square logo (Leaguepedia uses '<Team>logo square.png')."""
    if not team:
        return None
    return cdn_image(f"{team}logo square.png")


# ---------------------------------------------------------------------------
def compute_tiers(conn: sqlite3.Connection) -> None:
    conn.create_function("classify_tier", 3,
                         lambda lg, rg, pl: config.classify_tier(lg, rg, pl))
    conn.execute("UPDATE tournaments SET Tier = classify_tier(League, Region, IsPlayoffs)")
    conn.commit()


# ---------------------------------------------------------------------------
def _career_query(where_extra: str = "") -> str:
    conditions = ["SP.Link IS NOT NULL", "SP.Link <> ''"]
    if where_extra:
        conditions.append(where_extra)
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
    scopes = [("all", ""), ("intl_premier", "T.Tier = 'intl_premier'")]
    scopes += [(f"role:{r}", f"SP.Role = '{r}'") for r in ROLES]
    for scope, extra in scopes:
        rows = conn.execute(_career_query(extra)).fetchall()
        payload = []
        for r in rows:
            kills, deaths, assists = r["kills"] or 0, r["deaths"] or 0, r["assists"] or 0
            games, wins = r["games"] or 0, r["wins"] or 0
            if not games:
                continue
            kda = (kills + assists) / max(deaths, 1)
            payload.append((r["player_id"], scope, r["display_id"], games, wins,
                            games - wins, kills, deaths, assists, round(kda, 4),
                            round(wins / games, 4)))
        conn.executemany(
            """INSERT INTO player_career_stats
               (player_id, scope, display_id, games, wins, losses, kills, deaths,
                assists, kda, win_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?)""", payload)
    conn.commit()


# ---------------------------------------------------------------------------
def compute_player_champions(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM player_champions")
    rows = conn.execute("""
        SELECT Link AS player_id, Champion AS champion,
               COUNT(DISTINCT GameId) AS games,
               SUM(CASE WHEN PlayerWin = 'Yes' THEN 1 ELSE 0 END) AS wins,
               SUM(COALESCE(Kills, 0)) AS k, SUM(COALESCE(Deaths, 0)) AS d,
               SUM(COALESCE(Assists, 0)) AS a
        FROM scoreboard_players
        WHERE Link IS NOT NULL AND Link <> '' AND Champion IS NOT NULL AND Champion <> ''
        GROUP BY Link, Champion""").fetchall()
    payload = [(r["player_id"], r["champion"], r["games"], r["wins"], r["k"], r["d"],
                r["a"], round((r["k"] + r["a"]) / max(r["d"], 1), 4)) for r in rows]
    conn.executemany(
        """INSERT INTO player_champions
           (player_id, champion, games, wins, kills, deaths, assists, kda)
           VALUES (?,?,?,?,?,?,?,?)""", payload)
    conn.commit()


def _first_year(text):
    m = re.search(r"(20\d{2})", str(text or ""))
    return m.group(1) if m else None


def compute_player_teams(conn: sqlite3.Connection) -> None:
    """Team history: per (player, team), first/last year and games."""
    conn.create_function("team_logo", 1, team_logo)
    conn.execute("DELETE FROM player_teams")
    conn.execute("""
        INSERT INTO player_teams (player_id, team, team_logo_url, first_year, last_year, games)
        SELECT Link, Team, team_logo(Team),
               MIN(substr(DateTime_UTC, 1, 4)), MAX(substr(DateTime_UTC, 1, 4)),
               COUNT(DISTINCT GameId)
        FROM scoreboard_players
        WHERE Link IS NOT NULL AND Link <> '' AND Team IS NOT NULL AND Team <> ''
        GROUP BY Link, Team""")
    conn.commit()


def compute_player_titles(conn: sqlite3.Connection) -> None:
    conn.create_function("team_logo", 1, team_logo)
    conn.create_function("first_year", 1, _first_year)
    conn.execute("DELETE FROM player_titles")
    conn.execute("""
        INSERT OR IGNORE INTO player_titles
            (player_id, overview_page, event, league, year, team, team_logo_url)
        SELECT DISTINCT TP.Link, T.OverviewPage, T.Name, T.League,
               COALESCE(NULLIF(T.Year, ''), first_year(T.Name), first_year(T.OverviewPage)),
               TR.Team, team_logo(TR.Team)
        FROM tournament_results TR
        JOIN tournaments T ON T.OverviewPage = TR.OverviewPage
        JOIN tournament_players TP ON TP.PageAndTeam = TR.PageAndTeam
        WHERE T.Tier = 'intl_premier' AND TRIM(TR.Place) = '1'
          AND TP.Link IS NOT NULL AND TP.Link <> ''
          AND EXISTS (SELECT 1 FROM scoreboard_players SP
                      WHERE SP.Link = TP.Link AND SP.OverviewPage = TP.OverviewPage)""")
    conn.commit()


def compute_champion_stats(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM champion_stats")
    rows = conn.execute("""
        SELECT Champion AS champion, COUNT(DISTINCT GameId) AS games,
               SUM(CASE WHEN PlayerWin = 'Yes' THEN 1 ELSE 0 END) AS wins,
               SUM(COALESCE(Kills, 0)) AS k, SUM(COALESCE(Deaths, 0)) AS d,
               SUM(COALESCE(Assists, 0)) AS a, COUNT(DISTINCT Link) AS n_players
        FROM scoreboard_players
        WHERE Champion IS NOT NULL AND Champion <> '' GROUP BY Champion""").fetchall()
    payload = [(r["champion"], r["games"], r["wins"],
                round(r["wins"] / r["games"], 4) if r["games"] else 0.0,
                r["k"], r["d"], r["a"], round((r["k"] + r["a"]) / max(r["d"], 1), 4),
                r["n_players"]) for r in rows]
    conn.executemany(
        """INSERT INTO champion_stats
           (champion, games, wins, win_rate, kills, deaths, assists, kda, n_players)
           VALUES (?,?,?,?,?,?,?,?,?)""", payload)
    conn.commit()


# ---------------------------------------------------------------------------
def _slugify(text: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return base or "player"


# Legacy Score: an interpretable greatness score (titles weigh more). Since the v1
# dataset is international, it measures greatness on the big stage. See README/plan.
LEGACY = {
    "worlds": 110, "msi": 45, "other": 25,   # points per title
    "apps": 9,                                # per Worlds appearance
    "longevity": 0.5,                         # per international game
    "perf_base": 3.0, "perf_cap": 120, "perf_scale": 0.35,  # bonus for elite intl KDA
}


def _legacy_score(worlds, msi, other, apps, intl_games, kda_intl):
    worlds, msi, other, apps = worlds or 0, msi or 0, other or 0, apps or 0
    ig, k = intl_games or 0, kda_intl or 0.0
    titles = LEGACY["worlds"] * worlds + LEGACY["msi"] * msi + LEGACY["other"] * other
    stage = LEGACY["apps"] * apps
    longevity = LEGACY["longevity"] * ig
    performance = max(0.0, k - LEGACY["perf_base"]) * min(ig, LEGACY["perf_cap"]) * LEGACY["perf_scale"]
    breakdown = {"titles": round(titles), "stage": round(stage),
                 "longevity": round(longevity), "performance": round(performance)}
    return round(titles + stage + longevity + performance), breakdown


def compute_player_index(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM player_index")
    rows = conn.execute("""
        SELECT pcs.player_id, pcs.display_id, pcs.games, pcs.wins, pcs.kda, pcs.win_rate,
               P.Name AS name, P.Country AS country, P.Team AS team,
               P.IsRetired AS is_retired, P.Image AS image_filename,
               (SELECT SP.Role FROM scoreboard_players SP WHERE SP.Link = pcs.player_id
                  AND SP.Role IS NOT NULL AND SP.Role <> ''
                GROUP BY SP.Role ORDER BY COUNT(*) DESC LIMIT 1) AS role,
               (SELECT COUNT(*) FROM player_titles pt WHERE pt.player_id = pcs.player_id) AS intl_titles,
               (SELECT COUNT(*) FROM player_titles pt WHERE pt.player_id = pcs.player_id
                  AND pt.league = 'World Championship') AS worlds_titles,
               (SELECT COUNT(*) FROM player_titles pt WHERE pt.player_id = pcs.player_id
                  AND pt.league = 'Mid-Season Invitational') AS msi_titles,
               (SELECT COUNT(DISTINCT T.Year) FROM scoreboard_players SP
                  JOIN tournaments T ON T.OverviewPage = SP.OverviewPage
                  WHERE SP.Link = pcs.player_id AND T.Tier = 'intl_premier'
                    AND T.League = 'World Championship') AS worlds_appearances,
               pin.games AS intl_games, pin.kda AS kda_intl
        FROM player_career_stats pcs
        LEFT JOIN players P ON P.OverviewPage = pcs.player_id
        LEFT JOIN player_career_stats pin
               ON pin.player_id = pcs.player_id AND pin.scope = 'intl_premier'
        WHERE pcs.scope = 'all'
        ORDER BY pcs.games DESC""").fetchall()
    used: set[str] = set()
    payload = []
    for r in rows:
        slug = base = _slugify(r["display_id"] or r["player_id"])
        i = 2
        while slug in used:
            slug = f"{base}-{i}"
            i += 1
        used.add(slug)
        other = (r["intl_titles"] or 0) - (r["worlds_titles"] or 0) - (r["msi_titles"] or 0)
        score, breakdown = _legacy_score(r["worlds_titles"], r["msi_titles"], other,
                                         r["worlds_appearances"], r["intl_games"], r["kda_intl"])
        payload.append((r["player_id"], r["display_id"], slug, r["name"], r["role"],
                        r["country"], r["team"], r["is_retired"], r["games"], r["wins"],
                        r["kda"], r["win_rate"], r["intl_titles"], r["worlds_titles"],
                        r["msi_titles"], r["worlds_appearances"], r["intl_games"],
                        r["kda_intl"], score, json.dumps(breakdown), r["image_filename"],
                        cdn_image(r["image_filename"]), team_logo(r["team"])))
    conn.executemany("""INSERT INTO player_index
        (player_id, display_id, slug, name, role, country, team, is_retired, games,
         wins, kda, win_rate, intl_titles, worlds_titles, msi_titles, worlds_appearances,
         intl_games, kda_intl, score, score_breakdown, image_filename, image_url, team_logo_url)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", payload)
    conn.commit()


def compute_score_leaderboard(conn: sqlite3.Connection, top_n: int = 200) -> None:
    rows = conn.execute(
        "SELECT player_id, display_id, score, games FROM player_index "
        "ORDER BY score DESC LIMIT ?", (top_n,)).fetchall()
    _store_leaderboard(conn, "legacy_score", "all",
                       [(r["player_id"], r["display_id"], r["score"], r["games"]) for r in rows])


# ---------------------------------------------------------------------------
def _store_leaderboard(conn, stat: str, scope: str, ranked: list[tuple]) -> None:
    conn.execute("DELETE FROM leaderboards WHERE stat=? AND scope=?", (stat, scope))
    conn.executemany(
        """INSERT INTO leaderboards (stat, scope, rank, player_id, display_id, value, games)
           VALUES (?,?,?,?,?,?,?)""",
        [(stat, scope, i + 1, pid, did, val, games)
         for i, (pid, did, val, games) in enumerate(ranked)],
    )
    conn.commit()


# per-player stats computed for each scope (all + per role)
PER_PLAYER_STATS = [
    ("career_kda", "kda", "career_kda"),
    ("games_played", "games", None),
    ("career_kills", "kills", None),
    ("win_rate", "win_rate", "win_rate"),
]


def compute_leaderboards(conn: sqlite3.Connection, top_n: int = 200) -> None:
    scopes = ["all"] + [f"role:{r}" for r in ROLES]
    for scope in scopes:
        for stat, col, thr_key in PER_PLAYER_STATS:
            thr = config.THRESHOLDS.get(thr_key) if thr_key else None
            extra = f"AND games >= {thr}" if thr else ""
            rows = conn.execute(
                f"""SELECT player_id, display_id, {col} AS value, games
                    FROM player_career_stats WHERE scope = ? {extra}
                    ORDER BY value DESC, games DESC LIMIT ?""", (scope, top_n)).fetchall()
            _store_leaderboard(conn, stat, scope,
                               [(r["player_id"], r["display_id"], r["value"], r["games"])
                                for r in rows])

    # KDA only at internationals (its own, lower threshold)
    thr = config.THRESHOLDS["career_kda_intl"]
    rows = conn.execute(
        f"""SELECT player_id, display_id, kda AS value, games FROM player_career_stats
            WHERE scope = 'intl_premier' AND games >= {thr}
            ORDER BY value DESC, games DESC LIMIT ?""", (top_n,)).fetchall()
    _store_leaderboard(conn, "career_kda_intl", "all",
                       [(r["player_id"], r["display_id"], r["value"], r["games"]) for r in rows])

    # Titles and appearances
    _store_leaderboard(conn, "intl_titles", "all", _titles(conn, None, top_n))
    _store_leaderboard(conn, "worlds_titles", "all", _titles(conn, "World Championship", top_n))
    _store_leaderboard(conn, "msi_titles", "all", _titles(conn, "Mid-Season Invitational", top_n))
    _store_leaderboard(conn, "worlds_appearances", "all", _worlds_appearances(conn, top_n))


def _titles(conn, league: str | None, top_n: int) -> list[tuple]:
    league_clause = f"AND T.League = '{league}'" if league else ""
    q = f"""
        WITH winners AS (
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
              AND EXISTS (SELECT 1 FROM scoreboard_players SP
                          WHERE SP.Link = TP.Link AND SP.OverviewPage = TP.OverviewPage)
        )
        SELECT wp.player_id, COALESCE(P.ID, wp.player_id) AS display_id,
               COUNT(DISTINCT wp.op) AS titles
        FROM winning_players wp
        LEFT JOIN players P ON P.OverviewPage = wp.player_id
        GROUP BY wp.player_id ORDER BY titles DESC LIMIT ?
    """
    rows = conn.execute(q, (top_n,)).fetchall()
    return [(r["player_id"], r["display_id"], r["titles"], None) for r in rows]


def _worlds_appearances(conn, top_n: int) -> list[tuple]:
    rows = conn.execute("""
        SELECT SP.Link AS player_id, COALESCE(P.ID, SP.Link) AS display_id,
               COUNT(DISTINCT T.Year) AS appearances
        FROM scoreboard_players SP
        JOIN tournaments T ON T.OverviewPage = SP.OverviewPage
        LEFT JOIN players P ON P.OverviewPage = SP.Link
        WHERE T.Tier = 'intl_premier' AND T.League = 'World Championship'
          AND SP.Link IS NOT NULL AND SP.Link <> ''
        GROUP BY SP.Link ORDER BY appearances DESC LIMIT ?""", (top_n,)).fetchall()
    return [(r["player_id"], r["display_id"], r["appearances"], None) for r in rows]


# ---------------------------------------------------------------------------
RECORD_LABELS = {
    "legacy_score": "Highest legacy score",
    "intl_titles": "Most international titles",
    "worlds_titles": "Most Worlds titles",
    "msi_titles": "Most MSI titles",
    "worlds_appearances": "Most Worlds appearances",
    "games_played": "Most games played",
    "career_kills": "Most career kills",
    "career_kda_intl": "Best KDA at internationals",
    "career_kda": "Best career KDA",
    "win_rate": "Best career win rate",
}


def compute_records(conn: sqlite3.Connection) -> None:
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
    compute_player_titles(conn)
    compute_player_teams(conn)
    compute_player_champions(conn)
    compute_champion_stats(conn)
    compute_leaderboards(conn)
    compute_player_index(conn)
    compute_score_leaderboard(conn)
    compute_records(conn)
