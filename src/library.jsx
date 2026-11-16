import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Upload, FileText, Trash2, ArrowUpRight, FolderOpen, Star, LayoutGrid, List, X, SlidersHorizontal, FolderInput, ChevronUp, ChevronDown } from 'lucide-react';
import { useMaterials, toast, colorOf, fmtDate, fmtSize, sizeBytes } from './materials.jsx';
import { useUserData } from './storage.js';
import { Button, SectionTitle, ConfirmDialog, PageSkeleton, usePending } from './ui.jsx';

/* ---------- filtering and sorting (pure, easy to test) ---------- */
export const SORTS = [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['name', 'Name A–Z'], ['name-desc', 'Name Z–A'], ['size-desc', 'Largest first'], ['size', 'Smallest first'], ['subject', 'Subject']];
export const ADDED = [['any', 'Any time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']];
const TYPES = ['PDF', 'DOCX', 'PPTX'];
const PAGE = 12;
const words = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
const haystack = (m) => [m.name, m.fileName, m.subject, m.type, m.desc, ...(m.tags || [])].filter(Boolean).join(' ').toLowerCase();

/** Does a material pass the filters? `omit` skips one filter, used to count facets ("PDF (3)") without that filter applied. */
export function matches(m, f, omit) {
  if (omit !== 'q' && f.q && !words(f.q).every((w) => haystack(m).includes(w))) return false;
  if (omit !== 'subject' && f.subject && m.subject !== f.subject) return false;
  if (omit !== 'type' && f.type && m.type !== f.type) return false;
  if (omit !== 'tag' && f.tag && !(m.tags || []).includes(f.tag)) return false;
  if (omit !== 'fav' && f.fav && !m.favorite) return false;
  if (omit !== 'added' && f.added !== 'any' && Date.now() - new Date(m.uploaded).getTime() > Number(f.added) * 864e5) return false;
  return true;
}
export function sortItems(list, sort) {
  const by = { newest: (a, b) => new Date(b.uploaded) - new Date(a.uploaded), oldest: (a, b) => new Date(a.uploaded) - new Date(b.uploaded),
    name: (a, b) => a.name.localeCompare(b.name), 'name-desc': (a, b) => b.name.localeCompare(a.name), 'size-desc': (a, b) => sizeBytes(b) - sizeBytes(a), size: (a, b) => sizeBytes(a) - sizeBytes(b),
    subject: (a, b) => a.subject.localeCompare(b.subject) || a.name.localeCompare(b.name) }[sort] || (() => 0);
  return [...list].sort(by);
}

function Mark({ text, q }) { // highlights search words inside a title
  const ws = words(q); if (!ws.length) return text;
  const re = new RegExp('(' + ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
  return text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p));
}

