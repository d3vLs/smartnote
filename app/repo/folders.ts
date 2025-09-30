// app/repo/folders.ts
import { getDb } from './db';

/**
 * FolderRepository
 * - Thin data-access layer for Folders.
 * - All methods are synchronous (better-sqlite3), called from the main process.
 * - Business rules (e.g., preventing duplicate names) can be enforced here or at a higher service layer.
 */
export class FolderRepository {
  private db = getDb();

  /** List all folders ordered by name (used to populate the dropdown and sidebar). */
  list() {
    return this.db.prepare('SELECT folderId, name, createdAt FROM Folders ORDER BY name').all() as {
      folderId: number;
      name: string;
      createdAt: string;
    }[];
  }

  /** Create a folder with a trimmed unique name; returns the new folderId. */
  create(nameRaw: string) {
    const name = nameRaw.trim();
    const stmt = this.db.prepare('INSERT INTO Folders(name) VALUES (?)');
    return stmt.run(name).lastInsertRowid as number;
  }

  /** Rename a folder (no-op if name is identical). */
  rename(folderId: number, nameRaw: string) {
    const name = nameRaw.trim();
    this.db.prepare('UPDATE Folders SET name = ? WHERE folderId = ?').run(name, folderId);
  }

  /**
   * Remove a folder.
   * - Notes keep their data: schema uses ON DELETE SET NULL so affected notes move to "No Folder".
   */
  remove(folderId: number) {
    this.db.prepare('DELETE FROM Folders WHERE folderId = ?').run(folderId);
  }
}
