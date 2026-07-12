// Acceso de solo lectura a la SQLite construida por el ETL. Se usa en build time
// (SSG) y en el dev server. Abre una conexión FRESCA por llamada para reflejar los
// datos nuevos cuando el ETL/vista se actualiza (modo "watch"); tolera DB ausente.
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
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT rank, player_id, display_id, value, games
           FROM leaderboards WHERE stat = ? AND scope = ?
           ORDER BY rank LIMIT ?`,
        )
        .all(stat, scope, limit) as LeaderboardRow[],
    [],
  );
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
  return withDb(
    (db) =>
      db
        .prepare(
          `SELECT record_key, label, ref_id, display_id, value, context FROM records`,
        )
        .all() as RecordRow[],
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
