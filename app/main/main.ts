import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { openDb } from '../repo/db';
import { migrate } from '../repo/schema';
import { TagRepository } from '../repo/tags';
import { FolderRepository } from '../repo/folders';
import { NoteService } from '../services/notes';

let win: BrowserWindow | null = null;

// Declare variables, but don't instantiate yet
let noteService: NoteService;
let tagsRepo: TagRepository;
let foldersRepo: FolderRepository;

function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/index.js'); // flat build layout
  console.log('Preload path:', preloadPath);

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1130, // enforce minimum width
    minHeight: 660, // enforce minimum height
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html')); // flat dist under build
  }
}

async function bootstrap() {
  const dbFile = path.join(app.getPath('userData'), 'smartnote.db');
  // Open DB (returns instance or ensures global is set)
  openDb(dbFile);
  // Run migrations before repositories are used
  migrate();

  // Now it's safe to construct services/repos
  noteService = new NoteService();
  tagsRepo = new TagRepository();
  foldersRepo = new FolderRepository();

  // notes handlers
  // Register IPC handlers after services exist
  ipcMain.handle('notes:save', (_e, input) => noteService.save(input));
  ipcMain.handle('notes:get', (_e, id: number) => noteService.get(id));
  ipcMain.handle('notes:search', (_e, criteria) => noteService.search(criteria));
  // Delete a note by id
  ipcMain.handle('notes:delete', (_e, noteId: number) => {
    const db = (require('../repo/db') as any).getDb();
    db.prepare('DELETE FROM Notes WHERE noteId = ?').run(noteId);
    // NoteTags rows cascade due to FK ON DELETE CASCADE
  });

  // Tag handlers
  // ipcMain.handle('tags:list', () => tagsRepo.list());
  ipcMain.handle('tags:create', (_e, name: string) => tagsRepo.getOrCreateTagByName(name));
  ipcMain.handle('tags:assign', (_e, { noteId, tagId }) => {
    const db = (require('../repo/db') as any).getDb();
    db.prepare('INSERT OR IGNORE INTO NoteTags(noteId, tagId) VALUES (?,?)').run(noteId, tagId);
  });
  ipcMain.handle('tags:remove', (_e, { noteId, tagId }) => {
    const db = (require('../repo/db') as any).getDb();
    db.prepare('DELETE FROM NoteTags WHERE noteId = ? AND tagId = ?').run(noteId, tagId);
  });

  // Folder handlers
  ipcMain.handle('folders:list', () => foldersRepo.list());
  ipcMain.handle('folders:create', (_e, name: string) => foldersRepo.create(name));
  ipcMain.handle('folders:rename', (_e, { folderId, name }: { folderId: number; name: string }) =>
    foldersRepo.rename(folderId, name)
  );
  ipcMain.handle('folders:delete', (_e, folderId: number) => foldersRepo.remove(folderId));
  ipcMain.handle(
    'notes:moveToFolder',
    (_e, { noteId, folderId }: { noteId: number; folderId: number | null }) => {
      const db = (require('../repo/db') as any).getDb();
      db.prepare(
        'UPDATE Notes SET folderId = ?, updatedAt = CURRENT_TIMESTAMP WHERE noteId = ?'
      ).run(folderId, noteId);
    }
  );
  // Hard-delete a folder: move notes to "No Folder" (NULL), then delete folder
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

  // List all tags
  ipcMain.handle('tags:list', () => {
    const db = (require('../repo/db') as any).getDb();
    return db.prepare('SELECT tagId, name FROM Tags ORDER BY name').all();
  });

  // Add tag to a note (creates tag if missing)
  ipcMain.handle('tags:addToNote', (_e, { noteId, name }: { noteId: number; name: string }) => {
    const db = (require('../repo/db') as any).getDb();
    const insertTag = db.prepare('INSERT INTO Tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING');
    insertTag.run(name);
    const tag = db.prepare('SELECT tagId, name FROM Tags WHERE name = ?').get(name);
    db.prepare('INSERT OR IGNORE INTO NoteTags (noteId, tagId) VALUES (?, ?)').run(
      noteId,
      tag.tagId
    );
  });

  // Remove tag from a note
  ipcMain.handle(
    'tags:removeFromNote',
    (_e, { noteId, tagId }: { noteId: number; tagId: number }) => {
      const db = (require('../repo/db') as any).getDb();
      db.prepare('DELETE FROM NoteTags WHERE noteId = ? AND tagId = ?').run(noteId, tagId);
    }
  );

  // Get tags for a specific note
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

  createWindow();
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
