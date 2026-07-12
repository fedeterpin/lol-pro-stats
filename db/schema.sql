-- Esquema SQLite de LoL Pro Stats.
-- Capa SILVER: columnas = nombres de campo de Cargo (verbatim) para que el loader
--   pueda insertar row-dicts sin mapeo. Tipos INTEGER/REAL para coerción numérica.
-- Capa GOLD: tablas agregadas/precomputadas por el ETL (snake_case).
-- Fuente: Leaguepedia (CC-BY-SA). Ver README.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = OFF;   -- carga bulk; la integridad se garantiza en el transform

-- =====================================================================
-- SILVER
-- =====================================================================

-- Un torneo por fila. Tier se computa en el transform (tiers.py).
CREATE TABLE IF NOT EXISTS tournaments (
    OverviewPage     TEXT PRIMARY KEY,
    Name             TEXT,
    League           TEXT,
    Region           TEXT,
    Year             TEXT,
    TournamentLevel  TEXT,
    IsQualifier      INTEGER,
    IsPlayoffs       INTEGER,
    IsOfficial       INTEGER,
    Date             TEXT,
    DateStart        TEXT,
    Split            TEXT,
    Prizepool        TEXT,
    Tier             TEXT     -- derivado: intl_premier|intl_legacy|regional_playoffs|regional_regular|exhibition
);
CREATE INDEX IF NOT EXISTS idx_tournaments_league ON tournaments(League);
CREATE INDEX IF NOT EXISTS idx_tournaments_tier   ON tournaments(Tier);
CREATE INDEX IF NOT EXISTS idx_tournaments_year   ON tournaments(Year);

