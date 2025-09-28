import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let db: Database.Database;

export function openDb(userDataPath: string) {
  const dbPath = path.join(userDataPath, 'smartnote.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function getDb() {
  if (!db) throw new Error('DB not opened');
  return db;
}
// export function closeDb() {
//   if (db) {
//     db.close();
//   }
// }
