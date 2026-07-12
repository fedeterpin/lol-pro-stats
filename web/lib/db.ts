// Acceso de solo lectura a la SQLite construida por el ETL. Se usa SOLO en build
// time (server components / generateStaticParams), nunca en el cliente.
import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH =
  process.env.SITE_DB_PATH ??
  path.join(process.cwd(), "..", "data", "site.sqlite");

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  }
  return _db;
}

export interface LeaderboardRow {
  rank: number;
  player_id: string;
  display_id: string;
  value: number;
  games: number | null;
}

export function getLeaderboard(
  stat: string,
  scope = "all",
  limit = 100,
): LeaderboardRow[] {
  return db()
    .prepare(
      `SELECT rank, player_id, display_id, value, games
       FROM leaderboards WHERE stat = ? AND scope = ?
       ORDER BY rank LIMIT ?`,
    )
    .all(stat, scope, limit) as LeaderboardRow[];
}

export interface RecordRow {
  record_key: string;
  label: string;
  ref_id: string;
  display_id: string;
  value: number;
  context: string;
}

export function getRecords(): RecordRow[] {
  return db()
    .prepare(`SELECT record_key, label, ref_id, display_id, value, context FROM records`)
    .all() as RecordRow[];
}

export function getMeta(key: string): string | null {
  const row = db()
    .prepare(`SELECT value FROM etl_meta WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
