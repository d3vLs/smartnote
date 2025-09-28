import React, { useState } from 'react';
// import { NotesList } from './NotesList';
// import { Editor } from './Editor';

export default function App() {
  const [currentNoteId, setCurrentNoteId] = useState<number | null>(null);
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <h1>SmartNoteLOLOLOLOLOL</h1>
      {/* <NotesList onOpen={setCurrentNoteId} onNew={() => setCurrentNoteId(null)} />
      <Editor noteId={currentNoteId} onSaved={setCurrentNoteId} /> */}
    </div>
  );
}
