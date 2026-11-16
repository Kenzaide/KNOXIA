/**
 * Stores the original uploaded files in the browser (IndexedDB), so previews and downloads still
 * work after a refresh. Falls back to memory when IndexedDB is blocked.
 * FRONTEND-ONLY DEMO: replace with server-side file storage when the backend exists.
 */
const DB_NAME = 'knoxia-files', STORE = 'blobs';
const memory = new Map();
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}
const run = (mode, fn) => open().then((db) => new Promise((resolve, reject) => {
  const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE));
  t.oncomplete = () => resolve(req && req.result); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
}));

export const newId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

/** Saves a file. Throws QuotaExceededError when the browser is out of space. */
export async function saveFile(id, blob) {
  try { await run('readwrite', (s) => s.put(blob, id)); memory.delete(id); }
  catch (e) { if (e && e.name === 'QuotaExceededError') throw e; memory.set(id, blob); }
}
export async function getFile(id) {
  if (memory.has(id)) return memory.get(id);
  try { return (await run('readonly', (s) => s.get(id))) || null; } catch { return null; }
}
export async function deleteFile(id) {
  memory.delete(id);
  try { await run('readwrite', (s) => s.delete(id)); } catch { /* nothing to delete */ }
}
/** SHA-256 of the file contents, used to spot duplicates even when the file name differs. */
export async function hashFile(file) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return `${file.name}:${file.size}:${file.lastModified}`; }
}
