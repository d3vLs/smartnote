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

  search(criteria: { q?: string; folderId?: number | null; tagNames?: string[] }) {
    return this.notes.search(criteria.q, criteria.folderId ?? null, criteria.tagNames ?? [], 50, 0);
  }
}
