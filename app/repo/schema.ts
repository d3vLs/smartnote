import { getDb } from './db';

/**
 * migrate:
 * - Creates tables/indexes if they don't already exist.
 * - Adds an AFTER UPDATE trigger to maintain updatedAt on Notes.
 *
 * Schema overview
 * - Folders: container for notes; name unique.
 * - Notes: core entity storing title, optional content, JSON-encoded strokes, and optional folder.
 * - Tags: catalog of unique tag names.
 * - NoteTags: many-to-many link between Notes and Tags with composite PK.
 *
 * Design choices
 * - strokes TEXT holds JSON (array of items) to keep the DB simple; heavy editing stays in memory.
 * - folderId is nullable; ON DELETE SET NULL preserves notes if a folder is deleted.
 * - ON DELETE CASCADE on NoteTags ensures link rows are cleaned up automatically.
 */
export function migrate() {
  const db = getDb();

  // Core tables and supporting indexes
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
    strokes    TEXT, -- JSON blob of canvas items (strokes + text)
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

  // Maintain updatedAt on any UPDATE to Notes
  db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_notes_updatedAt
  AFTER UPDATE ON Notes
  FOR EACH ROW
  BEGIN
    UPDATE Notes SET updatedAt = CURRENT_TIMESTAMP WHERE noteId = NEW.noteId;
  END;
  `);
}