-- Un juego por fila.
CREATE TABLE IF NOT EXISTS scoreboard_games (
    GameId             TEXT PRIMARY KEY,
    MatchId            TEXT,
    OverviewPage       TEXT,
    Tournament         TEXT,
    Team1              TEXT,
    Team2              TEXT,
    WinTeam            TEXT,
    LossTeam           TEXT,
    Winner             INTEGER,
    Team1Score         INTEGER,
    Team2Score         INTEGER,
    DateTime_UTC       TEXT,
    Gamelength_Number  REAL,
    Patch              TEXT,
    RiotPlatformGameId TEXT,   -- join a Oracle's Elixir (OE.gameid)
    RiotGameId         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sg_overview ON scoreboard_games(OverviewPage);
CREATE INDEX IF NOT EXISTS idx_sg_riotpgid ON scoreboard_games(RiotPlatformGameId);
CREATE INDEX IF NOT EXISTS idx_sg_date     ON scoreboard_games(DateTime_UTC);

-- Un jugador por juego (tabla de hechos / espina dorsal).
CREATE TABLE IF NOT EXISTS scoreboard_players (
    UniqueLine        TEXT PRIMARY KEY,
    Link              TEXT,    -- identidad canónica del jugador (== Players.OverviewPage)
    Name              TEXT,    -- handle mostrado en ese juego (puede ser alias viejo)
    Champion          TEXT,
    Kills             INTEGER,
    Deaths            INTEGER,
    Assists           INTEGER,
    Gold              INTEGER,
    CS                INTEGER,
    DamageToChampions INTEGER,
    VisionScore       INTEGER,
    Role              TEXT,
    Role_Number       INTEGER,
    Side              INTEGER,
    Team              TEXT,
    TeamKills         INTEGER,
    PlayerWin         TEXT,    -- 'Yes'/'No' (verificar en Fase 0)
    DateTime_UTC      TEXT,
    Tournament        TEXT,
    OverviewPage      TEXT,
    GameId            TEXT,
    MatchId           TEXT
);
CREATE INDEX IF NOT EXISTS idx_sp_link     ON scoreboard_players(Link);
CREATE INDEX IF NOT EXISTS idx_sp_overview ON scoreboard_players(OverviewPage);
CREATE INDEX IF NOT EXISTS idx_sp_game     ON scoreboard_players(GameId);
CREATE INDEX IF NOT EXISTS idx_sp_champ    ON scoreboard_players(Champion);

-- Bio/roster de jugadores (identidad canónica = OverviewPage).
CREATE TABLE IF NOT EXISTS players (
    OverviewPage      TEXT PRIMARY KEY,
    ID                TEXT,    -- display ID canónico actual
    Name              TEXT,    -- nombre real
    NativeName        TEXT,
    Country           TEXT,
    Nationality       TEXT,
    NationalityPrimary TEXT,
    Residency         TEXT,
    Role              TEXT,
    Team              TEXT,
    Birthdate         TEXT,
    IsRetired         INTEGER,
    IsSubstitute      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_players_id ON players(ID);

-- Mapa alias -> canónico (resolución de identidad).
CREATE TABLE IF NOT EXISTS player_redirects (
    AllName      TEXT PRIMARY KEY,   -- todo alias/handle/variante
    OverviewPage TEXT,               -- Players.OverviewPage canónico
    ID           TEXT
);
CREATE INDEX IF NOT EXISTS idx_pr_overview ON player_redirects(OverviewPage);

-- Placements/ganadores por torneo. Sin PK natural de un campo -> rowid + UNIQUE compuesto.
CREATE TABLE IF NOT EXISTS tournament_results (
    OverviewPage TEXT,
    Event        TEXT,
    Place        TEXT,
    Place_Number INTEGER,
    Team         TEXT,
    RosterPage   TEXT,
    PageAndTeam  TEXT,
    Prize        TEXT,
    Qualified    INTEGER,
    UNIQUE(OverviewPage, Place, Team)
);
CREATE INDEX IF NOT EXISTS idx_tr_overview ON tournament_results(OverviewPage);
CREATE INDEX IF NOT EXISTS idx_tr_place    ON tournament_results(Place_Number);

-- Jugadores participantes por evento (roster).
CREATE TABLE IF NOT EXISTS tournament_players (
    OverviewPage    TEXT,
    Team            TEXT,
    Link            TEXT,   -- == Players.OverviewPage
    Player          TEXT,
    Role            TEXT,
    PageAndTeam     TEXT,
    N_PlayerInTeam  INTEGER,
    TeamOrder       INTEGER,
    UNIQUE(OverviewPage, Team, Link)
);
CREATE INDEX IF NOT EXISTS idx_tp_overview ON tournament_players(OverviewPage);
CREATE INDEX IF NOT EXISTS idx_tp_link     ON tournament_players(Link);
CREATE INDEX IF NOT EXISTS idx_tp_pat      ON tournament_players(PageAndTeam);

-- =====================================================================
-- GOLD (precomputado por transform/aggregate)
-- =====================================================================

-- Stats de carrera por jugador (grano: player_id[, scope]).
CREATE TABLE IF NOT EXISTS player_career_stats (
    player_id   TEXT NOT NULL,   -- == Link / Players.OverviewPage
    scope       TEXT NOT NULL,   -- 'all' | 'intl_premier' | tier | rol...
    display_id  TEXT,            -- ID canónico para mostrar
    games       INTEGER,
    wins        INTEGER,
    losses      INTEGER,
    kills       INTEGER,
    deaths      INTEGER,
    assists     INTEGER,
    kda         REAL,            -- (kills+assists)/max(deaths,1)
    win_rate    REAL,
    PRIMARY KEY (player_id, scope)
);

-- Leaderboards rankeados y precomputados (una fila por posición de un board).
CREATE TABLE IF NOT EXISTS leaderboards (
    stat        TEXT NOT NULL,   -- 'career_kda' | 'games_played' | 'career_kills' | 'win_rate' | 'intl_titles' | 'worlds_titles'
    scope       TEXT NOT NULL,   -- 'all' | 'intl_premier' | rol | ...
    rank        INTEGER NOT NULL,
    player_id   TEXT NOT NULL,
    display_id  TEXT,
    value       REAL,            -- valor de la métrica (para conteos, entero en REAL)
    games       INTEGER,         -- muestra (para mostrar el umbral inline)
    PRIMARY KEY (stat, scope, rank)
);
CREATE INDEX IF NOT EXISTS idx_lb_player ON leaderboards(player_id);

-- Récords singleton ("record book"): el top-1 de cada récord con su contexto.
CREATE TABLE IF NOT EXISTS records (
    record_key  TEXT PRIMARY KEY,   -- 'most_intl_titles' | 'best_worlds_kda' | ...
    label       TEXT,
    ref_id      TEXT,               -- player_id (o game/tournament id) que ostenta el récord
    display_id  TEXT,
    value       REAL,
    context     TEXT                -- JSON con detalle (torneo, fecha, games, umbral)
);

-- Índice de jugadores (denormalizado): resolución de slug + header + lista/buscador.
CREATE TABLE IF NOT EXISTS player_index (
    player_id     TEXT PRIMARY KEY,   -- == Link
    display_id    TEXT,
    slug          TEXT,               -- para la URL /players/<slug>
    name          TEXT,               -- nombre real
    role          TEXT,
    country       TEXT,
    team          TEXT,
    is_retired    INTEGER,
    games         INTEGER,
    wins          INTEGER,
    kda           REAL,
    win_rate      REAL,
    intl_titles   INTEGER,
    worlds_titles INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pidx_slug  ON player_index(slug);
CREATE INDEX IF NOT EXISTS idx_pidx_games ON player_index(games);

-- Pool de campeones por jugador (para la página de jugador y récords de campeón).
CREATE TABLE IF NOT EXISTS player_champions (
    player_id TEXT,
    champion  TEXT,
    games     INTEGER,
    wins      INTEGER,
    kills     INTEGER,
    deaths    INTEGER,
    assists   INTEGER,
    kda       REAL,
    PRIMARY KEY (player_id, champion)
);
CREATE INDEX IF NOT EXISTS idx_pchamp_player ON player_champions(player_id);

-- Títulos internacionales ganados por jugador (vitrina de trofeos).
CREATE TABLE IF NOT EXISTS player_titles (
    player_id     TEXT,
    overview_page TEXT,
    event         TEXT,
    league        TEXT,
    year          TEXT,
    PRIMARY KEY (player_id, overview_page)
);
CREATE INDEX IF NOT EXISTS idx_ptitles_player ON player_titles(player_id);

-- Stats por campeón (a nivel internacional): más jugados / mejor win rate.
CREATE TABLE IF NOT EXISTS champion_stats (
    champion  TEXT PRIMARY KEY,
    games     INTEGER,
    wins      INTEGER,
    win_rate  REAL,
    kills     INTEGER,
    deaths    INTEGER,
    assists   INTEGER,
    kda       REAL,
    n_players INTEGER
);

-- Metadatos del ETL (última corrida, versión de esquema, atribución).
CREATE TABLE IF NOT EXISTS etl_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
