// app/renderer/TagManager.tsx
import React, { useEffect, useState } from 'react';

export function TagManager({ noteId }: { noteId: number | null }) {
  const [tags, setTags] = useState<{ tagId: number; name: string }[]>([]);
  const [noteTags, setNoteTags] = useState<number[]>([]);
  const [newName, setNewName] = useState('');

  async function refresh() {
    const all = await window.api.listTags();
    setTags(all);
    if (noteId) {
      const note = await window.api.getNote(noteId);
      // note.strokes etc; we need tag names -> map to ids by name
      const names: string[] = (note as any).tagNames ?? [];
      const ids = all
        .filter((t: { name: string }) => names.includes(t.name))
        .map((t: { tagId: any }) => t.tagId);
      setNoteTags(ids);
    } else {
      setNoteTags([]);
    }
  }

  useEffect(() => {
    refresh();
  }, [noteId]);

  async function createTag() {
    if (!newName.trim()) return;
    await window.api.createTag(newName);
    setNewName('');
    await refresh();
  }

  async function toggle(tagId: number) {
    if (!noteId) return;
    if (noteTags.includes(tagId)) {
      await window.api.removeTag(noteId, tagId);
    } else {
      await window.api.assignTag(noteId, tagId);
    }
    await refresh();
  }

  return (
    <div style={{ width: 220, borderLeft: '1px solid #ddd', padding: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Tags</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New tag..."
          style={{ flex: 1 }}
        />
        <button onClick={createTag}>Add</button>
      </div>
      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
        {tags.map((t) => (
          <label
            key={t.tagId}
            style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}
          >
            <input
              type="checkbox"
              checked={noteTags.includes(t.tagId)}
              onChange={() => toggle(t.tagId)}
            />
            <span>{t.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
