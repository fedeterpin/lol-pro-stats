"""Ingest Oracle's Elixir (OE) per-year CSVs into the silver layer.

OE is a SECOND source, additive to Leaguepedia: it brings regional / second-tier
league coverage and per-timing economy that the Cargo API does not provide.

Pipeline:
  1. Apply schema (idempotent; creates the oe_* tables).
  2. Stream each data/raw/oe/<YEAR>_..._OraclesElixir.csv into oe_player_games
     (10 rows/game) and oe_team_games (2 rows/game), keeping a curated subset of
     the ~164 columns.
  3. Build oe_player_link: OE playerid -> Leaguepedia Link, derived from games
     present in BOTH sources. Alignment key is (normalized platform game id,
     champion) — the champion uniquely identifies a player within a game in
     either source, so no name matching and no side/role encoding is needed.
     OE-only (regional) players get link = NULL.

Run: python -m etl.oe_ingest            # all CSVs found in data/raw/oe/
     python -m etl.oe_ingest --years 2024,2025
"""
from __future__ import annotations

import argparse
import csv
import glob
import re
import sys
from collections import Counter, defaultdict

from etl import config, db

OE_DIR = config.RAW_DIR / "oe"

POS_TO_ROLE = {"top": 1, "jng": 2, "mid": 3, "bot": 4, "sup": 5}

# OE csv column -> curated silver column (player rows). Columns not listed are
# dropped. Order here defines the INSERT column order (plus the derived cols).
PLAYER_MAP = {
    "gameid": "gameid", "datacompleteness": "datacompleteness", "league": "league",
    "year": "year", "split": "split", "playoffs": "playoffs", "date": "date",
    "game": "game", "patch": "patch", "side": "side", "position": "position",
    "participantid": "participantid", "playername": "playername", "playerid": "playerid",
    "teamname": "teamname", "teamid": "teamid", "champion": "champion",
    "result": "result", "gamelength": "gamelength",
    "kills": "kills", "deaths": "deaths", "assists": "assists",
    "doublekills": "doublekills", "triplekills": "triplekills",
    "quadrakills": "quadrakills", "pentakills": "pentakills", "firstblood": "firstblood",
    "damagetochampions": "damagetochampions", "dpm": "dpm", "damageshare": "damageshare",
    "totalgold": "totalgold", "earnedgold": "earnedgold", "total cs": "total_cs",
    "cspm": "cspm",
    "goldat10": "goldat10", "csat10": "csat10", "xpat10": "xpat10",
    "golddiffat10": "golddiffat10", "csdiffat10": "csdiffat10", "xpdiffat10": "xpdiffat10",
    "goldat15": "goldat15", "csat15": "csat15", "xpat15": "xpat15",
    "golddiffat15": "golddiffat15", "csdiffat15": "csdiffat15", "xpdiffat15": "xpdiffat15",
}
TEAM_MAP = {
    "gameid": "gameid", "datacompleteness": "datacompleteness", "league": "league",
    "year": "year", "split": "split", "playoffs": "playoffs", "date": "date",
    "game": "game", "patch": "patch", "side": "side", "teamname": "teamname",
    "teamid": "teamid", "result": "result", "gamelength": "gamelength",
    "kills": "kills", "deaths": "deaths", "dragons": "dragons", "barons": "barons",
    "towers": "towers",
}

INT_COLS = {
    "year", "playoffs", "game", "participantid", "result", "gamelength", "role_number",
    "kills", "deaths", "assists", "doublekills", "triplekills", "quadrakills",
    "pentakills", "firstblood", "damagetochampions", "totalgold", "earnedgold",
    "total_cs", "goldat10", "csat10", "xpat10", "goldat15", "csat15", "xpat15",
    "dragons", "barons", "towers",
}
FLOAT_COLS = {
    "dpm", "damageshare", "cspm",
    "golddiffat10", "csdiffat10", "xpdiffat10",
    "golddiffat15", "csdiffat15", "xpdiffat15",
}

