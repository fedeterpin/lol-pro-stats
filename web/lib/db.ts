// Read-only access to the SQLite built by the ETL. Opens a fresh connection per
// call so the dev server reflects new data as the ETL/view refreshes.
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH =
  process.env.SITE_DB_PATH ??
  path.join(process.cwd(), "..", "data", "site.sqlite");

function withDb<T>(fn: (db: Database.Database) => T, fallback: T): T {
  if (!fs.existsSync(DB_PATH)) return fallback;
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    return fn(db);
  } catch {
    return fallback;
  } finally {
    db.close();
  }
}

// --- Leaderboards ---------------------------------------------------------
export interface LeaderboardRow {
  rank: number;
  player_id: string;
  display_id: string;
  slug: string | null;
  value: number;
  games: number | null;
}

export function getLeaderboard(stat: string, scope = "all", limit = 100): LeaderboardRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT l.rank, l.player_id, l.display_id, pi.slug, l.value, l.games
           FROM leaderboards l
           LEFT JOIN player_index pi ON pi.player_id = l.player_id
           WHERE l.stat = ? AND l.scope = ?
           ORDER BY l.rank LIMIT ?`,
        )
        .all(stat, scope, limit) as LeaderboardRow[],
    [],
  );
}

// --- Records --------------------------------------------------------------
export interface RecordRow {
  record_key: string;
  label: string;
  ref_id: string;
  display_id: string;
  slug: string | null;
  value: number;
  context: string;
}

export function getRecords(): RecordRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT r.record_key, r.label, r.ref_id, r.display_id, pi.slug, r.value, r.context
           FROM records r LEFT JOIN player_index pi ON pi.player_id = r.ref_id`,
        )
        .all() as RecordRow[],
    [],
  );
}

// --- Players --------------------------------------------------------------
export interface PlayerRow {
  player_id: string;
  display_id: string;
  slug: string;
  name: string | null;
  role: string | null;
  country: string | null;
  team: string | null;
  is_retired: number | null;
  games: number;
  wins: number;
  kda: number;
  win_rate: number;
  intl_titles: number;
  worlds_titles: number;
}

export function listPlayers(limit = 2000): PlayerRow[] {
  return withDb(
    (db) =>
      db
        .prepare(`SELECT * FROM player_index ORDER BY games DESC LIMIT ?`)
        .all(limit) as PlayerRow[],
    [],
  );
}

export function getPlayerBySlug(slug: string): PlayerRow | null {
  return withDb(
    (db) =>
      (db.prepare(`SELECT * FROM player_index WHERE slug = ?`).get(slug) as PlayerRow) ??
      null,
    null,
  );
}

export interface ChampionPoolRow {
  champion: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
}

export function getPlayerChampions(playerId: string, limit = 12): ChampionPoolRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT champion, games, wins, kills, deaths, assists, kda
           FROM player_champions WHERE player_id = ?
           ORDER BY games DESC, wins DESC LIMIT ?`,
        )
        .all(playerId, limit) as ChampionPoolRow[],
    [],
  );
}

export interface TitleRow {
  overview_page: string;
  event: string;
  league: string;
  year: string;
}

export function getPlayerTitles(playerId: string): TitleRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT overview_page, event, league, year FROM player_titles
           WHERE player_id = ? ORDER BY year DESC, league`,
        )
        .all(playerId) as TitleRow[],
    [],
  );
}

export interface RankingRow {
  stat: string;
  scope: string;
  rank: number;
  value: number;
  games: number | null;
}

// Boards where this player finishes near the top ("records held" / notable ranks).
export function getPlayerRankings(playerId: string, maxRank = 20): RankingRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT stat, scope, rank, value, games FROM leaderboards
           WHERE player_id = ? AND rank <= ? ORDER BY rank, stat`,
        )
        .all(playerId, maxRank) as RankingRow[],
    [],
  );
}

// --- Champions ------------------------------------------------------------
export interface ChampionStatRow {
  champion: string;
  games: number;
  wins: number;
  win_rate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  n_players: number;
}

export function getChampionStats(minGames = 1, limit = 300): ChampionStatRow[] {
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT * FROM champion_stats WHERE games >= ? ORDER BY games DESC LIMIT ?`,
        )
        .all(minGames, limit) as ChampionStatRow[],
    [],
  );
}

export function getMeta(key: string): string | null {
  return withDb((db) => {
    const row = db.prepare(`SELECT value FROM etl_meta WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }, null);
}
