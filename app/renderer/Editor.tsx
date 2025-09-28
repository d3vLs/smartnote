import React, { useEffect, useRef, useState } from 'react';
import { TagManager } from './TagManager';

type StrokePoint = { x: number; y: number; t?: number };
type Stroke = { points: StrokePoint[]; color: string; width: number };

export function Editor({
  noteId,
  onSaved,
}: {
  noteId: number | null;
  onSaved: (id: number) => void;
}) {
  // Tool state
  type Tool = 'pen' | 'select' | 'erase';
  const [tool, setTool] = useState<Tool>('pen');

  // Note state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);

  // Folders
  const [folders, setFolders] = useState<{ folderId: number; name: string }[]>([]);
  const [folderId, setFolderId] = useState<number | null>(null);

  // Selection
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number[]>([]);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  // Load folders and note folder
  useEffect(() => {
    (async () => setFolders(await window.api.listFolders()))();
  }, []);
  useEffect(() => {
    (async () => {
      if (noteId) {
        const note = await window.api.getNote(noteId);
        setFolderId(note.folderId ?? null);
      } else {
        setFolderId(null);
      }
    })();
  }, [noteId]);
  async function moveToFolder(fid: number | null) {
    if (!noteId) return;
    await window.api.moveToFolder(noteId, fid);
    setFolderId(fid);
  }

  // Load note data
  useEffect(() => {
    const load = async () => {
      if (noteId) {
        const note = await window.api.getNote(noteId);
        setTitle(note.title ?? '');
        setContent(note.content ?? '');
        setStrokes(note.strokes ?? []);
      } else {
        setTitle('Untitled');
        setContent('');
        setStrokes([]);
      }
    };
    load();
  }, [noteId]);

  // Repaint helper
  function repaint() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);

    // Draw committed strokes
    for (const s of strokes) {
      if (!s || !s.points?.length) continue;
      ctx.strokeStyle = s.color ?? '#222';
      ctx.lineWidth = s.width ?? 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }

    // Draw in-progress stroke
    if (drawing.current && drawing.current.points.length) {
      const s = drawing.current;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }

    // Draw selection rectangle
    if (selectionRect) {
      ctx.save();
      ctx.strokeStyle = '#0a84ff';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1;
      ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
      ctx.restore();
    }
  }
  useEffect(() => {
    repaint();
  }, [strokes, selectionRect]);

  // Keyboard nudge
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedIdx.length) return;
      let dx = 0,
        dy = 0;
      if (e.key === 'ArrowUp') dy = -1;
      if (e.key === 'ArrowDown') dy = 1;
      if (e.key === 'ArrowLeft') dx = -1;
      if (e.key === 'ArrowRight') dx = 1;
      if (dx || dy) {
        setStrokes((prev) =>
          prev.map((s, i) =>
            selectedIdx.includes(i)
              ? { ...s, points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) }
              : s
          )
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIdx]);

  // Helpers
  function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }) {
    const x = Math.min(a.x, b.x),
      y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x),
      h = Math.abs(a.y - b.y);
    return { x, y, w, h };
  }
  function strokeInRect(s: Stroke, r: { x: number; y: number; w: number; h: number }) {
    return s.points.some((p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
  }
  function toCanvasPoint(e: React.MouseEvent) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: Date.now() };
  }

  // Canvas handlers
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    const p = toCanvasPoint(e);

    if (tool === 'pen') {
      drawing.current = { points: [p], color: '#222', width: 2 };
      repaint();
      return;
    }

    if (tool === 'select') {
      dragStart.current = { x: p.x, y: p.y };
      setSelectionRect({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }

    if (tool === 'erase') {
      const radius = 6;
      setStrokes((prev) =>
        prev.filter((s) => !s.points.some((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) < radius))
      );
      return;
    }
  };

  const onCanvasMouseMove = (e: React.MouseEvent) => {
    const p = toCanvasPoint(e);

    if (tool === 'pen' && drawing.current) {
      drawing.current.points.push(p);
      repaint();
      return;
    }

    if (tool === 'select' && dragStart.current) {
      setSelectionRect(rectFromPoints(dragStart.current, p));
      return;
    }
  };

  const onCanvasMouseUp = () => {
    if (tool === 'pen' && drawing.current) {
      const finalized = drawing.current;
      setStrokes((prev) => [...prev, finalized!]);
      drawing.current = null;
      repaint();
    }
    if (tool === 'select' && selectionRect) {
      const idx: number[] = [];
      strokes.forEach((s, i) => {
        if (strokeInRect(s, selectionRect)) idx.push(i);
      });
      setSelectedIdx(idx);
      dragStart.current = null;
    }
  };

  // Save note
  const save = async () => {
    const id = await window.api.saveNote({
      noteId: noteId ?? undefined,
      title,
      content,
      strokes,
      tagNames: [],
    });
    onSaved(id);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 8, display: 'flex', gap: 8, borderBottom: '1px solid #ddd' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
        <select
          value={folderId ?? ''}
          onChange={(e) => moveToFolder(e.target.value ? Number(e.target.value) : null)}
          style={{ minWidth: 160 }}
          title="Move to folder"
        >
          <option value="">No Folder</option>
          {folders.map((f) => (
            <option key={f.folderId} value={f.folderId}>
              {f.name}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setTool('pen')} disabled={tool === 'pen'}>
            Pen
          </button>
          <button onClick={() => setTool('select')} disabled={tool === 'select'}>
            Select
          </button>
          <button onClick={() => setTool('erase')} disabled={tool === 'erase'}>
            Erase
          </button>
        </div>
        <button onClick={save}>Save</button>
      </div>

      <div style={{ display: 'flex', height: '100%' }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ width: '40%', borderRight: '1px solid #eee' }}
        />
        <div style={{ flex: 1, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        <TagManager noteId={noteId} />
      </div>
    </div>
  );
}
