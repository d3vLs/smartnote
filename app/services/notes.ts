import { NoteRepository } from '../repo/notes';
import { TagRepository } from '../repo/tags';
import type { SaveNoteInput, NoteDTO, Stroke, NoteRow } from '../common/types';
import { getDb } from '../repo/db';

/**
 * NoteService
 * - Orchestrates multi-step operations around notes (upsert + tags) inside a single transaction.
 * - Performs validation and DTO translation to/from repository rows.
 */
export class NoteService {
  constructor(
    private notes = new NoteRepository(),
    private tags = new TagRepository()
  ) {}

  /**
   * save:
   * - Validates title.
   * - Serializes strokes to JSON (renderer sends typed data).
   * - Wraps upsertNote + setNoteTags in a single transaction for atomic updates.
   * - Returns the effective noteId.
   */
  save(input: SaveNoteInput): number {
    if (!input.title || !input.title.trim()) throw new Error('Title required');

    // Serialize canvas items; keep null for empty to save a few bytes if desired
    const strokesJSON = JSON.stringify(input.strokes ?? []);

    // Single connection shared across repos
    const db = getDb();

    // better-sqlite3 transaction wrapper
    const tx = db.transaction((fn: Function) => fn());

    let noteId = -1;
    tx(() => {
      // 1) Upsert note core fields
      noteId = this.notes.upsertNote(db, {
        noteId: input.noteId,
        title: input.title.trim(),
        content: input.content ?? null,
        strokesJSON,
        folderId: input.folderId ?? null,
      });

      // 2) Ensure tags exist and attach them to the note
      const tagIds = (input.tagNames ?? []).map((n) => this.tags.getOrCreateTagByName(n));
      this.notes.setNoteTags(db, noteId, tagIds);
    });

    return noteId;
  }

  /**
   * get:
   * - Loads a note + tag names.
   * - Parses strokes JSON defensively; returns empty array on parse error.
   */
  get(noteId: number): NoteDTO | undefined {
    const row = this.notes.get(noteId) as (NoteRow & { tagNames: string[] }) | undefined;
    if (!row) return undefined;

    let strokes: Stroke[] = [];
    try {
      strokes = row.strokes ? (JSON.parse(row.strokes) as Stroke[]) : [];
    } catch {
      // Corrupt JSON shouldn't crash the app; treat as no strokes
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

  /**
   * search:
   * - Composes a flexible search that supports:
   *   - free-text q across title, content, and tag names,
   *   - folder filter (folderId or explicitly null for "No Folder"),
   *   - tagIds / tagNames filters (any-of semantics; AND can be added if needed).
   * - Returns a minimal row set for fast list rendering.
   *
   * Note: This service-level search differs from repo.search which focuses on SQL construction for AND semantics by tagNames.
   * This version builds a LEFT JOIN to include notes without tags unless filtered strictly by tag filters.
   */
  search(criteria: {
    q?: string;
    folderId?: number | null;
    tagIds?: number[];
    tagNames?: string[];
  }) {
    const db = getDb();

    const params: any[] = [];
    const whereParts: string[] = [];
    let joinTags = false;

    // Folder constraint (explicit null means "No Folder")
    if (criteria.folderId !== undefined) {
      if (criteria.folderId === null) {
        whereParts.push('n.folderId IS NULL');
      } else {
        whereParts.push('n.folderId = ?');
        params.push(criteria.folderId);
      }
    }

    // Free-text query over title/content (lowercased LIKE)
    const q = criteria.q?.trim().toLowerCase();
    if (q) {
      // We will incorporate tag name in an OR group below; hold off pushing params here to avoid duplication.
    }

    // Tag filters (any-of semantics for this service; for AND semantics, use repo.search)
    if (criteria.tagIds && criteria.tagIds.length) {
      joinTags = true;
      whereParts.push(`nt.tagId IN (${criteria.tagIds.map(() => '?').join(',')})`);
      params.push(...criteria.tagIds);
    }
    if (criteria.tagNames && criteria.tagNames.length) {
      joinTags = true;
      whereParts.push(`LOWER(t.name) IN (${criteria.tagNames.map(() => '?').join(',')})`);
      params.push(...criteria.tagNames.map((s) => s.toLowerCase()));
    }

    // Build final SQL. If q exists, prepend an OR group that matches title/content OR tag name.
    if (q) {
      joinTags = true;
      const textOrClause =
        '(LOWER(n.title) LIKE ? OR LOWER(n.content) LIKE ? OR LOWER(t.name) LIKE ?)';
      const like = `%${q}%`;

      // Rebuild where parts cleanly to ensure the OR group is the first condition (AND with the rest)
      const rebuilt: string[] = [];
      const rebuiltParams: any[] = [];

      // Keep folder and explicit tag filters
      if (criteria.folderId !== undefined) {
        if (criteria.folderId === null) rebuilt.push('n.folderId IS NULL');
        else {
          rebuilt.push('n.folderId = ?');
          rebuiltParams.push(criteria.folderId);
        }
      }
      if (criteria.tagIds && criteria.tagIds.length) {
        rebuilt.push(`nt.tagId IN (${criteria.tagIds.map(() => '?').join(',')})`);
        rebuiltParams.push(...criteria.tagIds);
      }
      if (criteria.tagNames && criteria.tagNames.length) {
        rebuilt.push(`LOWER(t.name) IN (${criteria.tagNames.map(() => '?').join(',')})`);
        rebuiltParams.push(...criteria.tagNames.map((s) => s.toLowerCase()));
      }

      const finalWhere = [textOrClause, ...rebuilt];

      const sql = `
        SELECT n.noteId, n.title, n.content, n.updatedAt, n.folderId
        FROM Notes n
        ${joinTags ? 'LEFT JOIN NoteTags nt ON nt.noteId = n.noteId LEFT JOIN Tags t ON t.tagId = nt.tagId' : ''}
        ${finalWhere.length ? 'WHERE ' + finalWhere.join(' AND ') : ''}
        GROUP BY n.noteId
        ORDER BY COALESCE(n.updatedAt, n.createdAt) DESC
      `;

      // OR-clause params come first, followed by rebuilt filters
      const finalParams = [like, like, like, ...rebuiltParams];
      return db.prepare(sql).all(...finalParams);
    }

    // No free-text q: just folder/tags filters
    const sql = `
      SELECT n.noteId, n.title, n.content, n.updatedAt, n.folderId
      FROM Notes n
      ${joinTags ? 'LEFT JOIN NoteTags nt ON nt.noteId = n.noteId LEFT JOIN Tags t ON t.tagId = nt.tagId' : ''}
      ${whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : ''}
      GROUP BY n.noteId
      ORDER BY COALESCE(n.updatedAt, n.createdAt) DESC
    `;
    return db.prepare(sql).all(...params);
  }
}
