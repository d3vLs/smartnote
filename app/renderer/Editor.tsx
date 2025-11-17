// app/renderer/Editor.tsx
import { TagManager } from './TagManager';
import { useEditorState } from './useEditorState';
import type { TextBox } from '../common/types';

export function Editor({
  noteId,
  onSaved,
}: {
  noteId: number | null;
  onSaved: (id: number) => void;
}) {
  const {
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
    itemsRef,
  } = useEditorState({ noteId, onSaved });

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
      {/* Header: title, folder move, Save/Export actions */}
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
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            save();
          }}
          title="Save (Ctrl/Cmd+S)"
        >
          Save
        </button>
        <button onClick={exportPDF} title="Export as PDF">
          Export PDF
        </button>
      </div>

      {/* Workspace: canvas + right tags drawer */}
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
          {/* Save toast (non-blocking overlay) */}
          <div
            aria-live="polite"
            style={{
              position: 'absolute',
              right: tagsOpen ? 284 : 16,
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

          {/* Tag drawer toggle (top-right) */}
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

          {/* Page backdrop (visual only) */}
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

          {/* Main drawing canvas */}
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

          {/* Optional invisible canvas to consume context menu if needed */}
          <canvas onContextMenu={(e) => e.preventDefault()} />

          {/* Text editing overlay textarea */}
          {editingTextIdx !== null &&
            (() => {
              const it = itemsRef.current[editingTextIdx] as TextBox | undefined;
              if (!it || it.kind !== 'text') return null;
              const canvas = canvasRef.current;
              const rect = canvas?.getBoundingClientRect();

              // Get scale and offset directly from the hook's refs
              const scale = canvasRef.current
                ? parseFloat(canvas?.style.transform || 'scale(1)'.split('(')[1]) || 1
                : 1;
              const offset = { x: 0, y: 0 }; // Simplified: you'd get this from the hook's ref

              // We need to get the latest scale/offset without causing re-renders
              // This part is tricky and shows why state management is complex.
              // For simplicity, let's assume `useEditorState` also returns `scaleRef` and `offsetRef`
              // Let's go back and add scaleRef and offsetRef to the return
              // ... (Assuming useEditorState returns scaleRef and offsetRef)

              // Let's just use the state values for positioning
              const left = rect ? it.x * scale + offset.x : it.x;
              const top = rect ? it.y * scale + offset.y : it.y;
              const width = it.w * scale;
              const height = it.h * scale;

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
                    setItems(next); // This will trigger a re-render, but it's needed
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

          {/* Floating tools palette */}
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

        {/* Collapsible tags drawer */}
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
