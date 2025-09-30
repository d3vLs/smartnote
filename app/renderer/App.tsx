import React, { useState } from 'react';
import { NotesList } from './NotesList';
import { Editor } from './Editor';

/**
 * App shell:
 * - Two-pane layout: left NotesList, right Editor.
 * - currentNoteId is the single source of truth for which note is open.
 * - NotesList can open an existing note or request a fresh one (sets null).
 * - Editor emits onSaved(id) after save/insert to keep selection in sync.
 */
export default function App() {
  // null means "start a new note" (Editor initializes Untitled + empty items)
  const [currentNoteId, setCurrentNoteId] = useState<number | null>(null);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar: searching, filtering, and selecting notes */}
      <NotesList
        onOpen={setCurrentNoteId} // open existing note in editor
        onNew={() => setCurrentNoteId(null)} // start new note (editor shows empty canvas)
      />

      {/* Editor: canvas + tags drawer; saves propagate selected note id back up */}
      <Editor
        noteId={currentNoteId}
        onSaved={setCurrentNoteId} // after insert or update, ensure selection reflects the saved id
      />
    </div>
  );
}
