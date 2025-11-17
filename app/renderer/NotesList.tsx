// app/renderer/NotesList.tsx
import React, { useEffect, useState } from 'react';

/**
 * Lightweight row model from searchNotes.
 * updatedAt is displayed as-is; consider formatting in the parent if needed.
 */
type NoteRow = {
  noteId: number;
  title: string;
  updatedAt?: string | null;
  folderId?: number | null;
};

type Folder = { folderId: number; name: string };

/**
 * NotesList (left sidebar)
 * - Search, folder filter, and a "New" entry point (calls onNew).
 * - Lists notes and opens a note on click (calls onOpen(id)).
 * - Provides folder actions (delete with move-to-null safety).
 *
 * Props:
 * - onOpen: open an existing note in the editor
 * - onNew: start a new note (editor will show empty canvas)
 */
export function NotesList({ onOpen, onNew }: { onOpen: (id: number) => void; onNew: () => void }) {
  // Data state
  const [items, setItems] = useState<NoteRow[]>([]);
  const [q, setQ] = useState('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<number | null>(null);

  // UI state
  const [newFolder, setNewFolder] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  /**
   * Fetch notes (filtered by q and folder) and refresh folder list.
   * Called on initial mount and whenever q/activeFolder changes.
   */
  async function refresh() {
    const res = await window.api.searchNotes({ q, folderId: activeFolder });
    setItems(res);
    const fs = await window.api.listFolders();
    setFolders(fs);
  }
  useEffect(() => {
    refresh();
  }, [q, activeFolder]);

  /** Create a folder from input; no-op on empty names; refresh after create. */
  async function createFolder() {
    if (!newFolder.trim()) return;
    await window.api.createFolder(newFolder.trim());
    setNewFolder('');
    await refresh();
  }

  /** Delete a note (hard) with confirmation; refresh list afterwards. */
  async function deleteNote(noteId: number) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    await window.api.deleteNote(noteId);
    await refresh();
  }

  // --- Folder actions dropdown (simple inline menu) ---------------------------------------------

  /** Toggle the small folder actions menu next to the folder select. */
  function toggleMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const menu = e.currentTarget.nextElementSibling as HTMLDivElement | null;
    if (!menu) return;
    const open = menu.getAttribute('data-open') === 'true';
    menu.setAttribute('data-open', (!open).toString());
    menu.style.display = open ? 'none' : 'block';
  }
  /** Close an opened folder actions menu. */
  function closeMenu(el: HTMLDivElement) {
    el.setAttribute('data-open', 'false');
    el.style.display = 'none';
  }

  // --- Render -----------------------------------------------------------------------------------

  return (
    <div
      style={{
        width: collapsed ? 46 : 380,
        transition: 'width 160ms ease',
        background: '#f8f8f8',
        boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0, // allow inner scroll area to size correctly
      }}
    >
      {/* Header row: collapse toggle, New button, and Search box */}
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
            {/* "New" starts a fresh note (App sets currentNoteId=null; Editor initializes new) */}
            <button onClick={onNew} title="New note" type="button">
              New
            </button>

            {/* Search by title/content; debouncing can be added if needed */}
            <input
              placeholder="Search..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: 1 }}
            />
          </>
        )}
      </div>

      {/* Folder filter + actions (delete) + quick-create folder */}
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
          {/* Folder filter: empty means "All Folders" */}
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

          {/* Minimal actions menu for current folder (delete) */}
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

          {/* Quick create folder inline */}
          <input
            placeholder="New folder"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={createFolder}>Add</button>
        </div>
      )}

      {/* Notes list (scrollable) */}
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
                {/* Title clipped to one line; consider bolding active note in App with a prop */}
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.title}
                </div>
                <small>{n.updatedAt ?? ''}</small>
              </div>

              {/* Inline delete; stop propagation so row click doesn't open the note we delete */}
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
