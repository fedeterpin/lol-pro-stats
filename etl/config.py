"""Configuración del ETL: specs de tablas Cargo -> SQLite, tiers y constantes.

Las columnas SQLite de la capa silver se llaman igual que los campos de Cargo,
así el loader inserta los row-dicts sin mapeo. Ver db/schema.sql.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# --- Rutas ---------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
DB_PATH = DATA_DIR / "site.sqlite"
SCHEMA_PATH = ROOT / "db" / "schema.sql"
STATE_PATH = ROOT / "etl" / "state" / "watermarks.json"


# --- Carga de .env (sin dependencias) ------------------------------------
def load_dotenv(path: Path = ROOT / ".env") -> list[str]:
    """Puebla os.environ desde un .env en la raíz. Tolera 'export', comillas,
    comentarios y CRLF. No pisa variables ya definidas. Devuelve las claves cargadas."""
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

# --- API / cliente -------------------------------------------------------
WIKI = "lol"
# User-Agent descriptivo con contacto (buena ciudadanía; la API anónima limita fuerte).
USER_AGENT = "lol-pro-stats/0.1 (https://github.com/; contact: federicoterpin@gmail.com)"
# Cap por página: 500 anónimo, 5000 con cuenta de bot logueada.
PAGE_SIZE_ANON = 500
PAGE_SIZE_BOT = 5000
MIN_REQUEST_INTERVAL = 1.0   # segundos entre requests (serializar)
MAX_RETRIES = 6              # reintentos ante 'ratelimited'/'maxlag'
BACKOFF_BASE = 5.0           # segundos; backoff exponencial base*2**intento
MAX_LAG = 5                  # honrar maxlag del servidor

# --- Tiers ---------------------------------------------------------------
# Strings de League verificados en vivo (Fase 0): el Mundial es 'World Championship'
# (NO 'Worlds'); MSI es 'Mid-Season Invitational'; el nuevo evento es 'First Stand'.
# Region='International' confirmado. Rift Rivals/All-Star usan nombres por año
# (p.ej. 'All-Star 2014 Paris', 'Rift Rivals 2017 NA-EU') -> clasificar por substring.
PREMIER_LEAGUES = {"World Championship", "Mid-Season Invitational", "First Stand"}
# Substrings (lowercase) que marcan exhibición dentro de eventos internacionales.
EXHIBITION_SUBSTRINGS = ("all-star", "mid-season cup", "showmatch", "nexus blitz",
                          "legends match", "showtime")
INTERNATIONAL_REGION = "International"


def _truthy(v) -> bool:
    return str(v).strip().lower() in {"1", "yes", "true", "y", "t"}


def classify_tier(league, region, is_playoffs, is_qualifier=None, tournament_level=None) -> str:
    """Clasifica un torneo en uno de los 5 tiers. Ver plan §4.

    Premier = match exacto (drive del récord headline). El resto de eventos con
    Region='International' cae en intl_legacy salvo exhibiciones (por substring).
    Los regionales se parten por el flag IsPlayoffs.
    """
    league = (league or "").strip()
    region = (region or "").strip()
    low = league.lower()
    if league in PREMIER_LEAGUES:
        return "intl_premier"
    if region == INTERNATIONAL_REGION:
        if any(sub in low for sub in EXHIBITION_SUBSTRINGS):
            return "exhibition"
        return "intl_legacy"
    if _truthy(is_playoffs):
        return "regional_playoffs"
    return "regional_regular"


# --- Specs de tablas -----------------------------------------------------
@dataclass
class TableSpec:
    name: str                       # tabla silver en SQLite
    cargo_table: str                # tabla Cargo de origen
    fields: list[str]               # campos Cargo (== columnas SQLite)
    pk: list[str] = field(default_factory=list)
    int_fields: set[str] = field(default_factory=set)
    float_fields: set[str] = field(default_factory=set)
    bool_fields: set[str] = field(default_factory=set)
    date_field: str | None = None   # para incremental/watermark
    scope_field: str | None = None  # campo para filtrar por torneo (slice)
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
                "IsRetired", "IsSubstitute"],
        pk=["OverviewPage"],
        bool_fields={"IsRetired", "IsSubstitute"},
        scope_field="OverviewPage",   # filtrar por lista de Links
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
        pk=[],  # UNIQUE compuesto en el schema
        int_fields={"Place_Number"},
        bool_fields={"Qualified"},
        scope_field="OverviewPage",
    ),
    "tournament_players": TableSpec(
        name="tournament_players", cargo_table="TournamentPlayers",
        fields=["OverviewPage", "Team", "Link", "Player", "Role", "PageAndTeam",
                "N_PlayerInTeam", "TeamOrder"],
        pk=[],  # UNIQUE compuesto en el schema
        int_fields={"N_PlayerInTeam", "TeamOrder"},
        scope_field="OverviewPage",
    ),
}

# Orden de carga (por dependencias lógicas, no FK).
LOAD_ORDER = [
    "tournaments", "scoreboard_games", "scoreboard_players",
    "tournament_results", "tournament_players", "players", "player_redirects",
]

# Umbrales mínimos de muestra (games) por leaderboard. Ver plan §4.
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
