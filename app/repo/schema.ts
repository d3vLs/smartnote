import { getDb } from './db';

export function migrate() {
  const db = getDb();
  db.exec(`
  CREATE TABLE IF NOT EXISTS Folders (
    folderId   INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    createdAt  DATETIME DEFAULT (CURRENT_TIMESTAMP)
  );
  CREATE TABLE IF NOT EXISTS Notes (
    noteId     INTEGER PRIMARY KEY,
    title      TEXT NOT NULL,
    content    TEXT,
    strokes    TEXT, -- JSON
    folderId   INTEGER NULL,
    createdAt  DATETIME DEFAULT (CURRENT_TIMESTAMP),
    updatedAt  DATETIME,
    FOREIGN KEY (folderId) REFERENCES Folders(folderId) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS Tags (
    tagId      INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS NoteTags (
    noteId     INTEGER NOT NULL,
    tagId      INTEGER NOT NULL,
    PRIMARY KEY (noteId, tagId),
    FOREIGN KEY (noteId) REFERENCES Notes(noteId) ON DELETE CASCADE,
    FOREIGN KEY (tagId) REFERENCES Tags(tagId) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_notes_folder ON Notes(folderId);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_name ON Tags(name);
  `);
  // Optional trigger for updatedAt
  db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_notes_updatedAt
  AFTER UPDATE ON Notes
  FOR EACH ROW
  BEGIN
    UPDATE Notes SET updatedAt = CURRENT_TIMESTAMP WHERE noteId = NEW.noteId;
  END;
  `);
}
