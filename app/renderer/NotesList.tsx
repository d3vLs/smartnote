// app/renderer/NotesList.tsx (augment with folders)
import React, { useEffect, useState } from 'react';

export function NotesList({ onOpen, onNew }: { onOpen: (id: number) => void; onNew: () => void }) {
  const [items, setItems] = useState<
    { noteId: number; title: string; updatedAt?: string | null; folderId?: number | null }[]
  >([]);
  const [q, setQ] = useState('');
  const [folders, setFolders] = useState<{ folderId: number; name: string }[]>([]);
  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [newFolder, setNewFolder] = useState('');

  async function refresh() {
    const res = await window.api.searchNotes({ q, folderId: activeFolder });
    setItems(res);
    const fs = await window.api.listFolders();
    setFolders(fs);
  }
  useEffect(() => {
    refresh();
  }, [q, activeFolder]);

  async function createFolder() {
    if (!newFolder.trim()) return;
    await window.api.createFolder(newFolder.trim());
    setNewFolder('');
    await refresh();
  }

  return (
    <div
      style={{
        width: 360,
        borderRight: '1px solid #ddd',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: 8, display: 'flex', gap: 8 }}>
        <button onClick={onNew}>New</button>
        <input
          placeholder="Search..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: 8,
          borderTop: '1px solid #eee',
          borderBottom: '1px solid #eee',
        }}
      >
        <select
          value={activeFolder ?? ''}
          onChange={(e) => setActiveFolder(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">All Folders</option>
          {folders.map((f) => (
            <option key={f.folderId} value={f.folderId}>
              {f.name}
            </option>
          ))}
        </select>
        <input
          placeholder="New folder"
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
        />
        <button onClick={createFolder}>Add</button>
      </div>

      <div style={{ overflow: 'auto' }}>
        {items.map((n) => (
          <div
            key={n.noteId}
            onClick={() => onOpen(n.noteId)}
            style={{ padding: 8, borderBottom: '1px solid #eee', cursor: 'pointer' }}
          >
            <div>{n.title}</div>
            <small>{n.updatedAt ?? ''}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
