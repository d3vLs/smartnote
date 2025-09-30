// app/renderer/NotesList.tsx
import React, { useEffect, useState } from 'react';

type NoteRow = {
  noteId: number;
  title: string;
  updatedAt?: string | null;
  folderId?: number | null;
};
type Folder = { folderId: number; name: string };

export function NotesList({ onOpen, onNew }: { onOpen: (id: number) => void; onNew: () => void }) {
  const [items, setItems] = useState<NoteRow[]>([]);
  const [q, setQ] = useState('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [collapsed, setCollapsed] = useState(false);

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

  async function deleteNote(noteId: number) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    await window.api.deleteNote(noteId);
    await refresh();
  }

  // Folder actions dropdown helpers
  function toggleMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const menu = e.currentTarget.nextElementSibling as HTMLDivElement | null;
    if (!menu) return;
    const open = menu.getAttribute('data-open') === 'true';
    menu.setAttribute('data-open', (!open).toString());
    menu.style.display = open ? 'none' : 'block';
  }
  function closeMenu(el: HTMLDivElement) {
    el.setAttribute('data-open', 'false');
    el.style.display = 'none';
  }

  return (
    <div
      style={{
        width: collapsed ? 56 : 360,
        transition: 'width 160ms ease',
        background: '#f8f8f8',
        boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((c) => !c)}
          style={{ width: 32 }}
        >
          ☰
        </button>
        {!collapsed && (
          <>
            <button onClick={onNew} title="New note">
              New
            </button>
            <input
              placeholder="Search..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: 1 }}
            />
          </>
        )}
      </div>

      {!collapsed && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: 8,
            borderTop: '1px solid #eee',
            borderBottom: '1px solid #eee',
            alignItems: 'center',
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

          {/* Folder actions dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              title="Folder actions"
              disabled={activeFolder === null}
              onClick={toggleMenu}
              style={{ padding: '4px 8px' }}
            >
              ⋯
            </button>
            <div
              data-open="false"
              style={{
                display: 'none',
                position: 'absolute',
                top: '110%',
                right: 0,
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 6,
                boxShadow: '0 6px 18px rgba(0,0,0,0.1)',
                zIndex: 10,
                minWidth: 160,
                padding: 6,
              }}
              onMouseLeave={(e) => closeMenu(e.currentTarget)}
            >
              <button
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onClick={async (e) => {
                  e.stopPropagation();
                  const menu = e.currentTarget.parentElement as HTMLDivElement;
                  const fid = activeFolder!;
                  if (
                    !confirm(
                      'Delete this folder? Notes inside will be kept and moved to No Folder.'
                    )
                  ) {
                    closeMenu(menu);
                    return;
                  }
                  await window.api.deleteFolderHard(fid);
                  closeMenu(menu);
                  await refresh();
                  setActiveFolder(null);
                }}
              >
                Delete folder
              </button>
            </div>
          </div>

          <input
            placeholder="New folder"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={createFolder}>Add</button>
        </div>
      )}

      {!collapsed && (
        <div style={{ overflow: 'auto', minHeight: 0 }}>
          {items.map((n) => (
            <div
              key={n.noteId}
              onClick={() => onOpen(n.noteId)}
              style={{
                padding: 8,
                borderBottom: '1px solid #eee',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.title}
                </div>
                <small>{n.updatedAt ?? ''}</small>
              </div>

              <button
                title="Delete note"
                onClick={async (e) => {
                  e.stopPropagation();
                  await deleteNote(n.noteId);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#c00',
                  fontSize: 16,
                }}
                aria-label="Delete note"
              >
                🗑
              </button>
            </div>
          ))}
          {!items.length && <div style={{ padding: 12, color: '#888' }}>No notes found</div>}
        </div>
      )}
    </div>
  );
}
