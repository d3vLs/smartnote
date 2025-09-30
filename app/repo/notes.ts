import { getDb } from './db';
import type { NoteRow } from '../common/types';

/**
 * Upsert payload for a note:
 * - noteId present → UPDATE
 * - noteId absent → INSERT
 * strokesJSON is a serialized JSON string of canvas items (or null for text-only).
 */
export interface UpsertNoteInput {
  noteId?: number;
  title: string;
  content?: string | null;
  strokesJSON?: string | null;
  folderId?: number | null;
}

/**
 * NoteRepository
 * - Synchronous data access (better-sqlite3) for main process.
 * - Complex flows (validation, tag creation) belong in a service layer;
 *   this repository focuses on SQL operations.
 */
export class NoteRepository {
  private db = getDb();

  /**
   * Insert or update a note within an existing transaction.
   * - Returns the effective noteId (existing or newly inserted).
   * - Always updates updatedAt to CURRENT_TIMESTAMP.
   */
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

  /**
   * Replace the set of tags linked to a note (idempotent via OR IGNORE).
   * Call within the same transaction as upsertNote for atomicity.
   */
  setNoteTags(tx: any, noteId: number, tagIds: number[]) {
    tx.prepare('DELETE FROM NoteTags WHERE noteId = ?').run(noteId);
    const ins = tx.prepare('INSERT OR IGNORE INTO NoteTags(noteId, tagId) VALUES (?, ?)');
    for (const tagId of tagIds) ins.run(noteId, tagId);
  }

  /**
   * Get a single note with its tagNames (sorted).
   * Returns undefined if not found.
   */
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

  /**
   * Search notes by:
   * - q: case-insensitive LIKE on title or content (escaped %, _)
   * - folderId: exact match (nullable → no filter, undefined → no filter)
   * - tagNames: AND semantics (note must have all provided tags), using an intersection pattern
   * - limit/offset: pagination
   *
   * Rows are ordered by recency (updatedAt if set, otherwise createdAt).
   */
  search(q?: string, folderId?: number | null, tagNames?: string[], limit = 50, offset = 0) {
    const clauses: string[] = [];
    const params: any[] = [];

    // Title/content LIKE, escaping % and _
    if (q && q.trim()) {
      clauses.push("(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')");
      const pat = `%${q.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      params.push(pat, pat);
    }

    // Folder filter (explicit null means "No Folder", but here null/undefined both mean "no filter")
    if (folderId !== undefined && folderId !== null) {
      clauses.push('folderId = ?');
      params.push(folderId);
    }

    // Base select; join with tags only if tagNames provided
    let base = `SELECT n.noteId, n.title, n.updatedAt
                FROM Notes n`;

    if (tagNames && tagNames.length) {
      // Normalize to lower-case to match UI behavior; Tags.name stored as unique (case-sensitive by default collations)
      const normalized = tagNames.map((t) => t.trim().toLowerCase());
      const placeholders = normalized.map(() => '?').join(',');

      // Intersection: join tags filtered by IN list, group by note, require count = number of distinct names
      base += `
      JOIN NoteTags nt ON nt.noteId = n.noteId
      JOIN Tags t ON t.tagId = nt.tagId AND lower(t.name) IN (${placeholders})
      `;
      params.push(...normalized);
      base += ` GROUP BY n.noteId HAVING COUNT(DISTINCT lower(t.name)) = ${normalized.length}`;
    }

    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const order = ` ORDER BY COALESCE(n.updatedAt, n.createdAt) DESC`;
    const limitSql = ` LIMIT ? OFFSET ?`;

    const rows = this.db.prepare(base + where + order + limitSql).all(...params, limit, offset);
    return rows as { noteId: number; title: string; updatedAt?: string | null }[];
  }
}
