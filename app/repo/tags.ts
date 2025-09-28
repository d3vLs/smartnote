import { getDb } from './db';

export class TagRepository {
  private db = getDb();
  getOrCreateTagByName(nameRaw: string): number {
    const name = nameRaw.trim().toLowerCase();
    const sel = this.db.prepare('SELECT tagId FROM Tags WHERE name = ?');
    const row = sel.get(name) as { tagId: number } | undefined;
    if (row) return row.tagId;
    const ins = this.db.prepare('INSERT INTO Tags(name) VALUES (?)');
    return ins.run(name).lastInsertRowid as number;
  }
  list(): { tagId: number; name: string }[] {
    return this.db.prepare('SELECT tagId, name FROM Tags ORDER BY name').all() as any;
  }
}
