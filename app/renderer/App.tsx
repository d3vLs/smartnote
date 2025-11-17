import React, { useState, useEffect, useCallback } from 'react';
import { NotesList } from './NotesList';
import { Editor } from './Editor';
import type { Folder } from '@common/types';
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

  const [folders, setFolders] = useState<Folder[]>([]);

  // Function to refresh the list, which pass to child components
  const refreshFolders = useCallback(async () => {
    const fs = await window.api.listFolders();
    setFolders(fs);
  }, []);

  // Fetch the list on initial app load
  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  const [noteListKey, setNoteListKey] = useState(0); // This is our "refresh trigger"

  // Create a new handler for the Editor's onSaved prop
  const handleNoteSave = useCallback((id: number) => {
    setCurrentNoteId(id); // 1. Set the active note
    setNoteListKey((key) => key + 1); // 2. Trigger the refresh
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar: searching, filtering, and selecting notes */}
      <NotesList
        onOpen={setCurrentNoteId} // open existing note in editor
        onNew={() => setCurrentNoteId(null)} // start new note (editor shows empty canvas)
        folders={folders}
        refreshFolders={refreshFolders}
        refreshKey={noteListKey}
      />

      {/* Editor: canvas + tags drawer; saves propagate selected note id back up */}
      <Editor
        noteId={currentNoteId}
        onSaved={handleNoteSave} // after insert or update, ensure selection reflects the saved id
        folders={folders}
      />
    </div>
  );
}
