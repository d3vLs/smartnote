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

    // draw all strokes
    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i];
      if (!s?.points?.length) continue;
      ctx.strokeStyle = s.color ?? '#222';
      ctx.lineWidth = s.width ?? 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      s.points.forEach((p, j) => (j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }

    // draw in-progress stroke
    if (drawing.current?.points?.length) {
      const s = drawing.current;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      s.points.forEach((p, j) => (j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }

    // highlight selected strokes on top
    if (selectedIdx.length) {
      ctx.save();
      ctx.strokeStyle = '#0a84ff';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.6;
      for (const i of selectedIdx) {
        const s = strokes[i];
        if (!s?.points?.length) continue;
        ctx.beginPath();
        s.points.forEach((p, j) => (j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }
      ctx.restore();
    }

    // draw selection rectangle only while dragging
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

  // Initialize canvas with DPR scaling once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 800;
    const cssHeight = canvas.clientHeight || 600;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    repaint();
    // re-run on resize if needed
  }, []);

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
  // function strokeInRect(s: Stroke, r: { x: number; y: number; w: number; h: number }) {
  //   return s.points.some((p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
  // }
  // function toCanvasPoint(e: React.MouseEvent) {
  //   const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
  //   return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: Date.now() };
  // }

  function strokeInRect(s: Stroke, r: { x: number; y: number; w: number; h: number }) {
    const pad = Math.max(4, s.width ?? 2);
    const rx = r.x - pad,
      ry = r.y - pad,
      rw = r.w + pad * 2,
      rh = r.h + pad * 2;
    return s.points.some((p) => p.x >= rx && p.x <= rx + rw && p.y >= ry && p.y <= ry + rh);
  }

  function toCanvasPoint(e: React.MouseEvent) {
    const canvas = e.target as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    // scale to canvas logical coordinates (which we draw in CSS pixels after ctx.scale)
    return { x: cssX, y: cssY, t: Date.now() };
  }

  function eraseAt(p: { x: number; y: number }) {
    const radius = 6;
    setStrokes((prev) =>
      prev.filter((s) => !s.points.some((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) < radius))
    );
    repaint();
  }

  // Canvas handlers
  const erasing = useRef(false);

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
      erasing.current = true;
      eraseAt(p);
      return;
    }

    // if (tool === 'erase') {
    //   const radius = 6;
    //   setStrokes((prev) =>
    //     prev.filter((s) => !s.points.some((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) < radius))
    //   );
    //   return;
    // }
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

    if (tool === 'erase' && erasing.current) {
      eraseAt(p);
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
      setSelectionRect(null); // hide box after selection
      repaint();
    }
    if (tool === 'erase') erasing.current = false;
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
