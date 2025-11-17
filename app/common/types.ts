export type StrokePoint = {
  x: number;
  y: number;
  t?: number;
};
export type Stroke = {
  kind: 'stroke';
  points: StrokePoint[];
  color: string;
  width: number;
};

export type TextBox = {
  kind: 'text';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  font: string;
  color: string;
  align: 'left' | 'center' | 'right';
};

export type CanvasItem = Stroke | TextBox;

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
  strokes: CanvasItem[];
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
  strokes: CanvasItem[];
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
