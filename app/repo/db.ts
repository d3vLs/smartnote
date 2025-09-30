import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let db: Database.Database;

/**
 * Open (or create) the SQLite database in the app's userData directory.
 * - Ensures the parent folder exists.
 * - Enables WAL for better concurrent read performance.
 * - Enforces foreign key constraints at the connection level.
 *
 * Call once during app bootstrap (main process) before constructing repositories/services.
 */
export function openDb(userDataPath: string) {
  const dbPath = path.join(userDataPath, 'smartnote.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // better-sqlite3 is synchronous and returns a connection object
  db = new Database(dbPath);

  // Journaling + integrity; WAL improves read concurrency for desktop apps
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * Access the already-open database connection.
 * Throws if openDb hasn't been called yet (helps catch init order issues).
 */
export function getDb() {
  if (!db) throw new Error('DB not opened');
  return db;
}
