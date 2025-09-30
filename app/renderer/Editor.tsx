import React, { useEffect, useRef, useState } from 'react';
import { TagManager } from './TagManager';

// Types
type StrokePoint = { x: number; y: number; t?: number };
type Stroke = { kind: 'stroke'; points: StrokePoint[]; color: string; width: number };
type TextBox = {
  kind: 'text';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  font: string;
  color: string;
  align: 'left' | 'center' | 'right';
};
type CanvasItem = Stroke | TextBox;
type Tool = 'pen' | 'select' | 'erase' | 'text';

export function Editor({
  noteId,
  onSaved,
}: {
  noteId: number | null;
  onSaved: (id: number) => void;
}) {
  // Save toast
  const [savedToast, setSavedToast] = useState<{ visible: boolean; text: string }>({
    visible: false,
    text: '',
  });
  const toastTimer = useRef<number | null>(null);

  // Tool state
  const [tool, setTool] = useState<Tool>('pen');
  const [penColor, setPenColor] = useState<string>('#222');
  const [penWidth, setPenWidth] = useState<number>(2);

  // Note state
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<CanvasItem[]>([]);
  const itemsRef = useRef<CanvasItem[]>([]);
  const undoStack = useRef<CanvasItem[][]>([]);
  const redoStack = useRef<CanvasItem[][]>([]);
  const HISTORY_LIMIT = 10;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);

  // Selection rectangle and helpers
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionDraggingRef = useRef<boolean>(false);
  const pointerDownRef = useRef<boolean>(false);

  // Infinite canvas pan & zoom
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(scale);
  const panningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const panOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Folders
  const [folders, setFolders] = useState<{ folderId: number; name: string }[]>([]);
  const [folderId, setFolderId] = useState<number | null>(null);

  // Selection / text editing
  const [selectedIdx, setSelectedIdx] = useState<number[]>([]);
  const [editingTextIdx, setEditingTextIdx] = useState<number | null>(null);
  const textOverlayRef = useRef<HTMLTextAreaElement>(null);

  // Tags drawer
  const [tagsOpen, setTagsOpen] = useState(true);
  useEffect(() => {
    const v = localStorage.getItem('tagsOpen');
    if (v !== null) setTagsOpen(v === '1');
  }, []);
  useEffect(() => {
    localStorage.setItem('tagsOpen', tagsOpen ? '1' : '0');
  }, [tagsOpen]);

  // Load folders
  useEffect(() => {
    (async () => setFolders(await window.api.listFolders()))();
  }, []);

  // Load note
  useEffect(() => {
    const load = async () => {
      if (noteId) {
        const note = await window.api.getNote(noteId);
        setTitle(note.title ?? '');
        const raw: any[] = note.strokes ?? [];
        const upgraded: CanvasItem[] = raw.map((r: any) =>
          'kind' in r ? r : ({ kind: 'stroke', ...r } as Stroke)
        );
        setItems(upgraded);
        setFolderId(note.folderId ?? null);
      } else {
        setTitle('Untitled');
        setItems([]);
        setFolderId(null);
      }
    };
    load();
  }, [noteId]);

  function showSavedToast(text = 'Saved') {
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setSavedToast({ visible: true, text });
    toastTimer.current = window.setTimeout(() => {
      setSavedToast((prev) => ({ ...prev, visible: false }));
      toastTimer.current = null;
    }, 1600);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // Repaint
  function repaint() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const { width, height } = ctx.canvas;

    // clear and paint white
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    const dpr = window.devicePixelRatio || 1;
    // Apply combined transform: DPR then world pan/zoom
    ctx.setTransform(
      dpr * scaleRef.current,
      0,
      0,
      dpr * scaleRef.current,
      offsetRef.current.x * dpr,
      offsetRef.current.y * dpr
    );

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      if (it.kind === 'stroke') {
        if (!it.points?.length) continue;
        ctx.strokeStyle = it.color ?? '#222';
        ctx.lineWidth = it.width ?? 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        it.points.forEach((p, j) => (j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();

        if (selectedIdx.includes(i)) {
          ctx.save();
          ctx.strokeStyle = '#0a84ff';
          ctx.lineWidth = (it.width ?? 2) + 2;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          it.points.forEach((p, j) => (j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
          ctx.restore();
        }
      } else if (it.kind === 'text') {
        ctx.save();
        ctx.font = it.font || '16px system-ui, sans-serif';
        ctx.fillStyle = it.color || '#222';
        ctx.textAlign = it.align || 'left';
        const lineHeight = parseInt(it.font) * 1.3 || 20;
        const words = it.text.split(/\s+/);
        let line = '';
        let y = it.y + lineHeight;
        const startX =
          it.align === 'center' ? it.x + it.w / 2 : it.align === 'right' ? it.x + it.w : it.x;
        for (const word of words) {
          const test = line ? line + ' ' + word : word;
          const m = ctx.measureText(test);
          if (m.width > it.w && line) {
            ctx.fillText(line, startX, y);
            line = word;
            y += lineHeight;
            if (y > it.y + it.h) break;
          } else {
            line = test;
          }
        }
        if (y <= it.y + it.h) ctx.fillText(line, startX, y);
        ctx.restore();
      }
    }

    // Text selection highlight boxes
    if (selectedIdx.length) {
      ctx.save();
      ctx.strokeStyle = '#0a84ff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      for (const i of selectedIdx) {
        const it = items[i];
        if (it?.kind === 'text') {
          ctx.strokeRect(it.x, it.y, it.w, it.h);
        }
      }
      ctx.restore();
    }

    // In-progress stroke
    if (drawing.current && drawing.current.points?.length) {
      const s = drawing.current;
      ctx.save();
      ctx.strokeStyle = s.color ?? '#222';
      ctx.lineWidth = s.width ?? 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
    }

    // Selection rectangle (world coords)
    if (selectionRect) {
      ctx.save();
      ctx.strokeStyle = '#0a84ff';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
      ctx.restore();
    }
  }
  useEffect(() => repaint(), [items, selectionRect, selectedIdx, offset, scale]);

  // Sync refs
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // History helpers
  function snapshotClone(snapshot: CanvasItem[]) {
    return snapshot.map((it) =>
      it.kind === 'text'
        ? { ...it }
        : ({
            kind: 'stroke',
            color: it.color,
            width: it.width,
            points: it.points.slice(),
          } as Stroke)
    );
  }
  function pushHistory(snapshot: CanvasItem[]) {
    const clone = snapshotClone(snapshot);
    undoStack.current.push(clone);
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    redoStack.current = [];
  }
  function undo() {
    const u = undoStack.current;
    if (!u.length) return;
    const top = u.pop()!;
    redoStack.current.push(snapshotClone(itemsRef.current));
    itemsRef.current = snapshotClone(top);
    setItems(itemsRef.current);
    setSelectedIdx([]);
  }
  function redo() {
    const r = redoStack.current;
    if (!r.length) return;
    const top = r.pop()!;
    undoStack.current.push(snapshotClone(itemsRef.current));
    itemsRef.current = snapshotClone(top);
    setItems(itemsRef.current);
    setSelectedIdx([]);
  }

  // Canvas DPR setup and resize
  useEffect(() => {
    const setup = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssWidth = rect.width || 800;
      const cssHeight = rect.height || 600;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // DPR scaling happens in repaint with world transforms
      }
      repaint();
    };
    setup();
    window.addEventListener('resize', setup);
    return () => window.removeEventListener('resize', setup);
  }, []);

  // Coord helpers
  function toCanvasPoint(e: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const x = (cssX - offsetRef.current.x) / scaleRef.current;
    const y = (cssY - offsetRef.current.y) / scaleRef.current;
    return { x, y, t: Date.now() };
  }

  // Drawing finalize
  const finalizeStroke = () => {
    if (tool === 'pen' && drawing.current) {
      const s = drawing.current;
      const saved: Stroke = {
        kind: 'stroke',
        color: s.color,
        width: s.width,
        points: s.points.slice(),
      };
      const next = [...itemsRef.current, saved];
      pushHistory(itemsRef.current.slice());
      itemsRef.current = next;
      setItems(next);
      drawing.current = null;
    }
  };

  // Pointer handlers
  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingTextIdx !== null) return;
    const canvas = canvasRef.current;
    // Right-click: pan
    if (e.button === 2) {
      panningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOriginRef.current = { x: offsetRef.current.x, y: offsetRef.current.y };
      canvas?.setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0) {
      canvas?.releasePointerCapture?.(e.pointerId);
      selectionStartRef.current = null;
      selectionDraggingRef.current = false;
      setSelectionRect(null);
      return;
    }
    canvas?.setPointerCapture?.(e.pointerId);
    pointerDownRef.current = true;
    const p = toCanvasPoint(e);

    if (tool === 'pen') {
      if (drawing.current) finalizeStroke();
      drawing.current = { kind: 'stroke', points: [p], color: penColor, width: penWidth };
      repaint();
      return;
    }

    if (tool === 'select') {
      selectionStartRef.current = { x: p.x, y: p.y };
      selectionDraggingRef.current = false;
      setSelectionRect(null);
      return;
    }

    if (tool === 'erase') {
      eraseAtPoint(p.x, p.y);
      return;
    }

    if (tool === 'text') {
      const id = `t_${Date.now()}`;
      const tb: TextBox = {
        kind: 'text',
        id,
        x: p.x,
        y: p.y,
        w: 240,
        h: 80,
        text: '',
        font: '16px system-ui, sans-serif',
        color: '#222',
        align: 'left',
      };
      const next = [...itemsRef.current, tb];
      pushHistory(itemsRef.current.slice());
      itemsRef.current = next;
      setItems(next);
      selectionStartRef.current = null;
      setSelectionRect(null);
      selectionDraggingRef.current = false;
      setEditingTextIdx(next.length - 1);
      return;
    }
  };

  const onCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panningRef.current && panStartRef.current && panOriginRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const next = { x: panOriginRef.current.x + dx, y: panOriginRef.current.y + dy };
      offsetRef.current = next;
      setOffset(next);
      repaint();
      return;
    }
    if (!pointerDownRef.current) return;
    const p = toCanvasPoint(e);

    if (tool === 'pen' && drawing.current) {
      drawing.current.points.push(p);
      repaint();
      return;
    }

    if (tool === 'select' && selectionStartRef.current) {
      const s = selectionStartRef.current;
      const rx = Math.min(s.x, p.x),
        ry = Math.min(s.y, p.y);
      const rw = Math.abs(p.x - s.x),
        rh = Math.abs(p.y - s.y);
      const moved = Math.hypot(p.x - s.x, p.y - s.y) > 4;
      if (moved) {
        selectionDraggingRef.current = true;
        setSelectionRect({ x: rx, y: ry, w: rw, h: rh });
      }
      const sel: number[] = [];
      itemsRef.current.forEach((it, i) => {
        if (it.kind === 'text') {
          if (it.x >= rx && it.y >= ry && it.x + it.w <= rx + rw && it.y + it.h <= ry + rh)
            sel.push(i);
        } else {
          const b = strokeBounds(it);
          if (b.x + b.w >= rx && b.x <= rx + rw && b.y + b.h >= ry && b.y <= ry + rh) sel.push(i);
        }
      });
      setSelectedIdx(sel);
      return;
    }
  };

  const onCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (panningRef.current) {
      panningRef.current = false;
      panStartRef.current = null;
      panOriginRef.current = null;
      canvas?.releasePointerCapture?.(e.pointerId);
      return;
    }
    canvas?.releasePointerCapture?.(e.pointerId);
    pointerDownRef.current = false;
    finalizeStroke();

    if (tool === 'select') {
      if (selectionDraggingRef.current && selectionRect) {
        const sel: number[] = [];
        itemsRef.current.forEach((it, i) => {
          if (it.kind === 'text') {
            if (
              it.x >= selectionRect.x &&
              it.y >= selectionRect.y &&
              it.x + it.w <= selectionRect.x + selectionRect.w &&
              it.y + it.h <= selectionRect.y + selectionRect.h
            )
              sel.push(i);
          } else {
            const b = strokeBounds(it);
            if (
              b.x + b.w >= selectionRect.x &&
              b.x <= selectionRect.x + selectionRect.w &&
              b.y + b.h >= selectionRect.y &&
              b.y <= selectionRect.y + selectionRect.h
            )
              sel.push(i);
          }
        });
        setSelectedIdx(sel);
        setSelectionRect(null);
        selectionStartRef.current = null;
        return;
      }

      // Click select topmost
      const p = toCanvasPoint(e);
      const hit: number[] = [];
      for (let i = itemsRef.current.length - 1; i >= 0; i--) {
        const it = itemsRef.current[i];
        if (it.kind === 'text') {
          if (p.x >= it.x && p.x <= it.x + it.w && p.y >= it.y && p.y <= it.y + it.h) {
            hit.push(i);
            break;
          }
        } else {
          for (let j = 1; j < it.points.length; j++) {
            const p1 = it.points[j - 1],
              p2 = it.points[j];
            const dist = pointNearSegment(p.x, p.y, p1.x, p1.y, p2.x, p2.y);
            if (dist <= 8) {
              hit.push(i);
              break;
            }
          }
          if (hit.length) break;
        }
      }
      setSelectedIdx(hit.length ? [hit[0]] : []);
      selectionDraggingRef.current = false;
    } else {
      setSelectionRect(null);
      selectionStartRef.current = null;
    }
  };

  const onCanvasPointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    canvas?.releasePointerCapture?.(e.pointerId);
    pointerDownRef.current = false;
    finalizeStroke();
  };
  useEffect(() => {
    const up = () => finalizeStroke();
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [tool]);

  useEffect(() => {
    if (editingTextIdx === null) return;
    const it = itemsRef.current[editingTextIdx] as TextBox | undefined;
    if (!it || it.kind !== 'text') return;
    setTimeout(() => textOverlayRef.current?.focus(), 50);
  }, [editingTextIdx]);

  // Keyboard shortcuts
  useEffect(() => {
    const isTypingField = (el: Element | null) => {
      if (!el) return false;
      const tag = (el as HTMLElement).tagName?.toLowerCase();
      const editable = (el as HTMLElement).getAttribute?.('contenteditable');
      if (editable && editable !== 'false') return true;
      return tag === 'input' || tag === 'textarea' || tag === 'select';
    };

    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const cmd = e.metaKey || e.ctrlKey;
      const alt = e.altKey;

      if (cmd && key === 's') {
        e.preventDefault();
        e.stopPropagation();
        save();
        return;
      }

      // Undo / Redo
      if (cmd && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (cmd && (key === 'y' || (e.shiftKey && key === 'z'))) {
        e.preventDefault();
        redo();
        return;
      }

      if (editingTextIdx !== null) return;
      if (isTypingField(document.activeElement)) return;

      if (!cmd && !alt) {
        if (key === 'delete' && selectedIdx.length) {
          e.preventDefault();
          pushHistory(itemsRef.current.slice());
          const next = itemsRef.current.filter((_, i) => !selectedIdx.includes(i));
          itemsRef.current = next;
          setItems(next);
          setSelectedIdx([]);
          return;
        }
        if (key === 'p') {
          e.preventDefault();
          setTool('pen');
          return;
        }
        if (key === 't') {
          e.preventDefault();
          setTool('text');
          return;
        }
        if (key === 's') {
          e.preventDefault();
          setTool('select');
          return;
        }
        if (key === 'e') {
          e.preventDefault();
          setTool('erase');
          return;
        }
      }
    };

    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any);
  }, [editingTextIdx, selectedIdx]);

  // Clear selection on tool change away from select
  useEffect(() => {
    if (tool !== 'select') {
      setSelectedIdx([]);
      setSelectionRect(null);
      selectionStartRef.current = null;
    }
  }, [tool]);

  // Helpers
  function pointNearSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) {
    const A = px - x1,
      B = py - y1,
      C = x2 - x1,
      D = y2 - y1;
    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq !== 0) param = dot / len_sq;
    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }
    const dx = px - xx,
      dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function eraseAtPoint(x: number, y: number) {
    const threshold = 8;
    const before = itemsRef.current;
    const next = before.filter((it) => {
      if (it.kind === 'text') {
        return !(x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h);
      }
      for (let i = 1; i < it.points.length; i++) {
        const p1 = it.points[i - 1],
          p2 = it.points[i];
        const dist = pointNearSegment(x, y, p1.x, p1.y, p2.x, p2.y);
        if (dist <= threshold) return false;
      }
      return true;
    });
    if (next.length !== before.length) {
      pushHistory(before.slice());
      itemsRef.current = next;
      setItems(next);
    }
  }

  function strokeBounds(st: Stroke) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of st.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  // Text overlay focus
  useEffect(() => {
    if (editingTextIdx === null) return;
    const it = itemsRef.current[editingTextIdx] as TextBox | undefined;
    if (!it || it.kind !== 'text') return;
    setTimeout(() => textOverlayRef.current?.focus(), 50);
  }, [editingTextIdx]);

  // Zoom with ctrl/cmd + wheel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (ev: WheelEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const worldX = (cx - offsetRef.current.x) / scaleRef.current;
      const worldY = (cy - offsetRef.current.y) / scaleRef.current;
      const delta = -ev.deltaY;
      const zoomFactor = delta > 0 ? 1.1 : 0.9;
      const nextScale = Math.max(0.1, Math.min(4, scaleRef.current * zoomFactor));
      const nextOffsetX = cx - worldX * nextScale;
      const nextOffsetY = cy - worldY * nextScale;
      scaleRef.current = nextScale;
      offsetRef.current = { x: nextOffsetX, y: nextOffsetY };
      setScale(nextScale);
      setOffset({ x: nextOffsetX, y: nextOffsetY });
      repaint();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // compute Content Bounds for pdf export
  function computeContentBounds(items: CanvasItem[]) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const it of items) {
      if (it.kind === 'stroke') {
        if (!it.points?.length) continue;
        for (const p of it.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      } else if (it.kind === 'text') {
        if (it.x < minX) minX = it.x;
        if (it.y < minY) minY = it.y;
        if (it.x + it.w > maxX) maxX = it.x + it.w;
        if (it.y + it.h > maxY) maxY = it.y + it.h;
      }
    }
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      // No content; return a small default rect
      return { x: 0, y: 0, w: 600, h: 400 };
    }
    const margin = 24;
    const x = Math.floor(minX - margin);
    const y = Math.floor(minY - margin);
    const w = Math.ceil(maxX - minX + margin * 2);
    const h = Math.ceil(maxY - minY + margin * 2);
    return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
  }

  // exportpdf
  const exportPDF = async () => {
    if (drawing.current) finalizeStroke();
    const snapshot = itemsRef.current;
    const bounds = computeContentBounds(snapshot);

    // Option 1: send items and crop rect; main/export page will translate by -bounds.x/y
    const res = await window.api.exportPDF({
      title: (title || 'Note').trim(),
      strokes: snapshot, // include both strokes and text items
      crop: bounds, // <-- new
    });
    if (res?.ok) {
      // optional toast: "Exported PDF"
      showSavedToast('Exported PDF');
    }
  };

  // save
  const save = async () => {
    if (drawing.current) finalizeStroke();
    const snapshot = itemsRef.current;
    const id = await window.api.saveNote({
      noteId: noteId ?? undefined,
      title,
      content: '',
      strokes: snapshot as any,
      tagNames: [],
      folderId,
    });
    onSaved(id);
    showSavedToast('Saved'); // toast
  };

  return (
    <div
      onWheel={(e) => {
        if (!(e.ctrlKey || e.metaKey)) e.preventDefault();
      }}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Slim header */}
      <div
        style={{
          padding: 8,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          borderBottom: '1px solid #eee',
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 1 }}
          placeholder="Untitled"
        />
        <select
          value={folderId ?? ''}
          onChange={(e) => setFolderId(e.target.value ? Number(e.target.value) : null)}
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
        <button onClick={save} title="Save (Ctrl/Cmd+S)">
          Save
        </button>
        <button onClick={exportPDF} title="Export as PDF">
          Export PDF
        </button>
      </div>

      {/* Canvas + right drawer */}
      <div style={{ display: 'flex', height: '100%' }}>
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#ffffff',
            paddingBottom: 72,
            minHeight: 300,
          }}
        >
          {/* Save toast overlay (non-blocking) */}
          <div
            aria-live="polite"
            style={{
              position: 'absolute',
              right: tagsOpen ? 284 : 16, // offset when drawer open
              top: 16,
              transform: savedToast.visible ? 'translateY(0)' : 'translateY(-8px)',
              transition: 'transform 180ms ease-out, opacity 180ms ease-out',
              opacity: savedToast.visible ? 1 : 0,
              zIndex: 5,
              background: 'rgba(30, 30, 30, 0.92)',
              color: '#fff',
              padding: '10px 12px',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              pointerEvents: 'none',
              font: '13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
              letterSpacing: 0.2,
            }}
          >
            <span style={{ marginRight: 8 }}>✓</span>
            {savedToast.text}
          </div>
          {/* Top-right toggle for tags drawer */}
          <button
            title={tagsOpen ? 'Hide tags' : 'Show tags'}
            onClick={() => setTagsOpen((v) => !v)}
            style={{
              position: 'absolute',
              top: 12,
              right: tagsOpen ? 12 : 12,
              zIndex: 4,
              border: '1px solid #010101',
              borderRadius: 999,
              background: '#fff',
              padding: '6px 10px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              cursor: 'pointer',
            }}
          >
            {tagsOpen ? '›' : '‹'}
          </button>

          {/* Non-interactive backdrop */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: '88%',
                height: '92%',
                maxWidth: 1400,
                background: '#fff',
                borderRadius: 12,
                boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
              }}
            />
          </div>

          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerCancel}
            style={{ width: '100%', height: '100%', position: 'relative', zIndex: 2 }}
          />

          {/* Optional context-menu catcher */}
          <canvas
            onContextMenu={(ev) => {
              selectionStartRef.current = null;
              selectionDraggingRef.current = false;
              setSelectionRect(null);
            }}
          />

          {/* Text overlay */}
          {editingTextIdx !== null &&
            (() => {
              const it = itemsRef.current[editingTextIdx] as TextBox | undefined;
              if (!it || it.kind !== 'text') return null;
              const canvas = canvasRef.current;
              const rect = canvas?.getBoundingClientRect();
              const left = rect ? it.x * scaleRef.current + offsetRef.current.x : it.x;
              const top = rect ? it.y * scaleRef.current + offsetRef.current.y : it.y;
              const width = it.w * scaleRef.current;
              const height = it.h * scaleRef.current;
              return (
                <textarea
                  ref={textOverlayRef}
                  value={it.text}
                  onChange={(e) => {
                    const next = itemsRef.current.slice();
                    const t = { ...(next[editingTextIdx] as TextBox) };
                    t.text = e.target.value;
                    next[editingTextIdx] = t;
                    itemsRef.current = next;
                    setItems(next);
                  }}
                  onBlur={() => setEditingTextIdx(null)}
                  style={{
                    position: 'absolute',
                    left,
                    top,
                    width,
                    height,
                    transform: 'translate(0,0)',
                    zIndex: 10,
                    resize: 'none',
                    padding: 8,
                    boxSizing: 'border-box',
                    font: it.font,
                  }}
                />
              );
            })()}

          {/* Bottom toolbar: wrapper non-interactive; inner groups interactive */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 136,
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 10,
              background: 'rgba(255,255,255,0.92)',
              borderRadius: 12,
              boxShadow: '0 10px 28px rgba(0,0,0,0.12)',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          >
            <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
              <button
                title="Pen (P)"
                onClick={() => setTool('pen')}
                style={{ opacity: tool === 'pen' ? 1 : 0.7 }}
              >
                ✏️
              </button>
              <button
                title="Text (T)"
                onClick={() => setTool('text')}
                style={{ opacity: tool === 'text' ? 1 : 0.7 }}
              >
                T
              </button>
              <button
                title="Select (S)"
                onClick={() => setTool('select')}
                style={{ opacity: tool === 'select' ? 1 : 0.7 }}
              >
                ▭
              </button>
              <button
                title="Erase (E)"
                onClick={() => setTool('erase')}
                style={{ opacity: tool === 'erase' ? 1 : 0.7 }}
              >
                ⌫
              </button>
            </div>

            <div style={{ width: 1, height: 24, background: '#e5e5e5' }} />

            <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
              {['#222', '#0a84ff', '#f59e0b', '#ef4444', '#10b981'].map((c) => (
                <button
                  key={c}
                  title={`Color ${c}`}
                  onClick={() => setPenColor(c)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    border: penColor === c ? '2px solid #333' : '1px solid rgba(0,0,0,0.1)',
                    background: c,
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
              {[1, 2, 4, 6].map((w) => (
                <button
                  key={w}
                  title={`${w}px`}
                  onClick={() => setPenWidth(w)}
                  style={{
                    padding: 4,
                    borderRadius: 8,
                    border: penWidth === w ? '2px solid #333' : '1px solid #ddd',
                    background: '#fff',
                  }}
                >
                  <div style={{ width: 24, borderTop: `${w}px solid #444` }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right drawer for tags */}
        <div
          style={{
            width: tagsOpen ? 260 : 0,
            transition: 'width 160ms ease',
            borderLeft: tagsOpen ? '1px solid #e5e5e5' : 'none',
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          {tagsOpen && <TagManager noteId={noteId} />}
        </div>
      </div>
    </div>
  );
}
