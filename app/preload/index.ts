import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload (isolated world):
 * - Exposes a minimal, typed API on window.api for the renderer.
 * - All privileged work stays in the main process; renderer cannot access Node APIs directly.
 *
 * Design:
 * - Methods use ipcRenderer.invoke(channel, payload) → Promise<any>, aligning with ipcMain.handle.
 * - Namespaced channels: notes:*, tags:*, folders:*, to keep surface organized.
 * - Keep this surface as the only bridge; do not expose raw ipcRenderer.
 */

type CropRect = { x: number; y: number; w: number; h: number };

contextBridge.exposeInMainWorld('api', {
  // --- Export -----------------------------------------------------------------------------------
  /**
   * Export current note content to PDF.
   * payload.strokes contains both strokes and text objects.
   * payload.crop is a tight bounding rect (world coords) computed in the renderer.
   */
  exportPDF: (payload: { title: string; strokes: any[]; crop: CropRect }) =>
    ipcRenderer.invoke('notes:exportPDF', payload),

  // --- Notes ------------------------------------------------------------------------------------
  /**
   * Save note (insert or update).
   * Returns noteId (new or existing), unified by the main service.
   */
  saveNote: (input: any) => ipcRenderer.invoke('notes:save', input),

  /** Fetch a single note by id. */
  getNote: (noteId: number) => ipcRenderer.invoke('notes:get', noteId),

  /**
   * Search notes.
   * criteria can include: q (string), folderId (number|null), tagIds (number[]), order, limit, offset.
   */
  searchNotes: (criteria: any) => ipcRenderer.invoke('notes:search', criteria),

  /** Permanently delete a note. */
  deleteNote: (noteId: number) => ipcRenderer.invoke('notes:delete', noteId),

  // --- Tags -------------------------------------------------------------------------------------
  /** List all tags (for suggestions in TagManager). */
  listTags: () => ipcRenderer.invoke('tags:list'),

  /** Create tag if it does not exist, and return it. */
  createTag: (name: string) => ipcRenderer.invoke('tags:create', name),

  /** Assign an existing tag (by id) to a note. Idempotent. */
  assignTag: (noteId: number, tagId: number) =>
    ipcRenderer.invoke('tags:assign', { noteId, tagId }),

  /** Remove a tag (by id) from a note. */
  removeTag: (noteId: number, tagId: number) =>
    ipcRenderer.invoke('tags:remove', { noteId, tagId }),

  /** Get tags assigned to a specific note. */
  getTagsForNote: (noteId: number) => ipcRenderer.invoke('tags:forNote', noteId),

  /** Add tag to a note by name (creates tag if missing). */
  addTagToNote: (noteId: number, name: string) =>
    ipcRenderer.invoke('tags:addToNote', { noteId, name }),

  /** Remove tag from a note by tagId. */
  removeTagFromNote: (noteId: number, tagId: number) =>
    ipcRenderer.invoke('tags:removeFromNote', { noteId, tagId }),

  /** Alias for listTags to keep existing calls working. Prefer listTags going forward. */
  listAllTags: () => ipcRenderer.invoke('tags:list'),

  // --- Folders ----------------------------------------------------------------------------------
  /** List all folders. */
  listFolders: () => ipcRenderer.invoke('folders:list'),

  /** Create a new folder. */
  createFolder: (name: string) => ipcRenderer.invoke('folders:create', name),

  /** Rename a folder. */
  renameFolder: (folderId: number, name: string) =>
    ipcRenderer.invoke('folders:rename', { folderId, name }),

  /** Delete a folder (soft rules depend on repo; see deleteHard for forced variant). */
  deleteFolder: (folderId: number) => ipcRenderer.invoke('folders:delete', folderId),

  /** Move a note into a folder (or null for "No Folder"). */
  moveToFolder: (noteId: number, folderId: number | null) =>
    ipcRenderer.invoke('notes:moveToFolder', { noteId, folderId }),

  /**
   * Hard-delete folder:
   * - Moves contained notes to "No Folder" (NULL)
   * - Deletes the folder itself
   */
  deleteFolderHard: (folderId: number) => ipcRenderer.invoke('folders:deleteHard', folderId),
});

console.log('preload loaded');
