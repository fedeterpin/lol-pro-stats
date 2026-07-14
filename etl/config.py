"""ETL configuration: Cargo -> SQLite table specs, tiers and constants.

The silver-layer SQLite columns are named the same as the Cargo fields, so the
loader inserts the row-dicts without mapping. See db/schema.sql.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# --- Paths ---------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
DB_PATH = DATA_DIR / "site.sqlite"
SCHEMA_PATH = ROOT / "db" / "schema.sql"
STATE_PATH = ROOT / "etl" / "state" / "watermarks.json"


# --- .env loading (no dependencies) --------------------------------------
def load_dotenv(path: Path = ROOT / ".env") -> list[str]:
    """Populates os.environ from a .env in the root. Tolerates 'export', quotes,
    comments and CRLF. Does not override already-defined variables. Returns the loaded keys."""
    loaded: list[str] = []
    if not path.exists():
        return loaded
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip().lstrip("﻿")
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("export "):
            line = line[len("export "):].strip()
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, val)
            loaded.append(key)
    return loaded


load_dotenv()

# --- API / client --------------------------------------------------------
WIKI = "lol"
# Descriptive User-Agent with contact (good citizenship; the anonymous API limits hard).
USER_AGENT = "lol-pro-stats/0.1 (https://github.com/; contact: federicoterpin@gmail.com)"
# Per-page cap: 500 anonymous, 5000 with a logged-in bot account.
PAGE_SIZE_ANON = 500
PAGE_SIZE_BOT = 5000
# ADAPTIVE throttle (AIMD). Leaguepedia uses a token-bucket (~4-5) that refills slowly,
# and hitting it while you are limited EXTENDS the penalty. Hence: start from a
# conservative interval, raise it aggressively on rate-limit and lower it slowly on
# success, and on rate-limit wait QUIETLY (no eager retries). With 'noratelimit' (bot
# group) the interval goes to 0.
MIN_REQUEST_INTERVAL = 5.0   # floor of the adaptive interval (account without noratelimit)
MAX_INTERVAL = 30.0          # ceiling of the adaptive interval
MAX_RETRIES = 10             # patient: do not give up the backfill over rate-limit
RATELIMIT_COOLDOWN = 25.0    # base quiet wait on 'ratelimited' (grows per attempt)
MAX_LAG = 5                  # honor the server's maxlag

# --- Tiers ---------------------------------------------------------------
# League strings verified live (Phase 0): the World Championship is 'World Championship'
# (NOT 'Worlds'); MSI is 'Mid-Season Invitational'; the new event is 'First Stand'.
# Region='International' confirmed. Rift Rivals/All-Star use per-year names
# (e.g. 'All-Star 2014 Paris', 'Rift Rivals 2017 NA-EU') -> classify by substring.
PREMIER_LEAGUES = {"World Championship", "Mid-Season Invitational", "First Stand"}
# Substrings (lowercase) that mark an exhibition within international events.
EXHIBITION_SUBSTRINGS = ("all-star", "mid-season cup", "showmatch", "nexus blitz",
                          "legends match", "showtime")
INTERNATIONAL_REGION = "International"


def _truthy(v) -> bool:
    return str(v).strip().lower() in {"1", "yes", "true", "y", "t"}


def classify_tier(league, region, is_playoffs, is_qualifier=None, tournament_level=None) -> str:
    """Classifies a tournament into one of the 5 tiers. See plan §4.

    Premier = exact match (drives the headline record). The rest of the events with
    Region='International' fall into intl_legacy except exhibitions (by substring).
    Regional ones are split by the IsPlayoffs flag.
    """
    league = (league or "").strip()
    region = (region or "").strip()
    low = league.lower()
    is_intl = region == INTERNATIONAL_REGION
    # NOTE: Worlds qualifiers/regional finals carry League='World Championship' but a
    # regional Region (Europe/Korea/...) -> they are NOT intl_premier. Require both.
    if is_intl and league in PREMIER_LEAGUES:
        return "intl_premier"
    if is_intl:
        if any(sub in low for sub in EXHIBITION_SUBSTRINGS):
            return "exhibition"
        return "intl_legacy"
    if _truthy(is_playoffs):
        return "regional_playoffs"
    return "regional_regular"


# --- Table specs ---------------------------------------------------------
@dataclass
class TableSpec:
    name: str                       # silver table in SQLite
    cargo_table: str                # source Cargo table
    fields: list[str]               # Cargo fields (== SQLite columns)
    pk: list[str] = field(default_factory=list)
    int_fields: set[str] = field(default_factory=set)
    float_fields: set[str] = field(default_factory=set)
    bool_fields: set[str] = field(default_factory=set)
    date_field: str | None = None   # for incremental/watermark
    scope_field: str | None = None  # field to filter by tournament (slice)
    order_by: str | None = None

    @property
    def numeric_fields(self) -> set[str]:
        return self.int_fields | self.float_fields | self.bool_fields


TABLES: dict[str, TableSpec] = {
    "tournaments": TableSpec(
        name="tournaments", cargo_table="Tournaments",
        fields=["OverviewPage", "Name", "League", "Region", "Year", "TournamentLevel",
                "IsQualifier", "IsPlayoffs", "IsOfficial", "Date", "DateStart", "Split", "Prizepool"],
        pk=["OverviewPage"],
        bool_fields={"IsQualifier", "IsPlayoffs", "IsOfficial"},
        date_field="DateStart", scope_field="OverviewPage", order_by="DateStart",
    ),
    "scoreboard_games": TableSpec(
        name="scoreboard_games", cargo_table="ScoreboardGames",
        fields=["GameId", "MatchId", "OverviewPage", "Tournament", "Team1", "Team2",
                "WinTeam", "LossTeam", "Winner", "Team1Score", "Team2Score",
                "DateTime_UTC", "Gamelength_Number", "Patch", "RiotPlatformGameId", "RiotGameId"],
        pk=["GameId"],
        int_fields={"Winner", "Team1Score", "Team2Score"},
        float_fields={"Gamelength_Number"},
        date_field="DateTime_UTC", scope_field="OverviewPage", order_by="DateTime_UTC",
    ),
    "scoreboard_players": TableSpec(
        name="scoreboard_players", cargo_table="ScoreboardPlayers",
        fields=["UniqueLine", "Link", "Name", "Champion", "Kills", "Deaths", "Assists",
                "Gold", "CS", "DamageToChampions", "VisionScore", "Role", "Role_Number",
                "Side", "Team", "TeamKills", "PlayerWin", "DateTime_UTC", "Tournament",
                "OverviewPage", "GameId", "MatchId"],
        pk=["UniqueLine"],
        int_fields={"Kills", "Deaths", "Assists", "Gold", "CS", "DamageToChampions",
                    "VisionScore", "Role_Number", "Side", "TeamKills"},
        date_field="DateTime_UTC", scope_field="OverviewPage", order_by="DateTime_UTC",
    ),
    "players": TableSpec(
        name="players", cargo_table="Players",
        fields=["OverviewPage", "ID", "Name", "NativeName", "Country", "Nationality",
                "NationalityPrimary", "Residency", "Role", "Team", "Birthdate",
                "IsRetired", "IsSubstitute", "Image"],
        pk=["OverviewPage"],
        bool_fields={"IsRetired", "IsSubstitute"},
        scope_field="OverviewPage",   # filter by list of Links
    ),
    "player_redirects": TableSpec(
        name="player_redirects", cargo_table="PlayerRedirects",
        fields=["AllName", "OverviewPage", "ID"],
        pk=["AllName"],
        scope_field="OverviewPage",
    ),
    "tournament_results": TableSpec(
        name="tournament_results", cargo_table="TournamentResults",
        fields=["OverviewPage", "Event", "Place", "Place_Number", "Team", "RosterPage",
                "PageAndTeam", "Prize", "Qualified"],
        pk=[],  # composite UNIQUE in the schema
        int_fields={"Place_Number"},
        bool_fields={"Qualified"},
        scope_field="OverviewPage",
    ),
    "tournament_players": TableSpec(
        name="tournament_players", cargo_table="TournamentPlayers",
        fields=["OverviewPage", "Team", "Link", "Player", "Role", "PageAndTeam",
                "N_PlayerInTeam", "TeamOrder"],
        pk=[],  # composite UNIQUE in the schema
        int_fields={"N_PlayerInTeam", "TeamOrder"},
        scope_field="OverviewPage",
    ),
}

# Load order (by logical dependencies, not FK).
LOAD_ORDER = [
    "tournaments", "scoreboard_games", "scoreboard_players",
    "tournament_results", "tournament_players", "players", "player_redirects",
]

# Minimum sample thresholds (games) per leaderboard. See plan §4.
THRESHOLDS = {
    "career_kda": 200,
    "career_kda_intl": 30,
    "win_rate": 200,
    "single_tournament_kda": 5,
    "champion_win_rate": 15,
}

ATTRIBUTION = {
    "leaguepedia": "Data: Leaguepedia (lol.fandom.com), CC BY-SA 4.0",
    "oracles_elixir": "Data courtesy of Oracle's Elixir (Tim Sevenhuysen)",
}
