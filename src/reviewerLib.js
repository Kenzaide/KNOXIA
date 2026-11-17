/**
 * Reviewer management (Patch 10): the rules for filtering, sorting and organizing saved reviewers,
 * plus `useReviewerLibrary`, the one place that changes the saved list.
 *
 * A saved reviewer is { id, title, file, style, body, created, updated, favorite, folder, generated? }.
 * `favorite` is the bookmark and `folder` is a plain name ('' = Unfiled). Folders are not stored on their
 * own: a folder exists while at least one reviewer is in it. Reviewers saved before this patch have no
 * `created`, `favorite` or `folder`; every helper below reads those as missing-safe.
 *
 * FRONTEND-ONLY DEMO: the list lives in this browser (storage.js). A backend would own it later.
 */
import { useCallback, useMemo } from 'react';
import { useReviewers } from './data.js';

export const MAX_TITLE = 120;
export const MAX_FOLDER = 40;
export const RSORTS = [['updated', 'Recently updated'], ['newest', 'Newest created'], ['oldest', 'Oldest created'], ['title', 'Title A\u2013Z'], ['title-desc', 'Title Z\u2013A'], ['bookmarked', 'Bookmarked first']];

const squash = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
/** Titles and folder names: one line, single spaces, length-limited. */
export const cleanTitle = (s) => squash(s, MAX_TITLE);
export const cleanFolder = (s) => squash(s, MAX_FOLDER);
export const folderOf = (r) => (typeof r.folder === 'string' ? r.folder : '');
const time = (d) => { const t = Date.parse(d); return Number.isNaN(t) ? 0 : t; };
export const createdAt = (r) => time(r.created) || time(r.updated) || Number(r.id) || 0;
export const updatedAt = (r) => time(r.updated) || createdAt(r);
export const wordCount = (r) => (String(r.body || '').match(/\S+/g) || []).length;

const words = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
const haystack = (r) => [r.title, r.file, r.style, folderOf(r)].filter(Boolean).join(' ').toLowerCase();

/** Does a reviewer pass the filters? `omit` skips one filter so the sidebar can count "Folder (3)" without it. */
export function matches(r, f, omit) {
  if (omit !== 'q' && f.q && !words(f.q).every((w) => haystack(r).includes(w))) return false;
  if (omit !== 'folder' && f.unfiled && folderOf(r)) return false;
  if (omit !== 'folder' && f.folder && folderOf(r).toLowerCase() !== f.folder.toLowerCase()) return false;
  if (omit !== 'style' && f.style && r.style !== f.style) return false;
  if (omit !== 'fav' && f.fav && !r.favorite) return false;
  return true;
}

export function sortReviewers(list, sort) {
  const byTitle = (a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base', numeric: true });
  const by = {
    updated: (a, b) => updatedAt(b) - updatedAt(a),
    newest: (a, b) => createdAt(b) - createdAt(a),
    oldest: (a, b) => createdAt(a) - createdAt(b),
    title: byTitle,
    'title-desc': (a, b) => byTitle(b, a),
    bookmarked: (a, b) => Number(!!b.favorite) - Number(!!a.favorite) || updatedAt(b) - updatedAt(a),
  }[sort] || (() => 0);
  return [...list].sort(by); // Array.sort is stable, so equal items keep their order
}

/** Folder names in use, sorted, with how many reviewers each holds. Names that differ only by case are one folder. */
export function folderCounts(list) {
  const map = new Map();
  list.forEach((r) => { const n = folderOf(r); if (!n) return; const k = n.toLowerCase(); const e = map.get(k); if (e) e.count++; else map.set(k, { name: n, count: 1 }); });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
/** Reuses the spelling of a folder that already exists ("ml" -> "ML") so folders never split by capitalization. */
export const resolveFolder = (name, list) => {
  const n = cleanFolder(name); if (!n) return '';
  const hit = list.map(folderOf).find((x) => x && x.toLowerCase() === n.toLowerCase());
  return hit || n;
};

/** The saved list and every change to it. Bookmarking and moving do not touch `updated`; renaming does. */
export function useReviewerLibrary() {
  const [items, setItems] = useReviewers();
  const patch = useCallback((ids, p) => { const set = new Set([].concat(ids)); setItems((a) => a.map((x) => (set.has(x.id) ? { ...x, ...p } : x))); }, [setItems]);
  const api = useMemo(() => ({
    items,
    /** Returns false (and changes nothing) when the new title is empty. */
    rename(id, title) { const t = cleanTitle(title); if (!t) return false; patch(id, { title: t, updated: new Date().toISOString() }); return true; },
    /** Saves the editor: the title (an empty one keeps the old title) and the content together. */
    edit(id, { title, body }) { const cur = items.find((x) => x.id === id); if (!cur) return; patch(id, { title: cleanTitle(title) || cur.title, body: String(body == null ? cur.body : body), updated: new Date().toISOString() }); },
    setBookmark: (ids, on) => patch(ids, { favorite: !!on }),
    move(ids, folder) { patch(ids, { folder: resolveFolder(folder, items) }); },
    /** Renames a folder for everything in it; if `to` is another existing folder the two are merged. Returns { name, count } (count 0 = nothing changed). */
    renameFolder(from, to) {
      const target = resolveFolder(to, items.filter((r) => folderOf(r).toLowerCase() !== from.toLowerCase())); if (!target) return { name: from, count: 0 };
      const ids = items.filter((r) => folderOf(r).toLowerCase() === from.toLowerCase()).map((r) => r.id); patch(ids, { folder: target }); return { name: target, count: ids.length };
    },
    /** Deleting a folder never deletes reviewers: they become Unfiled. */
    removeFolder(name) { const ids = items.filter((r) => folderOf(r).toLowerCase() === name.toLowerCase()).map((r) => r.id); patch(ids, { folder: '' }); return ids.length; },
    remove(ids) { const set = new Set([].concat(ids)); setItems((a) => a.filter((x) => !set.has(x.id))); },
  }), [items, patch, setItems]);
  return api;
}
