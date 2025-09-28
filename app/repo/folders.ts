// app/repo/folders.ts
import { getDb } from './db';

export class FolderRepository {
  private db = getDb();

  list() {
    return this.db.prepare('SELECT folderId, name, createdAt FROM Folders ORDER BY name').all() as {
      folderId: number;
      name: string;
      createdAt: string;
    }[];
  }
  create(nameRaw: string) {
    const name = nameRaw.trim();
    const stmt = this.db.prepare('INSERT INTO Folders(name) VALUES (?)');
    return stmt.run(name).lastInsertRowid as number;
  }
  rename(folderId: number, nameRaw: string) {
    const name = nameRaw.trim();
    this.db.prepare('UPDATE Folders SET name = ? WHERE folderId = ?').run(name, folderId);
  }
  remove(folderId: number) {
    // ON DELETE SET NULL will preserve notes
    this.db.prepare('DELETE FROM Folders WHERE folderId = ?').run(folderId);
  }
}
