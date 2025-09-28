import { getDb } from './db';
import type { NoteRow } from '../common/types';

export interface UpsertNoteInput {
  noteId?: number;
  title: string;
  content?: string | null;
  strokesJSON?: string | null;
  folderId?: number | null;
}

export class NoteRepository {
  private db = getDb();

  upsertNote(tx: any, input: UpsertNoteInput): number {
    if (input.noteId) {
      const stmt = tx.prepare(`
        UPDATE Notes SET title = ?, content = ?, strokes = ?, folderId = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE noteId = ?
      `);
      stmt.run(
        input.title,
        input.content ?? null,
        input.strokesJSON ?? null,
        input.folderId ?? null,
        input.noteId
      );
      return input.noteId;
    } else {
      const stmt = tx.prepare(`
        INSERT INTO Notes (title, content, strokes, folderId, updatedAt)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      const res = stmt.run(
        input.title,
        input.content ?? null,
        input.strokesJSON ?? null,
        input.folderId ?? null
      );
      return res.lastInsertRowid as number;
    }
  }

  setNoteTags(tx: any, noteId: number, tagIds: number[]) {
    tx.prepare('DELETE FROM NoteTags WHERE noteId = ?').run(noteId);
    const ins = tx.prepare('INSERT OR IGNORE INTO NoteTags(noteId, tagId) VALUES (?, ?)');
    for (const tagId of tagIds) ins.run(noteId, tagId);
  }

  // get(noteId: number) {
  //   const note = this.db.prepare('SELECT * FROM Notes WHERE noteId = ?').get(noteId);
  //   if (!note) return undefined;
  //   const tags = this.db
  //     .prepare(
  //       `
  //     SELECT t.name FROM Tags t
  //     JOIN NoteTags nt ON nt.tagId = t.tagId
  //     WHERE nt.noteId = ?
  //     ORDER BY t.name
  //   `
  //     )
  //     .all(noteId)
  //     .map((r: any) => r.name);
  //   return { ...note, tagNames: tags };
  // }

  get(noteId: number): (NoteRow & { tagNames: string[] }) | undefined {
    const row = this.db
      .prepare(
        'SELECT noteId, title, content, strokes, folderId, createdAt, updatedAt FROM Notes WHERE noteId = ?'
      )
      .get(noteId) as NoteRow | undefined;
    if (!row) return undefined;
    const tagNames = (
      this.db
        .prepare(
          `SELECT t.name FROM Tags t JOIN NoteTags nt ON nt.tagId = t.tagId WHERE nt.noteId = ? ORDER BY t.name`
        )
        .all(noteId) as { name: string }[]
    ).map((r) => r.name);
    return { ...row, tagNames };
  }

  search(q?: string, folderId?: number | null, tagNames?: string[], limit = 50, offset = 0) {
    const clauses: string[] = [];
    const params: any[] = [];
    if (q && q.trim()) {
      clauses.push('(title LIKE ? OR content LIKE ?)');
      const pat = `%${q.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      params.push(pat, pat);
    }
    if (folderId !== undefined && folderId !== null) {
      clauses.push('folderId = ?');
      params.push(folderId);
    }
    let base = `SELECT n.noteId, n.title, n.updatedAt
                FROM Notes n`;
    if (tagNames && tagNames.length) {
      // AND semantics: all tags must be present -> intersect strategy
      const normalized = tagNames.map((t) => t.trim().toLowerCase());
      const placeholders = normalized.map((_) => '?').join(',');
      base += `
      JOIN NoteTags nt ON nt.noteId = n.noteId
      JOIN Tags t ON t.tagId = nt.tagId AND t.name IN (${placeholders})
      `;
      params.push(...normalized);
      base += ` GROUP BY n.noteId HAVING COUNT(DISTINCT t.name) = ${normalized.length}`;
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const order = ` ORDER BY COALESCE(n.updatedAt, n.createdAt) DESC`;
    const limitSql = ` LIMIT ? OFFSET ?`;
    const rows = this.db.prepare(base + where + order + limitSql).all(...params, limit, offset);
    return rows as { noteId: number; title: string; updatedAt?: string | null }[];
  }
}
