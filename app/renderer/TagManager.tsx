// TagManager.tsx (renderer)
import React, { useEffect, useMemo, useState } from 'react';

type Tag = { tagId: number; name: string };

export function TagManager({ noteId, collapsed }: { noteId: number | null; collapsed?: boolean }) {
  if (collapsed) return null;
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [noteTags, setNoteTags] = useState<Tag[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  // Load catalog once
  useEffect(() => {
    (async () => {
      const all = await window.api.listAllTags?.(); // optional
      if (Array.isArray(all)) setAllTags(all);
    })();
  }, []);

  // Refresh note tags
  const refreshNoteTags = async (id: number | null) => {
    if (!id) {
      setNoteTags([]);
      return;
    }
    const tags = await window.api.getTagsForNote(id); // new preload API
    setNoteTags(tags || []);
  };

  useEffect(() => {
    refreshNoteTags(noteId);
  }, [noteId]);

  const suggestions = useMemo(() => {
    const existing = new Set(noteTags.map((t) => t.name.toLowerCase()));
    const q = input.trim().toLowerCase();
    const base = Array.isArray(allTags) ? allTags : [];
    return base
      .filter((t) => !existing.has(t.name.toLowerCase()))
      .filter((t) => (q ? t.name.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [allTags, noteTags, input]);

  const addTag = async (name: string) => {
    if (!noteId || !name.trim()) return;
    setBusy(true);
    try {
      await window.api.addTagToNote(noteId, name.trim()); // should create if missing then link
      await refreshNoteTags(noteId);
      const all = await window.api.listAllTags?.();
      if (Array.isArray(all)) setAllTags(all);
      setInput('');
    } finally {
      setBusy(false);
    }
  };

  const removeTag = async (tagId: number) => {
    if (!noteId) return;
    setBusy(true);
    try {
      await window.api.removeTagFromNote(noteId, tagId);
      await refreshNoteTags(noteId);
    } finally {
      setBusy(false);
    }
  };

  const disabled = !noteId || busy;

  return (
    <aside
      style={{
        width: 260,
        borderLeft: '1px solid #e5e5e5',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ font: '600 12px system-ui', color: '#555' }}>Tags</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 28 }}>
        {noteTags.length ? (
          noteTags.map((t) => (
            <span
              key={t.tagId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#f2f2f2',
                borderRadius: 999,
                padding: '4px 8px',
                font: '12px system-ui',
              }}
            >
              {t.name}
              <button
                title="Remove tag"
                onClick={() => removeTag(t.tagId)}
                disabled={disabled}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#888',
                }}
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span style={{ color: '#999', font: '12px system-ui' }}>No tags</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={noteId ? 'Add tag…' : 'Open a note to tag'}
          disabled={!noteId || busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim() && noteId) {
              e.preventDefault();
              addTag(input);
            }
          }}
          style={{ flex: 1 }}
        />
        <button onClick={() => addTag(input)} disabled={!noteId || !input.trim() || busy}>
          Add
        </button>
      </div>

      {!!suggestions.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggestions.map((s) => (
            <button
              key={s.tagId}
              onClick={() => addTag(s.name)}
              disabled={disabled}
              style={{
                border: '1px solid #ddd',
                background: '#fff',
                borderRadius: 999,
                padding: '3px 8px',
                font: '12px system-ui',
                cursor: 'pointer',
              }}
              title="Add tag to this note"
            >
              + {s.name}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
