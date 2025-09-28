export interface StrokePoint {
  x: number;
  y: number;
  t?: number;
}
export interface Stroke {
  points: StrokePoint[];
  color: string;
  width: number;
}

export interface Note {
  noteId: number;
  title: string;
  content?: string | null;
  strokesJSON?: string | null;
  folderId?: number | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface NoteRow {
  noteId: number;
  title: string;
  content?: string | null;
  strokes?: string | null;
  folderId?: number | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface Tag {
  tagId: number;
  name: string;
}
export interface Folder {
  folderId: number;
  name: string;
  createdAt: string;
}

export interface NoteDTO extends Omit<Note, 'strokesJSON'> {
  strokes: Stroke[];
}
export interface NoteSummaryDTO {
  noteId: number;
  title: string;
  updatedAt?: string | null;
  folderId?: number | null;
  tags?: string[];
}

export interface SaveNoteInput {
  noteId?: number;
  title: string;
  content?: string;
  strokes: Stroke[];
  folderId?: number | null;
  tagNames?: string[];
}

export interface SearchCriteria {
  q?: string;
  folderId?: number | null;
  tagNames?: string[];
  limit?: number;
  offset?: number;
}
