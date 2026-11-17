import React, { useCallback, useMemo } from 'react';
import { useUserData } from './storage.js';
import { deleteFile } from './files.js';

const KEY = 'knoxia-materials';
export const SUBJECTS = ['Artificial Intelligence', 'Computer Science', 'Computer Systems', 'Cybersecurity', 'Networks', 'Other'];

const seed = [
  { id: '1', name: 'Introduction to Machine Learning', type: 'PDF', size: '2.4 MB', bytes: 2516582, uploaded: '2026-11-14T08:00:00', subject: 'Artificial Intelligence', tags: ['midterm', 'ml'], favorite: true, desc: 'Supervised and unsupervised learning basics.' },
  { id: '2', name: 'Automata Theory — Module 03', type: 'PDF', size: '1.8 MB', bytes: 1887437, uploaded: '2026-11-12T08:00:00', subject: 'Computer Science', tags: ['theory', 'midterm'], desc: 'Finite automata and regular languages.' },
  { id: '3', name: 'Computer Architecture Notes', type: 'PPTX', size: '5.1 MB', bytes: 5347737, uploaded: '2026-11-10T08:00:00', subject: 'Computer Systems', tags: ['lecture'], desc: 'CPU design, memory hierarchy and pipelining.' },
  { id: '4', name: 'Information Assurance Reviewer', type: 'DOCX', size: '840 KB', bytes: 860160, uploaded: '2026-11-08T08:00:00', subject: 'Cybersecurity', tags: ['reviewer', 'finals'], desc: 'Security principles and risk management.' },
  { id: '5', name: 'Data Structures — Trees and Graphs', type: 'PDF', size: '3.2 MB', bytes: 3355443, uploaded: '2026-10-30T08:00:00', subject: 'Computer Science', tags: ['finals', 'algorithms'], favorite: true, desc: 'Binary trees, heaps, BFS and DFS.' },
  { id: '6', name: 'Computer Networks — OSI and TCP/IP', type: 'PPTX', size: '4.4 MB', bytes: 4613734, uploaded: '2026-10-22T08:00:00', subject: 'Networks', tags: ['lecture', 'midterm'], desc: 'Layers, addressing and routing basics.' },
  { id: '7', name: 'Neural Networks Lab Guide', type: 'DOCX', size: '1.1 MB', bytes: 1153434, uploaded: '2026-10-15T08:00:00', subject: 'Artificial Intelligence', tags: ['lab', 'ml'], desc: 'Step-by-step lab on training a small network.' },
  { id: '8', name: 'Operating Systems Summary', type: 'PDF', size: '960 KB', bytes: 983040, uploaded: '2026-09-28T08:00:00', subject: 'Computer Systems', tags: ['reviewer'], desc: 'Processes, scheduling and memory management.' },
];
export const SEED_MATERIALS = seed; // the sample library a new account starts with, shown until it saves its own

export const colorOf = (t) => ({ PDF: 'blue', DOCX: 'green', PPTX: 'orange' }[t] || 'blue');
export const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
/** File size in bytes. Older items only have the text size ("2.4 MB"). */
export const sizeBytes = (m) => { if (typeof m.bytes === 'number') return m.bytes; const x = /([\d.]+)\s*(KB|MB)/i.exec(m.size || ''); return x ? Math.round(parseFloat(x[1]) * (x[2].toUpperCase() === 'MB' ? 1048576 : 1024)) : 0; };
export const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

/* ---------- upload rules ---------- */
export const MAX_MB = 25, MAX_BYTES = MAX_MB * 1048576, MAX_BATCH = 10;
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const TYPES = {
  pdf: { label: 'PDF', mimes: ['application/pdf'], magic: [0x25, 0x50, 0x44, 0x46] },
  docx: { label: 'DOCX', mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], magic: ZIP },
  pptx: { label: 'PPTX', mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], magic: ZIP },
};
export const fileExt = (name) => (String(name).split('.').pop() || '').toLowerCase();
/** Checks type, size and real file contents. Returns { ok, type } or { ok: false, error }. */
export async function validateFile(file) {
  const t = TYPES[fileExt(file.name)];
  if (!t) return { ok: false, error: 'Unsupported file type. Use PDF, DOCX or PPTX.' };
  if (file.size === 0) return { ok: false, error: 'This file is empty.' };
  if (file.size > MAX_BYTES) return { ok: false, error: `This file is ${fmtSize(file.size)}. The limit is ${MAX_MB} MB.` };
  if (file.type && file.type !== 'application/octet-stream' && !t.mimes.includes(file.type)) return { ok: false, error: `This does not look like a real ${t.label} file.` };
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (!t.magic.every((b, i) => head[i] === b)) return { ok: false, error: `This ${t.label} file is damaged or is not really a ${t.label}.` };
  } catch { return { ok: false, error: 'This file could not be read.' }; }
  return { ok: true, type: t.label };
}
/** "ai, notes,  AI" -> ['ai', 'notes'] (max 8 tags, 24 characters each, no duplicates). */
export const parseTags = (s) => [...new Set(String(s || '').split(',').map((x) => x.trim().slice(0, 24)).filter(Boolean).map((x) => x.toLowerCase()))].slice(0, 8);

export const toast = (msg) => window.dispatchEvent(new CustomEvent('knoxia-toast', { detail: msg }));

// Kept so main.jsx needn't change: the library now lives in shared storage (storage.js), not in this provider.
export const MaterialsProvider = ({ children }) => children;

export function useMaterials() {
  const [items, setItems] = useUserData(KEY, []);
  const add = useCallback((m) => {
    const item = { ...m, id: m.id || String(Date.now()), uploaded: new Date().toISOString() };
    setItems((a) => [item, ...a]);
    return item;
  }, [setItems]);
  const update = useCallback((id, patch) => setItems((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x))), [setItems]);
  const remove = useCallback((id) => { deleteFile(id); setItems((a) => a.filter((x) => x.id !== id)); }, [setItems]);
  const updateMany = useCallback((ids, patch) => { const set = new Set(ids); setItems((a) => a.map((x) => (set.has(x.id) ? { ...x, ...patch } : x))); }, [setItems]);
  const removeMany = useCallback((ids) => { const set = new Set(ids); set.forEach((id) => deleteFile(id)); setItems((a) => a.filter((x) => !set.has(x.id))); }, [setItems]);
  return useMemo(() => ({ items, add, update, remove, updateMany, removeMany }), [items, add, update, remove, updateMany, removeMany]);
}
