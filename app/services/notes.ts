import { NoteRepository } from '../repo/notes';
import { TagRepository } from '../repo/tags';
import type { SaveNoteInput, NoteDTO, Stroke, NoteRow } from '../common/types';

export class NoteService {
  constructor(
    private notes = new NoteRepository(),
    private tags = new TagRepository()
  ) {}

  save(input: SaveNoteInput): number {
    if (!input.title || !input.title.trim()) throw new Error('Title required');
    const strokesJSON = JSON.stringify(input.strokes ?? []);
    const db = (require('../repo/db') as any).getDb();
    const tx = db.transaction((fn: Function) => fn());
    let noteId = -1;
    tx(() => {
      noteId = this.notes.upsertNote(db, {
        noteId: input.noteId,
        title: input.title.trim(),
        content: input.content ?? null,
        strokesJSON,
        folderId: input.folderId ?? null,
      });
      const tagIds = (input.tagNames ?? []).map((n) => this.tags.getOrCreateTagByName(n));
      this.notes.setNoteTags(db, noteId, tagIds);
    });
    return noteId;
  }

  get(noteId: number): NoteDTO | undefined {
    const row = this.notes.get(noteId) as (NoteRow & { tagNames: string[] }) | undefined;
    if (!row) return undefined;

    let strokes: Stroke[] = [];
    try {
      strokes = row.strokes ? (JSON.parse(row.strokes) as Stroke[]) : [];
    } catch {
      strokes = [];
    }

    return {
      noteId: row.noteId,
      title: row.title,
      content: row.content ?? null,
      strokes,
      folderId: row.folderId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt ?? null,
    };
  }

  search(criteria: {
    q?: string;
    folderId?: number | null;
    tagIds?: number[];
    tagNames?: string[];
  }) {
    const db = (require('../repo/db') as any).getDb();

    const params: any[] = [];
    const whereParts: string[] = [];
    let joinTags = false;

    // Folder constraint
    if (criteria.folderId !== undefined) {
      if (criteria.folderId === null) {
        whereParts.push('n.folderId IS NULL');
      } else {
        whereParts.push('n.folderId = ?');
        params.push(criteria.folderId);
      }
    }

    // Text query: title/content
    const q = criteria.q?.trim().toLowerCase();
    if (q) {
      whereParts.push('(LOWER(n.title) LIKE ? OR LOWER(n.content) LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like);
    }

    // Text query also matches tag names
    if (q) {
      joinTags = true;
      // Wrap text matching in OR to not over-constrain results
      // Combine with existing whereParts by pushing an OR-able clause.
      // Easiest is to add another disjunct and later rewrap where.
      // To keep it simple, just add another condition; we’ll OR group everything below.
    }

    // Explicit tag filters by ids
    if (criteria.tagIds && criteria.tagIds.length) {
      joinTags = true;
      whereParts.push(`nt.tagId IN (${criteria.tagIds.map(() => '?').join(',')})`);
      params.push(...criteria.tagIds);
    }

    // Explicit tag filters by names
    if (criteria.tagNames && criteria.tagNames.length) {
      joinTags = true;
      whereParts.push(`LOWER(t.name) IN (${criteria.tagNames.map(() => '?').join(',')})`);
      params.push(...criteria.tagNames.map((s) => s.toLowerCase()));
    }

    // Build OR group for the free-text: title/content OR tag name
    let textOrClause = '';
    if (q) {
      joinTags = true;
      textOrClause = '(LOWER(n.title) LIKE ? OR LOWER(n.content) LIKE ? OR LOWER(t.name) LIKE ?)';
      const like = `%${q}%`;
      // Push these after other params so order matches placeholders in final SQL
      // We will concatenate this OR group at the front of WHERE with AND around the rest
      // To avoid double-adding the like values, remove earlier push for q or rebuild:
      // Rebuild full params cleanly:
      // For simplicity, rebuild params/where now:

      // Rebuild cleanly:
      const rebuiltWhere: string[] = [];
      const rebuiltParams: any[] = [];

      // Folder
      if (criteria.folderId !== undefined) {
        if (criteria.folderId === null) {
          rebuiltWhere.push('n.folderId IS NULL');
        } else {
          rebuiltWhere.push('n.folderId = ?');
          rebuiltParams.push(criteria.folderId);
        }
      }

      // Tag id/name specific filters
      if (criteria.tagIds && criteria.tagIds.length) {
        rebuiltWhere.push(`nt.tagId IN (${criteria.tagIds.map(() => '?').join(',')})`);
        rebuiltParams.push(...criteria.tagIds);
      }
      if (criteria.tagNames && criteria.tagNames.length) {
        rebuiltWhere.push(`LOWER(t.name) IN (${criteria.tagNames.map(() => '?').join(',')})`);
        rebuiltParams.push(...criteria.tagNames.map((s) => s.toLowerCase()));
      }

      // Now prepend the OR text group
      const like2 = `%${q}%`;
      const like3 = `%${q}%`;
      const likeTag = `%${q}%`;

      const finalWhere = (textOrClause ? [textOrClause] : []).concat(rebuiltWhere);

      const sql = `
        SELECT n.noteId, n.title, n.content, n.updatedAt, n.folderId
        FROM Notes n
        ${joinTags ? 'LEFT JOIN NoteTags nt ON nt.noteId = n.noteId LEFT JOIN Tags t ON t.tagId = nt.tagId' : ''}
        ${finalWhere.length ? 'WHERE ' + finalWhere.join(' AND ') : ''}
        GROUP BY n.noteId
        ORDER BY n.updatedAt DESC
      `;

      // Params: for OR clause first, then rebuilt filters
      const finalParams = textOrClause ? [like2, like3, likeTag, ...rebuiltParams] : rebuiltParams;

      return db.prepare(sql).all(...finalParams);
    }

    // If no q, use the original params/whereParts (folder/tags filters only)
    const sql = `
      SELECT n.noteId, n.title, n.content, n.updatedAt, n.folderId
      FROM Notes n
      ${joinTags ? 'LEFT JOIN NoteTags nt ON nt.noteId = n.noteId LEFT JOIN Tags t ON t.tagId = nt.tagId' : ''}
      ${whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : ''}
      GROUP BY n.noteId
      ORDER BY n.updatedAt DESC
    `;
    return db.prepare(sql).all(...params);
  }
}