export default function MaterialLibrary() {
  const nav = useNavigate(); const loading = usePending(); const { items, remove, removeMany, update, updateMany } = useMaterials();
  const [sp, setSp] = useSearchParams(); const [view, setView] = useUserData('knoxia-library-view', 'grid');
  const [limit, setLimit] = useState(PAGE); const [selecting, setSelecting] = useState(false); const [sel, setSel] = useState(() => new Set());
  const [del, setDel] = useState(null); const [railOpen, setRailOpen] = useState(false); const [moveTo, setMoveTo] = useState(''); const searchRef = useRef(null);

  /* filters live in the URL, so a refresh, the back button and shared links all keep them */
  const f = { q: sp.get('q') || '', subject: sp.get('subject') || '', type: sp.get('type') || '', tag: sp.get('tag') || '', fav: sp.get('fav') === '1', added: ADDED.some((a) => a[0] === sp.get('added')) ? sp.get('added') : 'any' };
  const sort = SORTS.some((s) => s[0] === sp.get('sort')) ? sp.get('sort') : 'newest'; const group = ['subject', 'type'].includes(sp.get('group')) ? sp.get('group') : '';
  const set = (patch) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v === '' || v === false || v == null || (k === 'added' && v === 'any') || (k === 'sort' && v === 'newest')) n.delete(k); else n.set(k, v === true ? '1' : v); }
    setSp(n, { replace: true }); setLimit(PAGE);
  };
  const clearAll = () => { const n = new URLSearchParams(); if (sort !== 'newest') n.set('sort', sort); if (group) n.set('group', group); setSp(n, { replace: true }); setLimit(PAGE); };
  const active = [f.q && ['q', `“${f.q}”`], f.subject && ['subject', f.subject], f.type && ['type', f.type], f.tag && ['tag', `#${f.tag}`], f.fav && ['fav', 'Favorites'], f.added !== 'any' && ['added', ADDED.find((a) => a[0] === f.added)[1]]].filter(Boolean);

  const list = useMemo(() => sortItems(items.filter((m) => matches(m, f)), sort), [items, sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = list.slice(0, limit);
  const facet = (key, values) => { const base = items.filter((m) => matches(m, f, key)); return values.map((v) => [v, base.filter((m) => (key === 'subject' ? m.subject === v : key === 'type' ? m.type === v : (m.tags || []).includes(v))).length]); };
  const subjects = useMemo(() => [...new Set([...items.map((m) => m.subject), f.subject].filter(Boolean))].sort(), [items, f.subject]);
  const subjectFacet = facet('subject', subjects).filter(([v, c]) => c > 0 || v === f.subject);
  const typeFacet = facet('type', TYPES).filter(([v, c]) => c > 0 || v === f.type);
  const tagCounts = new Map(); items.filter((m) => matches(m, f, 'tag')).forEach((m) => (m.tags || []).forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
  const tagFacet = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14); if (f.tag && !tagCounts.has(f.tag)) tagFacet.push([f.tag, 0]);
  const favCount = items.filter((m) => matches(m, f, 'fav') && m.favorite).length;

  // selection only ever contains materials that still exist
  useEffect(() => { setSel((s) => { const ids = new Set(items.map((m) => m.id)); const n = new Set([...s].filter((id) => ids.has(id))); return n.size === s.size ? s : n; }); }, [items]);
  useEffect(() => { const k = (e) => { if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); searchRef.current && searchRef.current.focus(); } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const stopSelecting = () => { setSelecting(false); setSel(new Set()); setMoveTo(''); };
  const ids = [...sel]; const chosen = items.filter((m) => sel.has(m.id));

  const bulkMove = () => { const s = moveTo.trim().slice(0, 40); if (!s) return; updateMany(ids, { subject: s }); toast(`${ids.length} ${ids.length === 1 ? 'material' : 'materials'} moved to “${s}”`); setMoveTo(''); };
  const bulkFav = () => { const all = chosen.every((m) => m.favorite); updateMany(ids, { favorite: !all }); toast(all ? 'Removed from favorites' : 'Added to favorites'); };
  const confirmDelete = () => { const targets = del; setDel(null); if (targets.length === 1) remove(targets[0].id); else removeMany(targets.map((m) => m.id)); toast(targets.length === 1 ? 'Material deleted' : `${targets.length} materials deleted`); setSel((s) => { const n = new Set(s); targets.forEach((m) => n.delete(m.id)); return n; }); };

  const totalBytes = items.reduce((s, m) => s + sizeBytes(m), 0);
  if (loading) return <PageSkeleton cards />;

  const groups = group ? [...shown.reduce((map, m) => { const k = group === 'subject' ? m.subject : m.type; map.set(k, [...(map.get(k) || []), m]); return map; }, new Map())].sort((a, b) => a[0].localeCompare(b[0])) : [['', shown]];
  const groupTotal = (k) => list.filter((m) => (group === 'subject' ? m.subject : m.type) === k).length;

  const star = (m) => <button type="button" className={`plain-icon star ${m.favorite ? 'on' : ''}`} aria-pressed={!!m.favorite} aria-label={m.favorite ? `Remove ${m.name} from favorites` : `Add ${m.name} to favorites`} onClick={() => { update(m.id, { favorite: !m.favorite }); }}><Star size={18} fill={m.favorite ? 'currentColor' : 'none'} /></button>;
  const pick = (m) => selecting ? <label className="sel-box"><input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Select ${m.name}`} /></label> : null;
  const tags = (m, max = 3) => { const t = m.tags || []; return t.length ? <div className="lib-tags">{t.slice(0, max).map((x) => <button type="button" key={x} className={f.tag === x ? 'on' : ''} onClick={() => set({ tag: f.tag === x ? '' : x })}>#{x}</button>)}{t.length > max && <span>+{t.length - max}</span>}</div> : null; };
  const sortHead = (label, asc, desc) => <button type="button" className="lib-sort" onClick={() => set({ sort: sort === asc ? desc : asc })} aria-label={`Sort by ${label}`}>{label}{sort === asc ? <ChevronUp size={14} /> : sort === desc ? <ChevronDown size={14} /> : null}</button>;

  const card = (m) => <article key={m.id} className={`material-card lib-card ${sel.has(m.id) ? 'selected' : ''}`}>
    <div className="material-card-top"><div className="lib-lead">{pick(m)}<div className={`file-tile ${m.color || colorOf(m.type)}`}><FileText size={20} /></div></div><div className="lib-icons">{star(m)}<button type="button" className="plain-icon" aria-label={`Delete ${m.name}`} onClick={() => setDel([m])}><Trash2 size={18} /></button></div></div>
    <h3><Mark text={m.name} q={f.q} /></h3>
    <p><button type="button" className="lib-subject" onClick={() => set({ subject: f.subject === m.subject ? '' : m.subject })}>{m.subject}</button></p>
    {tags(m)}<div className="material-meta"><span>{m.type} · {m.size}</span><span>{fmtDate(m.uploaded)}</span></div>
    <div className="material-actions"><button type="button" onClick={() => nav('/materials/' + m.id)}>Open material <ArrowUpRight size={16} /></button></div></article>;
  const row = (m) => <div key={m.id} className={`lib-row ${sel.has(m.id) ? 'selected' : ''}`} role="listitem">
    <div className="lib-lead">{pick(m)}<div className={`file-tile ${m.color || colorOf(m.type)}`}><FileText size={18} /></div></div>
    <div className="lib-name"><button type="button" className="lib-title" onClick={() => nav('/materials/' + m.id)}><Mark text={m.name} q={f.q} /></button>{tags(m, 4)}</div>
    <button type="button" className="lib-subject lib-col" onClick={() => set({ subject: f.subject === m.subject ? '' : m.subject })}>{m.subject}</button>
    <span className="lib-col">{m.type}</span><span className="lib-col">{m.size}</span><span className="lib-col">{fmtDate(m.uploaded)}</span>
    <div className="lib-icons">{star(m)}<button type="button" className="plain-icon" aria-label={`Open ${m.name}`} onClick={() => nav('/materials/' + m.id)}><ArrowUpRight size={18} /></button><button type="button" className="plain-icon" aria-label={`Delete ${m.name}`} onClick={() => setDel([m])}><Trash2 size={18} /></button></div></div>;

  const facetBtn = (on, label, count, onClick) => <button type="button" key={label} className={on ? 'on' : ''} aria-pressed={on} onClick={onClick}><span>{label}</span><small>{count}</small></button>;

  return <>
    <SectionTitle title="My Materials" subtitle={`${items.length} ${items.length === 1 ? 'file' : 'files'} · ${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'} · ${fmtSize(totalBytes)}`} action={<Button icon={Upload} onClick={() => nav('/materials/upload')}>Upload material</Button>} />
    {items.length === 0 ? <div className="empty-state"><FolderOpen size={32} /><b>No materials yet</b><p>Upload your first file to get started.</p><Button icon={Upload} onClick={() => nav('/materials/upload')}>Upload material</Button></div> : <>
    <div className="toolbar lib-toolbar" role="search">
      <div className="search-field"><Search size={16} /><input ref={searchRef} type="search" aria-label="Search your materials" placeholder="Search titles, subjects, tags…  ( / )" value={f.q} onChange={(e) => set({ q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape' && f.q) set({ q: '' }); }} />{f.q && <button type="button" className="plain-icon" aria-label="Clear search" onClick={() => set({ q: '' })}><X size={16} /></button>}</div>
      <select className="filter-btn" aria-label="Sort materials" value={sort} onChange={(e) => set({ sort: e.target.value })}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select className="filter-btn" aria-label="Group materials" value={group} onChange={(e) => set({ group: e.target.value })}><option value="">No grouping</option><option value="subject">Group by subject</option><option value="type">Group by file type</option></select>
      <div className="segmented" role="group" aria-label="View"><button type="button" className={view === 'grid' ? 'selected' : ''} aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')}><LayoutGrid size={16} /></button><button type="button" className={view === 'list' ? 'selected' : ''} aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')}><List size={16} /></button></div>
      <button type="button" className={`filter-btn ${selecting ? 'on' : ''}`} aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? 'Done' : 'Select'}</button>
      <button type="button" className="filter-btn lib-filters-btn" aria-expanded={railOpen} onClick={() => setRailOpen(!railOpen)}><SlidersHorizontal size={16} /> Filters{active.length ? ` (${active.length})` : ''}</button></div>

    <div className="lib">
      <aside className={`lib-rail ${railOpen ? 'open' : ''}`} aria-label="Browse and filter">
        <div className="facet"><h4>Library</h4>{facetBtn(!f.fav && !f.subject && !f.type && !f.tag && f.added === 'any', 'All materials', items.filter((m) => matches(m, { ...f, subject: '', type: '', tag: '', fav: false, added: 'any' })).length, () => set({ subject: '', type: '', tag: '', fav: false, added: 'any' }))}{facetBtn(f.fav, 'Favorites', favCount, () => set({ fav: !f.fav }))}</div>
        <div className="facet"><h4>Subjects</h4>{subjectFacet.map(([v, c]) => facetBtn(f.subject === v, v, c, () => set({ subject: f.subject === v ? '' : v })))}</div>
        <div className="facet"><h4>File type</h4>{typeFacet.map(([v, c]) => facetBtn(f.type === v, v, c, () => set({ type: f.type === v ? '' : v })))}</div>
        <div className="facet"><h4>Date added</h4><select className="filter-btn" aria-label="Date added" value={f.added} onChange={(e) => set({ added: e.target.value })}>{ADDED.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        {tagFacet.length > 0 && <div className="facet"><h4>Tags</h4><div className="lib-tags wrap">{tagFacet.map(([v, c]) => <button type="button" key={v} className={f.tag === v ? 'on' : ''} aria-pressed={f.tag === v} onClick={() => set({ tag: f.tag === v ? '' : v })}>#{v} <small>{c}</small></button>)}</div></div>}
        {active.length > 0 && <button type="button" className="btn outline" onClick={clearAll}>Clear all filters</button>}</aside>

      <section aria-label="Materials">
        <div className="lib-summary"><p className="muted" role="status" aria-live="polite">{list.length === 0 ? 'No matching materials' : `Showing ${shown.length} of ${list.length}${list.length !== items.length ? ` (filtered from ${items.length})` : ''}`}</p>
          {selecting && list.length > 0 && <label className="check-inline"><input type="checkbox" checked={list.every((m) => sel.has(m.id))} onChange={(e) => setSel(e.target.checked ? new Set(list.map((m) => m.id)) : new Set())} /> Select all {list.length}</label>}</div>
        {active.length > 0 && <div className="chips" aria-label="Active filters">{active.map(([k, label]) => <button type="button" key={k} className="chip" onClick={() => set({ [k]: k === 'added' ? 'any' : k === 'fav' ? false : '' })} aria-label={`Remove filter ${label}`}>{label} <X size={12} /></button>)}<button type="button" className="link-btn" onClick={clearAll}>Clear all</button></div>}

        {list.length === 0 ? <div className="empty-state"><Search size={32} /><b>No materials match</b><p>Try different words or remove a filter.</p><Button variant="outline" onClick={clearAll}>Clear all filters</Button></div> :
          groups.map(([label, rows]) => <div key={label || 'all'} className="lib-group">
            {group && <h3 className="lib-group-title">{label} <span>{groupTotal(label)}</span></h3>}
            {view === 'grid' ? <div className="material-grid">{rows.map(card)}</div> :
              <div className="panel lib-list" role="list"><div className="lib-row lib-head" aria-hidden={false}><span /><span>{sortHead('Name', 'name', 'name-desc')}</span><span className="lib-col">{sortHead('Subject', 'subject', 'subject')}</span><span className="lib-col">Type</span><span className="lib-col">{sortHead('Size', 'size', 'size-desc')}</span><span className="lib-col">{sortHead('Added', 'oldest', 'newest')}</span><span /></div>{rows.map(row)}</div>}</div>)}
        {shown.length < list.length && <div className="lib-more"><Button variant="outline" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, list.length - shown.length)} more</Button></div>}
      </section></div>

    {selecting && <div className="bulk-bar" role="region" aria-label="Bulk actions"><b>{sel.size} selected</b>
      <div className="bulk-move"><FolderInput size={16} /><input list="lib-subjects" aria-label="Move selected to subject" placeholder="Move to subject…" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && sel.size) bulkMove(); }} /><datalist id="lib-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist><button type="button" className="btn outline" disabled={!sel.size || !moveTo.trim()} onClick={bulkMove}>Move</button></div>
      <button type="button" className="btn outline" disabled={!sel.size} onClick={bulkFav}><Star size={16} /> {chosen.length && chosen.every((m) => m.favorite) ? 'Unfavorite' : 'Favorite'}</button>
      <button type="button" className="btn outline" disabled={!sel.size} onClick={() => setDel(chosen)}><Trash2 size={16} /> Delete</button>
      <button type="button" className="link-btn" onClick={stopSelecting}>Cancel</button></div>}
    </>}
    {del && <ConfirmDialog icon={Trash2} title={del.length === 1 ? `Delete “${del[0].name}”?` : `Delete ${del.length} materials?`} body="This removes the files and their details from your library. This can't be undone." confirmLabel="Delete" onCancel={() => setDel(null)} onConfirm={confirmDelete} />}
  </>;
}
