// app/renderer/useEditorState.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import type { CanvasItem, Stroke, TextBox, Folder, StrokePoint } from '../common/types';

// This Tool type is only used by the editor
type Tool = 'pen' | 'select' | 'erase' | 'text';

// Helper function
function pointNearSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
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

/**
 * This hook manages all the complex state for the Editor component.
 */
export function useEditorState({
  noteId,
  onSaved,
}: {
  noteId: number | null;
  onSaved: (id: number) => void;
}) {
  // --- UI: transient "Saved" toast ---
  const [savedToast, setSavedToast] = useState<{ visible: boolean; text: string }>({
    visible: false,
    text: '',
  });
  const toastTimer = useRef<number | null>(null);

  const showSavedToast = useCallback((text = 'Saved') => {
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setSavedToast({ visible: true, text });
    toastTimer.current = window.setTimeout(() => {
      setSavedToast((prev) => ({ ...prev, visible: false }));
      toastTimer.current = null;
    }, 1600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // --- Tool and drawing state ---
  const [tool, setTool] = useState<Tool>('pen');
  const [penColor, setPenColor] = useState<string>('#222');
  const [penWidth, setPenWidth] = useState<number>(2);

  // --- Note data and undo/redo history ---
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<CanvasItem[]>([]);
  const itemsRef = useRef<CanvasItem[]>([]);
  const undoStack = useRef<CanvasItem[][]>([]);
  const redoStack = useRef<CanvasItem[][]>([]);
  const HISTORY_LIMIT = 10;

  // --- Canvas and in-progress stroke ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);

  // --- Selection and pointer state ---
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionDraggingRef = useRef<boolean>(false);
  const pointerDownRef = useRef<boolean>(false);

  // --- Canvas transforms (pan/zoom) ---
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const offsetRef = useRef(offset);
  const scaleRef = useRef(scale);

  // --- Right-button panning state ---
  const panningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const panOriginRef = useRef<{ x: number; y: number } | null>(null);

  // --- Folders (header move-to dropdown) ---
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<number | null>(null);

  // --- Text editing state ---
  const [selectedIdx, setSelectedIdx] = useState<number[]>([]);
  const [editingTextIdx, setEditingTextIdx] = useState<number | null>(null);
  const textOverlayRef = useRef<HTMLTextAreaElement>(null);

  // --- Tags drawer visibility ---
  const [tagsOpen, setTagsOpen] = useState(true);
  useEffect(() => {
    const v = localStorage.getItem('tagsOpen');
    if (v !== null) setTagsOpen(v === '1');
  }, []);
  useEffect(() => {
    localStorage.setItem('tagsOpen', tagsOpen ? '1' : '0');
  }, [tagsOpen]);

  // --- Data loading ---
  useEffect(() => {
    (async () => setFolders(await window.api.listFolders()))();
  }, []);

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
      // Clear history when loading a new note
      undoStack.current = [];
      redoStack.current = [];
      setSelectedIdx([]);
      setEditingTextIdx(null);
    };
    load();
  }, [noteId]);

  // --- Rendering (canvas repaint) ---
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const { width, height } = ctx.canvas;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    const dpr = window.devicePixelRatio || 1;
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
      } else {
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

    if (selectedIdx.length) {
      ctx.save();
      ctx.strokeStyle = '#0a84ff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      for (const i of selectedIdx) {
        const it = items[i];
        if (it?.kind === 'text') ctx.strokeRect(it.x, it.y, it.w, it.h);
      }
      ctx.restore();
    }

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

    if (selectionRect) {
      ctx.save();
      ctx.strokeStyle = '#0a84ff';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
      ctx.restore();
    }
  }, [items, selectionRect, selectedIdx]);

  useEffect(() => repaint(), [repaint, offset, scale]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // --- Undo/redo ---
  const snapshotClone = useCallback((snapshot: CanvasItem[]) => {
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
  }, []);

  const pushHistory = useCallback(
    (snapshot: CanvasItem[]) => {
      const clone = snapshotClone(snapshot);
      undoStack.current.push(clone);
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
      redoStack.current = [];
    },
    [snapshotClone]
  );

  const undo = useCallback(() => {
    const u = undoStack.current;
    if (!u.length) return;
    const top = u.pop()!;
    redoStack.current.push(snapshotClone(itemsRef.current));
    itemsRef.current = snapshotClone(top);
    setItems(itemsRef.current);
    setSelectedIdx([]);
  }, [snapshotClone]);

  const redo = useCallback(() => {
    const r = redoStack.current;
    if (!r.length) return;
    const top = r.pop()!;
    undoStack.current.push(snapshotClone(itemsRef.current));
    itemsRef.current = snapshotClone(top);
    setItems(itemsRef.current);
    setSelectedIdx([]);
  }, [snapshotClone]);

  // --- Canvas sizing and DPR ---
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
      }
      repaint();
    };
    setup();
    window.addEventListener('resize', setup);
    return () => window.removeEventListener('resize', setup);
  }, [repaint]);

  // --- Coordinate transforms ---
  const toCanvasPoint = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const x = (cssX - offsetRef.current.x) / scaleRef.current;
    const y = (cssY - offsetRef.current.y) / scaleRef.current;
    return { x, y, t: Date.now() };
  }, []);

  // --- Stroke finalize ---
  const finalizeStroke = useCallback(() => {
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
  }, [tool, penColor, penWidth, pushHistory]);

  // --- Pointer handlers ---
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (editingTextIdx !== null) return;
      const canvas = canvasRef.current;

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
    },
    [editingTextIdx, tool, toCanvasPoint, finalizeStroke, penColor, penWidth, repaint, pushHistory]
  );

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    },
    [tool, toCanvasPoint, repaint]
  );

  const onCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    },
    [tool, finalizeStroke, selectionRect, toCanvasPoint]
  );

  const onCanvasPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      canvas?.releasePointerCapture?.(e.pointerId);
      pointerDownRef.current = false;
      finalizeStroke();
    },
    [finalizeStroke]
  );

  useEffect(() => {
    const up = () => finalizeStroke();
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [finalizeStroke]);

  // --- Text editing overlay focus ---
  useEffect(() => {
    if (editingTextIdx === null) return;
    const it = itemsRef.current[editingTextIdx] as TextBox | undefined;
    if (!it || it.kind !== 'text') return;
    setTimeout(() => textOverlayRef.current?.focus(), 50);
  }, [editingTextIdx]);

  // --- Keyboard shortcuts ---
  const save = useCallback(async () => {
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
    showSavedToast('Saved');
  }, [noteId, title, folderId, onSaved, showSavedToast, finalizeStroke]);

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
  }, [editingTextIdx, selectedIdx, save, undo, redo, pushHistory]);

  // --- Tool-based state cleanup ---
  useEffect(() => {
    if (tool !== 'select') {
      setSelectedIdx([]);
      setSelectionRect(null);
      selectionStartRef.current = null;
    }
  }, [tool]);

  // --- Geometry helpers ---
  const eraseAtPoint = useCallback(
    (x: number, y: number) => {
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
    },
    [pushHistory]
  );

  // --- Zoom (Ctrl/Cmd + Wheel) ---
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
  }, [repaint]);

  // --- Export (PDF) helpers ---
  const computeContentBounds = (items: CanvasItem[]) => {
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
      } else {
        if (it.x < minX) minX = it.x;
        if (it.y < minY) minY = it.y;
        if (it.x + it.w > maxX) maxX = it.x + it.w;
        if (it.y + it.h > maxY) maxY = it.y + it.h;
      }
    }
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { x: 0, y: 0, w: 600, h: 400 };
    }
    const margin = 24;
    const x = Math.floor(minX - margin);
    const y = Math.floor(minY - margin);
    const w = Math.ceil(maxX - minX + margin * 2);
    const h = Math.ceil(maxY - minY + margin * 2);
    return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
  };

  const exportPDF = useCallback(async () => {
    if (drawing.current) finalizeStroke();
    const snapshot = itemsRef.current;
    const bounds = computeContentBounds(snapshot);
    const res = await window.api.exportPDF({
      title: (title || 'Note').trim(),
      strokes: snapshot,
      crop: bounds,
    });
    if (res?.ok) showSavedToast('Exported PDF');
  }, [finalizeStroke, title, showSavedToast]);

  // --- Return all state and handlers ---
  return {
    savedToast,
    tool,
    setTool,
    penColor,
    setPenColor,
    penWidth,
    setPenWidth,
    title,
    setTitle,
    items,
    setItems,
    canvasRef,
    drawing,
    folders,
    folderId,
    setFolderId,
    editingTextIdx,
    setEditingTextIdx,
    textOverlayRef,
    tagsOpen,
    setTagsOpen,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    onCanvasPointerCancel,
    exportPDF,
    save,
    itemsRef, // Pass this for the text editing overlay
  };
}
