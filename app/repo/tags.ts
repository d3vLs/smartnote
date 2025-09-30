import { getDb } from './db';

/**
 * TagRepository
 * - Manages the tag catalog (unique names).
 * - Names are normalized to lower-case for case-insensitive behavior across the app.
 *   Consider adding COLLATE NOCASE on the Tags.name column if you want SQLite to enforce it.
 */
export class TagRepository {
  private db = getDb();

  /**
   * Get an existing tagId for a name (case-insensitive by normalization), or create and return a new one.
   * Returns the tagId.
   */
  getOrCreateTagByName(nameRaw: string): number {
    const name = nameRaw.trim().toLowerCase();
    const sel = this.db.prepare('SELECT tagId FROM Tags WHERE name = ?');
    const row = sel.get(name) as { tagId: number } | undefined;
    if (row) return row.tagId;

    const ins = this.db.prepare('INSERT INTO Tags(name) VALUES (?)');
    return ins.run(name).lastInsertRowid as number;
  }

  /** List the entire tag catalog ordered by name (used for suggestions). */
  list(): { tagId: number; name: string }[] {
    return this.db.prepare('SELECT tagId, name FROM Tags ORDER BY name').all() as any;
  }
}
