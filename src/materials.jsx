import React, { useCallback, useMemo } from 'react';
import { useUserData } from './storage.js';
import { deleteFile } from './files.js';

const KEY = 'knoxia-materials';
export const SUBJECTS = ['Artificial Intelligence', 'Computer Science', 'Computer Systems', 'Cybersecurity', 'Networks', 'Other'];

const seed = [
  { id: '1', name: 'Introduction to Machine Learning', type: 'PDF', size: '2.4 MB', uploaded: '2026-11-14T08:00:00', subject: 'Artificial Intelligence', desc: 'Supervised and unsupervised learning basics.' },
  { id: '2', name: 'Automata Theory — Module 03', type: 'PDF', size: '1.8 MB', uploaded: '2026-11-12T08:00:00', subject: 'Computer Science', desc: 'Finite automata and regular languages.' },
  { id: '3', name: 'Computer Architecture Notes', type: 'PPTX', size: '5.1 MB', uploaded: '2026-11-10T08:00:00', subject: 'Computer Systems', desc: 'CPU design, memory hierarchy and pipelining.' },
  { id: '4', name: 'Information Assurance Reviewer', type: 'DOCX', size: '840 KB', uploaded: '2026-11-08T08:00:00', subject: 'Cybersecurity', desc: 'Security principles and risk management.' },
];

export const colorOf = (t) => ({ PDF: 'blue', DOCX: 'green', PPTX: 'orange' }[t] || 'blue');
export const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
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
  const [items, setItems] = useUserData(KEY, seed);
  const add = useCallback((m) => {
    const item = { ...m, id: m.id || String(Date.now()), uploaded: new Date().toISOString() };
    setItems((a) => [item, ...a]);
    return item;
  }, [setItems]);
  const update = useCallback((id, patch) => setItems((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x))), [setItems]);
  const remove = useCallback((id) => { deleteFile(id); setItems((a) => a.filter((x) => x.id !== id)); }, [setItems]);
  return useMemo(() => ({ items, add, update, remove }), [items, add, update, remove]);
}