PLAYER_COLS = list(PLAYER_MAP.values()) + ["gameid_norm", "role_number"]
TEAM_COLS = list(TEAM_MAP.values()) + ["gameid_norm"]

BATCH = 5000


def norm_id(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", s or "").upper()


# Leaguepedia suffixes a regional tag onto teams that share a name across regions
# ('Ninjas in Pyjamas.CN'); OE does not. Strip it before comparing team names.
_TEAM_SUFFIX = re.compile(r"\.(cn|kr|na|eu|br|la[ns]?|vn|jp|tr|oce|sea|tw)$")


def norm_team(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", _TEAM_SUFFIX.sub("", (s or "").strip().lower()))


def _coerce(col: str, raw):
    if raw is None:
        return None
    s = str(raw).strip()
    if s == "":
        return None
    if col in INT_COLS:
        try:
            return int(float(s))
        except ValueError:
            return None
    if col in FLOAT_COLS:
        try:
            return float(s)
        except ValueError:
            return None
    return s


def _row_tuple(cols, src_map, row, gameid_norm, role_number=None):
    out = []
    for csv_col, dst in src_map.items():
        out.append(_coerce(dst, row.get(csv_col)))
    out.append(gameid_norm)
    if "role_number" in cols:
        out.append(role_number)
    return tuple(out)


def load_csvs(conn, years: set[str] | None) -> None:
    files = sorted(glob.glob(str(OE_DIR / "*_LoL_esports_match_data_from_OraclesElixir.csv")))
    if years:
        files = [f for f in files if re.match(r"(\d{4})", f.rsplit("/", 1)[-1]).group(1) in years]
    if not files:
        sys.exit(f"No OE CSVs found in {OE_DIR} (years={years or 'all'})")

    p_sql = f"INSERT OR REPLACE INTO oe_player_games ({', '.join(PLAYER_COLS)}) VALUES ({', '.join('?' for _ in PLAYER_COLS)})"
    t_sql = f"INSERT OR REPLACE INTO oe_team_games ({', '.join(TEAM_COLS)}) VALUES ({', '.join('?' for _ in TEAM_COLS)})"

    for path in files:
        fname = path.rsplit("/", 1)[-1]
        pbuf, tbuf, np, nt, skipped = [], [], 0, 0, 0
        with open(path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                gid = (row.get("gameid") or "").strip()
                if not gid:
                    skipped += 1
                    continue
                gnorm = norm_id(gid)
                pos = (row.get("position") or "").strip().lower()
                if pos in POS_TO_ROLE:
                    pbuf.append(_row_tuple(PLAYER_COLS, PLAYER_MAP, row, gnorm, POS_TO_ROLE[pos]))
                elif pos == "team":
                    tbuf.append(_row_tuple(TEAM_COLS, TEAM_MAP, row, gnorm))
                else:
                    skipped += 1
                if len(pbuf) >= BATCH:
                    conn.executemany(p_sql, pbuf); np += len(pbuf); pbuf = []
                if len(tbuf) >= BATCH:
                    conn.executemany(t_sql, tbuf); nt += len(tbuf); tbuf = []
        if pbuf:
            conn.executemany(p_sql, pbuf); np += len(pbuf)
        if tbuf:
            conn.executemany(t_sql, tbuf); nt += len(tbuf)
        conn.commit()
        print(f"  {fname}: {np:>7,} player-rows | {nt:>6,} team-rows | {skipped} skipped")


def sync_leagues(conn) -> None:
    """Materialize config.OE_LEAGUES into the oe_leagues dimension table.

    Warns about allowlisted codes absent from the loaded data — that is almost
    always a typo in the allowlist, since OE league codes are opaque strings.
    """
    rows = config.oe_league_rows()
    conn.execute("DELETE FROM oe_leagues")
    conn.executemany(
        "INSERT INTO oe_leagues (league, scope, region, region_label, tier) VALUES (?, ?, ?, ?, ?)",
        rows)
    conn.commit()

    present = {r[0] for r in conn.execute("SELECT DISTINCT league FROM oe_player_games")}
    missing = sorted(lg for lg, *_ in rows if lg not in present)
    print(f"  allowlist: {len(rows)} leagues"
          + (f" | WARNING: not found in the data: {', '.join(missing)}" if missing else ""))


def recover_by_name(conn, mapped: dict[str, str], names: dict[str, str]) -> dict[str, str]:
    """Second pass: map the OE players the game-id vote could not reach.

    The game-id vote only works where Leaguepedia HAS a RiotPlatformGameId, and it
    often does not: none before 2014, and 91 of 250 games in 2024. That leaves ~25%
    of Leaguepedia players unmapped even though OE has hundreds of regional games
    for them, which would split one person into two entries in the gold layer.

    So: match the OE handle against Leaguepedia handles, then REQUIRE a shared
    (year, normalized team) to confirm it. The handle alone is not enough — three
    different players are called 'Fury' (Gambit 2014, Samsung/Longzhu 2015-19, and
    a Vietnamese wildcard in 2015), and two of them overlap in the same year. Being
    on the same roster in the same season is what makes it the same person.

    Anything ambiguous in either direction is rejected: one OE id matching several
    Links, or several OE ids matching one Link. Links already resolved by game id
    are left alone — that evidence is stronger.
    """
    cur = conn.cursor()

    # Leaguepedia handles -> Links. ScoreboardPlayers.Name is the handle shown in
    # that game, which PlayerRedirects often lacks (it has 'Cube1' but not 'Cube').
    lp_names: dict[str, set[str]] = defaultdict(set)
    for name, link in cur.execute(
        "SELECT Name, Link FROM scoreboard_players WHERE Name <> '' AND Link <> '' "
        "UNION SELECT AllName, OverviewPage FROM player_redirects WHERE AllName <> '' "
        "UNION SELECT ID, OverviewPage FROM players WHERE ID IS NOT NULL AND ID <> ''"
    ):
        lp_names[name.strip().lower()].add(link)

    # (year, team) each side was on.
    lp_yt: dict[str, set[tuple[int, str]]] = defaultdict(set)
    for link, year, team in cur.execute(
        "SELECT Link, CAST(substr(DateTime_UTC, 1, 4) AS INTEGER), Team "
        "FROM scoreboard_players WHERE Link <> '' AND Team <> '' AND DateTime_UTC <> ''"
    ):
        lp_yt[link].add((year, norm_team(team)))

    taken = set(mapped.values())
    candidates: dict[str, set[tuple[int, str]]] = defaultdict(set)
    for pid, year, team in cur.execute(
        "SELECT playerid, year, teamname FROM oe_player_games "
        "WHERE playerid <> '' AND teamname <> '' AND year IS NOT NULL"
    ):
        if pid not in mapped:
            candidates[pid].add((year, norm_team(team)))

    def same_roster(oe_yt: set[tuple[int, str]], link: str) -> bool:
        # Same team within a year of each other. Leaguepedia only has this player's
        # INTERNATIONAL games, so its year is whenever they happened to qualify,
        # which can sit a season away from the regional games OE has (Swift and V
        # both show up on Qiao Gu Reapers, LP in 2015 and OE from 2016). Two
        # different players sharing a handle AND an org one year apart does not happen.
        return any(ot == lt and abs(oy - ly) <= 1
                   for oy, ot in oe_yt for ly, lt in lp_yt.get(link, ()))

    hits: dict[str, str] = {}
    for pid, oe_yt in candidates.items():
        name = (names.get(pid) or "").strip().lower()
        if not name:
            continue
        confirmed = [link for link in lp_names.get(name, ())
                     if link not in taken and same_roster(oe_yt, link)]
        if len(confirmed) == 1:               # ambiguous handle -> leave it OE-only
            hits[pid] = confirmed[0]

    # A Link claimed by more than one OE id is not resolvable either.
    claims = Counter(hits.values())
    return {pid: link for pid, link in hits.items() if claims[link] == 1}


def build_crosswalk(conn) -> None:
    """OE playerid -> Leaguepedia Link via (norm platform game id, champion)."""
    cur = conn.cursor()

    # Leaguepedia lookup: (norm ppid, norm champion) -> Link
    lp = {}
    lp_ppids = set()
    for ppid, champ, link in cur.execute(
        "SELECT sg.RiotPlatformGameId, sp.Champion, sp.Link "
        "FROM scoreboard_players sp JOIN scoreboard_games sg ON sg.GameId = sp.GameId "
        "WHERE sg.RiotPlatformGameId IS NOT NULL AND sg.RiotPlatformGameId <> '' "
        "AND sp.Link IS NOT NULL AND sp.Link <> ''"
    ):
        n = norm_id(ppid)
        lp_ppids.add(n)
        if champ:
            lp[(n, norm_id(champ))] = link

    # Vote per OE playerid, only scanning OE rows that overlap Leaguepedia.
    votes: dict[str, Counter] = defaultdict(Counter)
    names: dict[str, str] = {}
    for gnorm, champ, pid, pname in cur.execute(
        "SELECT gameid_norm, champion, playerid, playername FROM oe_player_games "
        "WHERE playerid IS NOT NULL AND playerid <> ''"
    ):
        if pid not in names and pname:
            names[pid] = pname
        if gnorm in lp_ppids and champ:
            link = lp.get((gnorm, norm_id(champ)))
            if link:
                votes[pid][link] += 1

    # Track A result: the game-id majority vote.
    by_gameid = {pid: v.most_common(1)[0][0] for pid, v in votes.items()}
    # Track B: recover what the game ids could not reach (see recover_by_name).
    by_name = recover_by_name(conn, by_gameid, names)

    # Every distinct OE playerid gets a row (link NULL when OE-only).
    all_pids = [r[0] for r in cur.execute(
        "SELECT DISTINCT playerid FROM oe_player_games WHERE playerid IS NOT NULL AND playerid <> ''")]
    rows = []
    for pid in all_pids:
        v = votes.get(pid)
        if v:
            link, n = v.most_common(1)[0]
            rows.append((pid, link, names.get(pid), n, sum(v.values()) - n, "gameid"))
        elif pid in by_name:
            rows.append((pid, by_name[pid], names.get(pid), 0, 0, "name"))
        else:
            rows.append((pid, None, names.get(pid), 0, 0, None))
    conn.execute("DELETE FROM oe_player_link")
    conn.executemany(
        "INSERT OR REPLACE INTO oe_player_link "
        "(playerid, link, playername, n_games, n_conflicts, method) VALUES (?, ?, ?, ?, ?, ?)", rows)
    conn.commit()
    mapped = len(by_gameid) + len(by_name)
    print(f"  crosswalk: {len(all_pids):,} OE players | {mapped:,} mapped to a Leaguepedia Link "
          f"({len(by_gameid):,} by game id + {len(by_name):,} recovered by handle+roster) "
          f"| {len(all_pids) - mapped:,} OE-only")


def summary(conn) -> None:
    cur = conn.cursor()
    npg = cur.execute("SELECT COUNT(*) FROM oe_player_games").fetchone()[0]
    ngames = cur.execute("SELECT COUNT(DISTINCT gameid) FROM oe_player_games").fetchone()[0]
    nleagues = cur.execute("SELECT COUNT(DISTINCT league) FROM oe_player_games").fetchone()[0]
    overlap = cur.execute(
        "SELECT COUNT(DISTINCT gameid_norm) FROM oe_player_games WHERE gameid_norm IN "
        "(SELECT REPLACE(REPLACE(UPPER(RiotPlatformGameId),'_',''),'-','') FROM scoreboard_games "
        " WHERE RiotPlatformGameId IS NOT NULL)").fetchone()[0]
    print("\n=== OE silver summary ===")
    print(f"  player-game rows : {npg:,}")
    print(f"  distinct games   : {ngames:,}")
    print(f"  leagues          : {nleagues}")
    print(f"  games overlapping Leaguepedia (to dedup) : {overlap:,}")
    conf = cur.execute("SELECT COUNT(*) FROM oe_player_link WHERE n_conflicts > 0").fetchone()[0]
    print(f"  crosswalk mappings with conflicts        : {conf}")
    # Residual risk: an OE-only player sharing a handle with a Leaguepedia player is
    # either a genuinely different person (there are three unrelated 'Fury's) or an
    # identity we failed to merge, in which case they show up twice in the gold layer.
    # Neither case is fixable from the data we have — report it rather than hide it.
    dupes, dupe_games = cur.execute(
        "SELECT COUNT(*), COALESCE(SUM(games), 0) FROM ("
        "  SELECT pl.playername AS n, COUNT(*) AS games FROM oe_player_link pl"
        "  JOIN oe_player_games g ON g.playerid = pl.playerid"
        "  JOIN oe_leagues l ON l.league = g.league"
        "  WHERE pl.link IS NULL AND pl.playername IS NOT NULL GROUP BY pl.playerid)"
        " WHERE LOWER(n) IN (SELECT LOWER(display_id) FROM player_index)").fetchone()
    print(f"  OE-only handles colliding with a LP player: {dupes} ({dupe_games:,} games) "
          f"— unresolved identities or genuine namesakes")

    print("\n  allowlisted coverage (what the gold layer will aggregate):")
    print(f"    {'region':<16} {'games':>7} {'players':>8} {'complete':>9}  leagues")
    for region_label, n_games, n_players, pct, leagues in cur.execute(
        "SELECT l.region_label, COUNT(DISTINCT g.gameid), COUNT(DISTINCT g.playerid), "
        "       ROUND(100.0 * SUM(g.datacompleteness = 'complete') / COUNT(*)), "
        "       GROUP_CONCAT(DISTINCT g.league) "
        "FROM oe_player_games g JOIN oe_leagues l ON l.league = g.league "
        "GROUP BY l.scope, l.region ORDER BY l.scope, COUNT(DISTINCT g.gameid) DESC"
    ):
        print(f"    {region_label:<16} {n_games:>7,} {n_players:>8,} {pct:>8.0f}%  {leagues}")
    tot_games, tot_players = cur.execute(
        "SELECT COUNT(DISTINCT g.gameid), COUNT(DISTINCT g.playerid) FROM oe_player_games g "
        "JOIN oe_leagues l ON l.league = g.league").fetchone()
    print(f"    {'TOTAL':<16} {tot_games:>7,} {tot_players:>8,}   "
          f"({100 * tot_games // ngames}% of the {ngames:,} OE games)")
    print("\n  spot-check (known players -> mapped Link, support):")
    for pid, link, pname, ng, nc in cur.execute(
        "SELECT playerid, link, playername, n_games, n_conflicts FROM oe_player_link "
        "WHERE link IN ('Faker','Chovy','Zeus (Choi Woo-je)','Keria','Ruler (Park Jae-hyuk)') "
        "ORDER BY n_games DESC LIMIT 12"):
        print(f"    {pname:<16} -> {link:<28} ({ng} games, {nc} conflicts)")


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest Oracle's Elixir CSVs into the silver layer.")
    ap.add_argument("--years", help="comma-separated years to load (default: all CSVs present)")
    ap.add_argument("--no-load", action="store_true", help="skip CSV load, only (re)build the crosswalk")
    args = ap.parse_args()
    years = set(args.years.split(",")) if args.years else None

    conn = db.connect()
    db.apply_schema(conn)
    # apply_schema only runs CREATE TABLE IF NOT EXISTS, so a column added to an
    # existing table needs this. Idempotent.
    if "method" not in {r[1] for r in conn.execute("PRAGMA table_info(oe_player_link)")}:
        conn.execute("ALTER TABLE oe_player_link ADD COLUMN method TEXT")
        conn.commit()
    if not args.no_load:
        print("Loading OE CSVs...")
        load_csvs(conn, years)
    print("Syncing the league allowlist...")
    sync_leagues(conn)
    print("Building identity crosswalk...")
    build_crosswalk(conn)
    summary(conn)
    conn.close()


if __name__ == "__main__":
    main()
