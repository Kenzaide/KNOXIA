import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Bookmark, Check, Folder, FolderInput, FolderOpen, Pencil, Plus, Search, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { Button, SectionTitle, ConfirmDialog, PromptDialog } from './ui.jsx';
import { toast, fmtDate } from './materials.jsx';
import { Mark } from './library.jsx';
import { logEvent } from './data.js';
import { RSORTS, MAX_TITLE, MAX_FOLDER, matches, sortReviewers, folderCounts, folderOf, resolveFolder, cleanTitle, wordCount, updatedAt, useReviewerLibrary } from './reviewerLib.js';

/**
 * My Reviewers (Patch 10): the place to manage saved reviewers. Search, sort and filter by folder, style
 * or bookmark; rename, bookmark, move to a folder and delete one at a time or in bulk.
 * Filters live in the URL (like My Materials), so refresh, Back and shared links keep them.
 */
const PAGE = 12;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const sameFolder = (a, b) => a.toLowerCase() === b.toLowerCase();

export default function ReviewerLibrary() {
  const nav = useNavigate(); const lib = useReviewerLibrary(); const { items } = lib; const [sp, setSp] = useSearchParams();
  const [limit, setLimit] = useState(PAGE); const [railOpen, setRailOpen] = useState(false);
  const [selecting, setSelecting] = useState(false); const [sel, setSel] = useState(() => new Set());
  const [rename, setRename] = useState(null); // { id, value } while a title is being edited on its card
  const [dlg, setDlg] = useState(null);       // { kind: 'delete' | 'move' | 'renameFolder' | 'removeFolder', ... }
  const searchRef = useRef(null);

  /* filters live in the URL */
  const f = { q: sp.get('q') || '', folder: sp.get('folder') || '', unfiled: sp.get('unfiled') === '1', style: sp.get('style') || '', fav: sp.get('fav') === '1' };
  const sort = RSORTS.some((s) => s[0] === sp.get('sort')) ? sp.get('sort') : 'updated';
  const set = (patch) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v === '' || v === false || v == null || (k === 'sort' && v === 'updated')) n.delete(k); else n.set(k, v === true ? '1' : v); }
    if (patch.folder) n.delete('unfiled'); if (patch.unfiled) n.delete('folder'); // a folder and "Unfiled" can't both apply
    setSp(n, { replace: true }); setLimit(PAGE);
  };
  const clearAll = () => { const n = new URLSearchParams(); if (sort !== 'updated') n.set('sort', sort); setSp(n, { replace: true }); setLimit(PAGE); };
  const active = [f.q && ['q', `\u201c${f.q}\u201d`], f.folder && ['folder', f.folder], f.unfiled && ['unfiled', 'Unfiled'], f.style && ['style', f.style], f.fav && ['fav', 'Bookmarked']].filter(Boolean);

  const list = useMemo(() => sortReviewers(items.filter((r) => matches(r, f)), sort), [items, sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = list.slice(0, limit);

  /* sidebar facets: each count ignores its own filter, so "Midterms (3)" is what you get if you pick it */
  const allFolders = folderCounts(items).map((x) => x.name); if (f.folder && !allFolders.some((n) => sameFolder(n, f.folder))) allFolders.push(f.folder);
  const folderBase = items.filter((r) => matches(r, f, 'folder'));
  const folderFacet = allFolders.map((n) => [n, folderBase.filter((r) => sameFolder(folderOf(r), n)).length]);
  const unfiledCount = folderBase.filter((r) => !folderOf(r)).length;
  const styleBase = items.filter((r) => matches(r, f, 'style'));
  const styleFacet = [...new Set([...items.map((r) => r.style), f.style].filter(Boolean))].sort().map((s) => [s, styleBase.filter((r) => r.style === s).length]).filter(([s, c]) => c > 0 || s === f.style);
  const favCount = items.filter((r) => matches(r, f, 'fav') && r.favorite).length;
  const everything = items.filter((r) => matches(r, { q: f.q, folder: '', unfiled: false, style: '', fav: false })).length;

  /* selection only ever holds reviewers that still exist */
  useEffect(() => { setSel((s) => { const ids = new Set(items.map((r) => r.id)); const n = new Set([...s].filter((id) => ids.has(id))); return n.size === s.size ? s : n; }); }, [items]);
  useEffect(() => { if (rename && !items.some((r) => r.id === rename.id)) setRename(null); }, [items, rename]);
  useEffect(() => { const k = (e) => { if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); searchRef.current && searchRef.current.focus(); } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const stopSelecting = () => { setSelecting(false); setSel(new Set()); };
  const chosen = items.filter((r) => sel.has(r.id));

  /* actions */
  const bookmark = (r) => { lib.setBookmark(r.id, !r.favorite); toast(r.favorite ? 'Bookmark removed' : 'Reviewer bookmarked'); };
  const bulkBookmark = () => { const all = chosen.every((r) => r.favorite); lib.setBookmark(chosen.map((r) => r.id), !all); toast(all ? 'Bookmarks removed' : 'Bookmarked'); };
  const commitRename = (r) => {
    const t = cleanTitle(rename.value);
    if (!t) { toast('A reviewer needs a title'); return; }
    if (t !== r.title) { lib.rename(r.id, t); toast('Title updated'); }
    setRename(null);
  };
  const doMove = (value) => {
    const ids = dlg.targets.map((r) => r.id); const name = resolveFolder(value, items); lib.move(ids, name); setDlg(null);
    toast(name ? `Moved to \u201c${name}\u201d` : plural(ids.length, 'reviewer') + ' moved out of folders');
  };
  const doRenameFolder = (value) => {
    const from = dlg.name; const res = lib.renameFolder(from, value); setDlg(null);
    if (!res.count) { toast('That folder name is empty'); return; }
    if (f.folder && sameFolder(f.folder, from)) set({ folder: res.name });
    toast(sameFolder(res.name, from) && res.name === from ? 'Folder unchanged' : `Folder renamed to \u201c${res.name}\u201d`);
  };
  const doRemoveFolder = () => { const name = dlg.name; const n = lib.removeFolder(name); setDlg(null); if (f.folder && sameFolder(f.folder, name)) set({ folder: '' }); toast(`Folder removed. ${plural(n, 'reviewer')} kept as Unfiled`); };
  const doDelete = () => {
    const targets = dlg.targets; setDlg(null); lib.remove(targets.map((r) => r.id));
    logEvent(targets.length === 1 ? `Reviewer deleted: ${targets[0].title.slice(0, 80)}` : `${targets.length} reviewers deleted`);
    toast(targets.length === 1 ? 'Reviewer deleted' : `${targets.length} reviewers deleted`);
    setSel((s) => { const n = new Set(s); targets.forEach((r) => n.delete(r.id)); return n; });
  };

  const pick = (r) => selecting ? <label className="sel-box"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.title}`} /></label> : null;
  const mark = (r) => <button type="button" className={`plain-icon star ${r.favorite ? 'on' : ''}`} aria-pressed={!!r.favorite} aria-label={r.favorite ? `Remove bookmark from ${r.title}` : `Bookmark ${r.title}`} onClick={() => bookmark(r)}><Bookmark size={18} fill={r.favorite ? 'currentColor' : 'none'} /></button>;

  const card = (r) => {
    const editing = rename && rename.id === r.id; const fo = folderOf(r);
    return <article key={r.id} className={`material-card lib-card ${sel.has(r.id) ? 'selected' : ''}`}>
      <div className="material-card-top"><div className="lib-lead">{pick(r)}<div className="file-tile purple"><Sparkles size={20} /></div></div>
        <div className="lib-icons">{mark(r)}<button type="button" className="plain-icon" aria-label={`Delete ${r.title}`} onClick={() => setDlg({ kind: 'delete', targets: [r] })}><Trash2 size={18} /></button></div></div>
      {editing
        ? <form className="rv-rename" onSubmit={(e) => { e.preventDefault(); commitRename(r); }}>
            <input className="field" autoFocus aria-label="Reviewer title" maxLength={MAX_TITLE} value={rename.value} onChange={(e) => setRename({ ...rename, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setRename(null); } }} />
            <button type="submit" className="plain-icon" aria-label="Save title"><Check size={18} /></button>
            <button type="button" className="plain-icon" aria-label="Cancel rename" onClick={() => setRename(null)}><X size={18} /></button></form>
        : <h3><Link viewTransition className="lib-title" to={'/reviewers/' + r.id}><Mark text={r.title} q={f.q} /></Link></h3>}
      <p>{fo ? <button type="button" className="lib-subject rv-folder" onClick={() => set({ folder: f.folder && sameFolder(f.folder, fo) ? '' : fo, unfiled: false })}><Folder size={13} /> {fo}</button> : <span className="rv-unfiled">Unfiled</span>}</p>
      <p className="rv-src">{r.style} &middot; from {r.file}</p>
      <div className="material-meta"><span>{plural(wordCount(r), 'word')}</span><span>Updated {fmtDate(updatedAt(r))}</span></div>
      <div className="material-actions"><button type="button" onClick={() => nav('/reviewers/' + r.id, { viewTransition: true })}>Open reviewer <ArrowUpRight size={16} /></button>
        <div className="lib-icons"><button type="button" className="plain-icon" aria-label={`Rename ${r.title}`} onClick={() => setRename({ id: r.id, value: r.title })}><Pencil size={17} /></button>
          <button type="button" className="plain-icon" aria-label={`Move ${r.title} to a folder`} onClick={() => setDlg({ kind: 'move', targets: [r] })}><FolderInput size={17} /></button></div></div></article>;
  };

  const facetBtn = (on, label, count, onClick, icon) => <button type="button" key={label} className={on ? 'on' : ''} aria-pressed={on} onClick={onClick}><span className="rv-fl">{icon}{label}</span><small>{count}</small></button>;
  const moveStart = (() => { const t = dlg && dlg.kind === 'move' ? dlg.targets : []; const fs = [...new Set(t.map(folderOf))]; return fs.length === 1 ? fs[0] : ''; })();

  return <>
    <SectionTitle title="My Reviewers" subtitle={`${plural(items.length, 'reviewer')} \u00b7 ${plural(folderCounts(items).length, 'folder')} \u00b7 ${items.filter((r) => r.favorite).length} bookmarked`} action={<Button icon={Plus} onClick={() => nav('/reviewers/create', { viewTransition: true })}>Create reviewer</Button>} />
    {items.length === 0 ? <div className="empty-state"><Sparkles size={32} /><b>No saved reviewers yet</b><p>Build one from a material or from pasted notes, and it will be kept here.</p><Button icon={Sparkles} onClick={() => nav('/reviewers/create', { viewTransition: true })}>Create AI reviewer</Button></div> : <>
    <div className="toolbar lib-toolbar" role="search">
      <div className="search-field"><Search size={16} /><input ref={searchRef} type="search" aria-label="Search your reviewers" placeholder="Search titles, folders, sources…  ( / )" value={f.q} onChange={(e) => set({ q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape' && f.q) set({ q: '' }); }} />{f.q && <button type="button" className="plain-icon" aria-label="Clear search" onClick={() => set({ q: '' })}><X size={16} /></button>}</div>
      <select className="filter-btn" aria-label="Sort reviewers" value={sort} onChange={(e) => set({ sort: e.target.value })}>{RSORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <button type="button" className={`filter-btn ${selecting ? 'on' : ''}`} aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? 'Done' : 'Select'}</button>
      <button type="button" className="filter-btn lib-filters-btn" aria-expanded={railOpen} onClick={() => setRailOpen(!railOpen)}><SlidersHorizontal size={16} /> Filters{active.length ? ` (${active.length})` : ''}</button></div>

    <div className="lib">
      <aside className={`lib-rail ${railOpen ? 'open' : ''}`} aria-label="Browse and filter">
        <div className="facet"><h4>Library</h4>
          {facetBtn(!f.fav && !f.folder && !f.unfiled && !f.style, 'All reviewers', everything, () => set({ folder: '', unfiled: false, style: '', fav: false }))}
          {facetBtn(f.fav, 'Bookmarked', favCount, () => set({ fav: !f.fav }))}
          {facetBtn(f.unfiled, 'Unfiled', unfiledCount, () => set({ unfiled: !f.unfiled, folder: '' }))}</div>
        <div className="facet"><h4>Folders</h4>
          {folderFacet.length === 0 && <p className="rv-hint">Use <b>Move</b> on a reviewer to start a folder.</p>}
          {folderFacet.map(([n, c]) => facetBtn(f.folder && sameFolder(f.folder, n), n, c, () => set({ folder: f.folder && sameFolder(f.folder, n) ? '' : n, unfiled: false }), <Folder size={14} />))}
          {f.folder && <div className="rv-folder-tools"><button type="button" className="link-btn" onClick={() => setDlg({ kind: 'renameFolder', name: allFolders.find((n) => sameFolder(n, f.folder)) || f.folder })}><Pencil size={13} /> Rename folder</button>
            <button type="button" className="link-btn" onClick={() => setDlg({ kind: 'removeFolder', name: allFolders.find((n) => sameFolder(n, f.folder)) || f.folder })}><FolderOpen size={13} /> Remove folder</button></div>}</div>
        {styleFacet.length > 0 && <div className="facet"><h4>Format</h4>{styleFacet.map(([s, c]) => facetBtn(f.style === s, s, c, () => set({ style: f.style === s ? '' : s })))}</div>}
        {active.length > 0 && <button type="button" className="btn outline" onClick={clearAll}>Clear all filters</button>}</aside>

      <section aria-label="Reviewers">
        <div className="lib-summary"><p className="muted" role="status" aria-live="polite">{list.length === 0 ? 'No matching reviewers' : `Showing ${shown.length} of ${list.length}${list.length !== items.length ? ` (filtered from ${items.length})` : ''}`}</p>
          {selecting && list.length > 0 && <label className="check-inline"><input type="checkbox" checked={list.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(list.map((r) => r.id)) : new Set())} /> Select all {list.length}</label>}</div>
        {active.length > 0 && <div className="chips" aria-label="Active filters">{active.map(([k, label]) => <button type="button" key={k} className="chip" onClick={() => set({ [k]: k === 'fav' || k === 'unfiled' ? false : '' })} aria-label={`Remove filter ${label}`}>{label} <X size={12} /></button>)}<button type="button" className="link-btn" onClick={clearAll}>Clear all</button></div>}
        {list.length === 0 ? <div className="empty-state"><Search size={32} /><b>No reviewers match</b><p>Try different words or remove a filter.</p><Button variant="outline" onClick={clearAll}>Clear all filters</Button></div>
          : <div className="material-grid">{shown.map(card)}</div>}
        {shown.length < list.length && <div className="lib-more"><Button variant="outline" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, list.length - shown.length)} more</Button></div>}
      </section></div>

    {selecting && <div className="bulk-bar" role="region" aria-label="Bulk actions"><b>{sel.size} selected</b>
      <button type="button" className="btn outline" disabled={!sel.size} onClick={() => setDlg({ kind: 'move', targets: chosen })}><FolderInput size={16} /> Move to folder</button>
      <button type="button" className="btn outline" disabled={!sel.size} onClick={bulkBookmark}><Bookmark size={16} /> {chosen.length && chosen.every((r) => r.favorite) ? 'Remove bookmark' : 'Bookmark'}</button>
      <button type="button" className="btn outline" disabled={!sel.size} onClick={() => setDlg({ kind: 'delete', targets: chosen })}><Trash2 size={16} /> Delete</button>
      <button type="button" className="link-btn" onClick={stopSelecting}>Cancel</button></div>}
    </>}

    {dlg && dlg.kind === 'delete' && <ConfirmDialog icon={Trash2} title={dlg.targets.length === 1 ? `Delete \u201c${dlg.targets[0].title}\u201d?` : `Delete ${dlg.targets.length} reviewers?`} body="This permanently removes the reviewer and anything you edited in it. This can't be undone." confirmLabel="Delete" onCancel={() => setDlg(null)} onConfirm={doDelete} />}
    {dlg && dlg.kind === 'move' && <PromptDialog title={dlg.targets.length === 1 ? `Move \u201c${dlg.targets[0].title}\u201d` : `Move ${dlg.targets.length} reviewers`} body={`Type a folder name, or pick one below. Leave it empty to take ${dlg.targets.length === 1 ? 'it' : 'them'} out of any folder.`} label="Folder name" value={moveStart} placeholder="e.g. Midterms" maxLength={MAX_FOLDER} suggestions={folderCounts(items).map((x) => x.name)} allowEmpty confirmLabel="Move" onSubmit={doMove} onCancel={() => setDlg(null)} />}
    {dlg && dlg.kind === 'renameFolder' && <PromptDialog icon={Pencil} title="Rename folder" body="Every reviewer in it moves to the new name. Using an existing folder's name merges the two." label="Folder name" value={dlg.name} maxLength={MAX_FOLDER} confirmLabel="Rename" onSubmit={doRenameFolder} onCancel={() => setDlg(null)} />}
    {dlg && dlg.kind === 'removeFolder' && <ConfirmDialog icon={FolderOpen} title={`Remove folder \u201c${dlg.name}\u201d?`} body="Your reviewers are not deleted. They become Unfiled." confirmLabel="Remove folder" onCancel={() => setDlg(null)} onConfirm={doRemoveFolder} />}
  </>;
}
