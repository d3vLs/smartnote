import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';

import { openDb } from '../repo/db';
import { migrate } from '../repo/schema';
import { TagRepository } from '../repo/tags';
import { FolderRepository } from '../repo/folders';
import { NoteService } from '../services/notes';
import fs from 'node:fs';

/**
 * Export helper: builds a self-contained HTML data URL that
 * - sizes the canvas to a cropped content rect
 * - translates items by -crop.x/-crop.y
 * - draws strokes and text exactly like the renderer
 *
 * This lets an offscreen BrowserWindow render the note without touching the main UI.
 */
function makeExportHTMLDataURL({
  title,
  items,
  crop,
}: {
  title: string;
  items: any[];
  crop: { x: number; y: number; w: number; h: number };
}) {
  const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escaped(title || 'Note')}</title>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; }
    .page { width: ${crop.w}px; height: ${crop.h}px; }
    canvas { width: ${crop.w}px; height: ${crop.h}px; display: block; }
  </style>
</head>
<body>
  <div class="page">
    <canvas id="c" width="${crop.w}" height="${crop.h}"></canvas>
  </div>
  <script>
    const items = ${JSON.stringify(items)};
    const crop = ${JSON.stringify(crop)};
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');

    // white background to avoid transparent PDF
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,c.width,c.height);

    // draw items translated by crop
    function draw() {
      for (const it of items) {
        if (it.kind === 'stroke') {
          if (!it.points || !it.points.length) continue;
          ctx.strokeStyle = it.color || '#222';
          ctx.lineWidth = it.width || 2;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i=0;i<it.points.length;i++) {
            const p = it.points[i];
            const x = p.x - crop.x;
            const y = p.y - crop.y;
            if (i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        } else if (it.kind === 'text') {
          ctx.save();
          ctx.font = it.font || '16px system-ui, sans-serif';
          ctx.fillStyle = it.color || '#222';
          ctx.textAlign = it.align || 'left';
          const lineHeight = parseInt(it.font) * 1.3 || 20;
          const words = (it.text || '').split(/\\s+/);
          let line = '', y = (it.y - crop.y) + lineHeight;
          const left = it.x - crop.x;
          const w = it.w;
          const startX = it.align === 'center' ? left + w/2 : (it.align === 'right' ? left + w : left);
          for (const word of words) {
            const test = line ? line + ' ' + word : word;
            const m = ctx.measureText(test);
            if (m.width > w && line) {
              ctx.fillText(line, startX, y);
              line = word;
              y += lineHeight;
              if (y > (it.y - crop.y) + it.h) break;
            } else {
              line = test;
            }
          }
          if (y <= (it.y - crop.y) + it.h) ctx.fillText(line, startX, y);
          ctx.restore();
        }
      }
    }
    draw();
  </script>
</body>
</html>
`;
  const encoded = Buffer.from(html, 'utf8').toString('base64');
  return `data:text/html;base64,${encoded}`;
}

let win: BrowserWindow | null = null;

// Data access objects (initialized after DB open + migrate)
let noteService: NoteService;
let tagsRepo: TagRepository;
let foldersRepo: FolderRepository;

/**
 * Create the main window.
 * - Preload runs the secure IPC bridge (contextIsolation on, no nodeIntegration).
 * - In dev, loads Vite dev server and opens devtools.
 * - In prod, loads built renderer index.html from dist under build/.
 */
function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/index.js'); // build layout puts preload here
  console.log('Preload path:', preloadPath);

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1130, // prevent too-small UI that would break layout
    minHeight: 660,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenu(null);

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Renderer output is copied to build/main/dist by the build pipeline
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

/**
 * App bootstrap:
 * - Open or create SQLite DB in userData
 * - Apply migrations
 * - Construct repositories/services
 * - Register IPC handlers
 * - Finally create the main window
 */
async function bootstrap() {
  const dbFile = path.join(app.getPath('userData'), 'smartnote.db');

  // 1) DB init and migrations (must happen before repos/services use the DB)
  openDb(dbFile);
  migrate();

  // 2) Construct domain services
  noteService = new NoteService();
  tagsRepo = new TagRepository();
  foldersRepo = new FolderRepository();

  // 3) IPC: Export as PDF
  // Renders a cropped note in an offscreen window and uses printToPDF to save.
  ipcMain.handle(
    'notes:exportPDF',
    async (
      _e,
      payload: {
        title: string;
        strokes: any[]; // union array: strokes + text objects
        crop: { x: number; y: number; w: number; h: number };
      }
    ) => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export as PDF',
        defaultPath: `${payload.title || 'Note'}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { ok: false, reason: 'cancelled' };

      // Hidden window dedicated to export; avoids disturbing main UI
      const win = new BrowserWindow({
        width: Math.min(1200, payload.crop.w + 40),
        height: Math.min(1000, payload.crop.h + 40),
        show: false,
        webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true },
      });

      const dataUrl = makeExportHTMLDataURL({
        title: payload.title,
        items: payload.strokes,
        crop: payload.crop,
      });
      await win.loadURL(dataUrl);
      await new Promise((r) => setTimeout(r, 60)); // give layout a tick

      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        landscape: false,
        // No custom page size here: content matches crop; Electron will fit to a single page.
      });

      fs.writeFileSync(filePath, pdf);
      win.destroy();
      return { ok: true, filePath };
    }
  );

  // 4) IPC: Notes
  // Save (insert or update), get by id, and search with criteria (q, folderId, tags)
  ipcMain.handle('notes:save', (_e, input) => noteService.save(input));
  ipcMain.handle('notes:get', (_e, id: number) => noteService.get(id));
  ipcMain.handle('notes:search', (_e, criteria) => noteService.search(criteria));

  // Delete a note (FK cascade removes NoteTags)
  ipcMain.handle('notes:delete', (_e, noteId: number) => {
    // TODO: Replace require(...) with static import getDb() to be bundle-safe in prod builds.
    const db = (require('../repo/db') as any).getDb();
    db.prepare('DELETE FROM Notes WHERE noteId = ?').run(noteId);
  });

  // 5) IPC: Tags
  // Create if missing and return tag row (used for suggestions and quick-add)
  ipcMain.handle('tags:create', (_e, name: string) => tagsRepo.getOrCreateTagByName(name));

  // Assign/remove tag link (NoteTags)
  ipcMain.handle('tags:assign', (_e, { noteId, tagId }) => {
    const db = (require('../repo/db') as any).getDb();
    db.prepare('INSERT OR IGNORE INTO NoteTags(noteId, tagId) VALUES (?,?)').run(noteId, tagId);
  });
  ipcMain.handle('tags:remove', (_e, { noteId, tagId }) => {
    const db = (require('../repo/db') as any).getDb();
    db.prepare('DELETE FROM NoteTags WHERE noteId = ? AND tagId = ?').run(noteId, tagId);
  });

  // List all tags (for TagManager’s global suggestions)
  ipcMain.handle('tags:list', () => {
    const db = (require('../repo/db') as any).getDb();
    return db.prepare('SELECT tagId, name FROM Tags ORDER BY name').all();
  });

  // Add tag to a note by name (idempotent)
  ipcMain.handle('tags:addToNote', (_e, { noteId, name }: { noteId: number; name: string }) => {
    const db = (require('../repo/db') as any).getDb();
    // Insert if not exists (SQLite UPSERT via ON CONFLICT DO NOTHING)
    db.prepare('INSERT INTO Tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING').run(name);
    const tag = db.prepare('SELECT tagId, name FROM Tags WHERE name = ?').get(name);
    db.prepare('INSERT OR IGNORE INTO NoteTags (noteId, tagId) VALUES (?, ?)').run(
      noteId,
      tag.tagId
    );
  });

  // Tags for a single note (join table)
  ipcMain.handle('tags:forNote', (_e, noteId: number) => {
    const db = (require('../repo/db') as any).getDb();
    return db
      .prepare(
        `
      SELECT t.tagId, t.name
      FROM Tags t
      JOIN NoteTags nt ON nt.tagId = t.tagId
      WHERE nt.noteId = ?
      ORDER BY t.name`
      )
      .all(noteId);
  });

  // 6) IPC: Folders
  ipcMain.handle('folders:list', () => foldersRepo.list());
  ipcMain.handle('folders:create', (_e, name: string) => foldersRepo.create(name));
  ipcMain.handle('folders:rename', (_e, { folderId, name }: { folderId: number; name: string }) =>
    foldersRepo.rename(folderId, name)
  );
  ipcMain.handle('folders:delete', (_e, folderId: number) => foldersRepo.remove(folderId));

  // Move note between folders (nullable for "No Folder")
  ipcMain.handle(
    'notes:moveToFolder',
    (_e, { noteId, folderId }: { noteId: number; folderId: number | null }) => {
      const db = (require('../repo/db') as any).getDb();
      db.prepare(
        'UPDATE Notes SET folderId = ?, updatedAt = CURRENT_TIMESTAMP WHERE noteId = ?'
      ).run(folderId, noteId);
    }
  );

  // Hard-delete a folder: first move its notes to "No Folder" (NULL), then delete the folder itself
  ipcMain.handle('folders:deleteHard', (_e, folderId: number) => {
    const db = (require('../repo/db') as any).getDb();
    const tx = db.transaction((fid: number) => {
      db.prepare(
        'UPDATE Notes SET folderId = NULL, updatedAt = CURRENT_TIMESTAMP WHERE folderId = ?'
      ).run(fid);
      db.prepare('DELETE FROM Folders WHERE folderId = ?').run(fid);
    });
    tx(folderId);
  });

  // 7) Create the main application window last (after handlers are ready)
  createWindow();
}

// Electron app lifecycle
app.whenReady().then(bootstrap);

// Quit on all windows closed (except macOS, where apps stay active until Cmd+Q)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  // Re-create window when clicking dock icon and there is no open window (macOS)
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
