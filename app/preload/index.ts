import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // export pdf
  exportPDF: (payload: {
    title: string;
    strokes: any[];
    crop: { x: number; y: number; w: number; h: number };
  }) => ipcRenderer.invoke('notes:exportPDF', payload),

  // notes

  saveNote: async (input: any) => ipcRenderer.invoke('notes:save', input),
  getNote: async (noteId: number) => ipcRenderer.invoke('notes:get', noteId),
  searchNotes: async (criteria: any) => ipcRenderer.invoke('notes:search', criteria),
  deleteNote: async (noteId: number) => ipcRenderer.invoke('notes:delete', noteId),

  // tags
  listTags: async () => ipcRenderer.invoke('tags:list'),
  createTag: async (name: string) => ipcRenderer.invoke('tags:create', name),
  assignTag: async (noteId: number, tagId: number) =>
    ipcRenderer.invoke('tags:assign', { noteId, tagId }),
  removeTag: async (noteId: number, tagId: number) =>
    ipcRenderer.invoke('tags:remove', { noteId, tagId }),
  getTagsForNote: async (noteId: number) => ipcRenderer.invoke('tags:forNote', noteId),
  addTagToNote: (noteId: number, name: string) =>
    ipcRenderer.invoke('tags:addToNote', { noteId, name }),
  removeTagFromNote: (noteId: number, tagId: number) =>
    ipcRenderer.invoke('tags:removeFromNote', { noteId, tagId }),
  listAllTags: () => ipcRenderer.invoke('tags:list'),

  // folders
  listFolders: async () => ipcRenderer.invoke('folders:list'),
  createFolder: async (name: string) => ipcRenderer.invoke('folders:create', name),
  renameFolder: async (folderId: number, name: string) =>
    ipcRenderer.invoke('folders:rename', { folderId, name }),
  deleteFolder: async (folderId: number) => ipcRenderer.invoke('folders:delete', folderId),
  moveToFolder: async (noteId: number, folderId: number | null) =>
    ipcRenderer.invoke('notes:moveToFolder', { noteId, folderId }),
  deleteFolderHard: async (folderId: number) => ipcRenderer.invoke('folders:deleteHard', folderId),
});

console.log('preload loaded');
