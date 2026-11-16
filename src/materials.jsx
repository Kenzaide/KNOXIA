import React, { useCallback, useMemo } from 'react';
import { useUserData } from './storage.js';

const KEY = 'knoxia-materials';
export const SUBJECTS = ['Artificial Intelligence', 'Computer Science', 'Computer Systems', 'Cybersecurity', 'Networks', 'Other'];
export const previews = new Map(); // material id -> object URL (this browser session only)

const seed = [
  { id: '1', name: 'Introduction to Machine Learning', type: 'PDF', size: '2.4 MB', uploaded: '2026-11-14T08:00:00', subject: 'Artificial Intelligence', desc: 'Supervised and unsupervised learning basics.' },
  { id: '2', name: 'Automata Theory — Module 03', type: 'PDF', size: '1.8 MB', uploaded: '2026-11-12T08:00:00', subject: 'Computer Science', desc: 'Finite automata and regular languages.' },
  { id: '3', name: 'Computer Architecture Notes', type: 'PPTX', size: '5.1 MB', uploaded: '2026-11-10T08:00:00', subject: 'Computer Systems', desc: 'CPU design, memory hierarchy and pipelining.' },
  { id: '4', name: 'Information Assurance Reviewer', type: 'DOCX', size: '840 KB', uploaded: '2026-11-08T08:00:00', subject: 'Cybersecurity', desc: 'Security principles and risk management.' },
];

export const colorOf = (t) => ({ PDF: 'blue', DOCX: 'green', PPTX: 'orange' }[t] || 'blue');
export const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
export const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

export const toast = (msg) => window.dispatchEvent(new CustomEvent('knoxia-toast', { detail: msg }));

// Kept so main.jsx needn't change: the library now lives in shared storage (storage.js), not in this provider.
export const MaterialsProvider = ({ children }) => children;

export function useMaterials() {
  const [items, setItems] = useUserData(KEY, seed);
  const add = useCallback((m) => {
    const item = { ...m, id: String(Date.now()), uploaded: new Date().toISOString() };
    setItems((a) => [item, ...a]);
    return item;
  }, [setItems]);
  const update = useCallback((id, patch) => setItems((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x))), [setItems]);
  const remove = useCallback((id) => { previews.delete(id); setItems((a) => a.filter((x) => x.id !== id)); }, [setItems]);
  return useMemo(() => ({ items, add, update, remove }), [items, add, update, remove]);
}
