import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ThemePicker } from './theme.jsx';
import { Bookmark, FolderInput, Sparkles, Layers, CheckCircle2, Trophy, Crown, Flame, Clock3, Target, Bell, ShieldCheck, Activity, Plus, Trash2, Send, Play, Pause, RotateCcw, Check, Download, Printer, Users, Zap, BookOpen, Medal, ArrowUpRight, Lock, CalendarDays, Swords } from 'lucide-react';
import { toast } from './materials.jsx';
import { useProfile } from './accounts.js';
import { ProfileEditor } from './profile.jsx';
import { QuizRunner } from './quizRunner.jsx'; // the shared quiz runner (Patch 13), used here by Quiz Challenges
import { ConfirmDialog, PromptDialog } from './ui.jsx';
import { track, useProgressLog, useStudyProgress } from './progressStore.js'; // study progress (Patch 15)
import { fmtTime, topicMastery } from './progressCalc.js';
import { useMyGamification } from './gamificationStore.js'; // XP and levels (Patches 23 and 24)
import { MAX_TITLE, MAX_FOLDER, cleanTitle, folderOf, folderCounts, resolveFolder, updatedAt, useReviewerLibrary } from './reviewerLib.js';
import { BANK, CHALLENGES, BOARD, useNotes, useReviewers, useChallenges, usePlan, useSettings, useReports, useLogs, pushLS, logEvent } from './data.js';

const Btn = ({ children, v = 'primary', icon: I, ...p }) => <button type="button" className={`btn ${v}`} {...p}>{I && <I size={16} />}<span>{children}</span></button>;
const Head = ({ title, sub, action }) => <div className="section-title"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div>;
const Stat = ({ label, value, note, icon: I, tone = '' }) => <div className="stat-card"><div className={`stat-icon ${tone}`}><I size={18} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>;
const Row = ({ tone = 'blue', icon: I, title, sub, children, ...p }) => <div className="generic-row" {...p}><div className={`activity-dot ${tone}`}><I size={16} /></div><div><b>{title}</b><small>{sub}</small></div>{children}</div>;
const Empty = ({ icon: I, title, text, action }) => <div className="empty-state"><I size={32} /><b>{title}</b><p>{text}</p>{action}</div>;
const dl = (name, rows) => { const b = new Blob([rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
const when = d => new Date(d).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit' });
const ICONS = { Flame, Trophy, Target, Zap, Layers, Users, BookOpen, Medal };

/* ---------- Reviewers ---------- */
// Latest saved reviewers, shown under the builder. Everything else (search, folders, bulk actions) lives on My Reviewers.
export function SavedReviewers() {
  const [list] = useReviewers();
  if (!list.length) return null;
  const recent = [...list].sort((a, b) => updatedAt(b) - updatedAt(a)).slice(0, 5);
  return <div className="panel list-panel" style={{ marginTop: 17 }}><div className="list-head"><h3>Saved reviewers</h3><Link className="link-btn" to="/reviewers" viewTransition>Manage all ({list.length}) <ArrowUpRight size={16} /></Link></div>
    {recent.map(r => <Row key={r.id} icon={r.favorite ? Bookmark : Sparkles} title={r.title} sub={`${r.style} · ${r.file}${folderOf(r) ? ` · ${folderOf(r)}` : ''}`}><Link className="link-btn" to={'/reviewers/' + r.id}>Open <ArrowUpRight size={16} /></Link></Row>)}</div>;
}
const BookmarkOn = p => <Bookmark {...p} fill="currentColor" />; // filled when a reviewer is bookmarked

// Render generated Markdown as React elements, never as executable HTML.
// The editor retains the exact original text; this view only changes presentation.
function ReviewerReadingView({ content }) {
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
  // Older generated reviewers have metadata labels before the actual Markdown.
  const start = lines.findIndex(line => /^GENERATED REVIEWER\s*$/i.test(line.trim()));
  if (start >= 0) lines.splice(0, start + 1);
  const nodes = [];
  const inline = (value) => String(value).split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|\x60[^\x60]+\x60)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('\x60') && part.endsWith('\x60')) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i], line = raw.trim();
    if (!line) { i++; continue; }
    // Legacy reviewers store SOURCE / FORMAT / OVERVIEW as unformatted lines.
    const meta = /^(SOURCE|FORMAT|OVERVIEW)\s*:?\s*(.*)$/i.exec(line);
    if (meta) {
      nodes.push(<div className="rv-meta-row" key={i}><span className="rv-meta-label">{meta[1]}</span><span className="rv-meta-value">{inline(meta[2])}</span></div>);
      i++; continue;
    }
    if (/^(KEY CONCEPTS|DEFINITIONS|IMPORTANT TERMS|REVIEW QUESTIONS|SUMMARY|KEY TAKEAWAYS)$/i.test(line)) {
      nodes.push(<h3 className="rv-plain-heading" key={i}>{line}</h3>); i++; continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const Tag = 'h' + Math.min(heading[1].length, 4);
      nodes.push(<Tag key={i}>{inline(heading[2])}</Tag>); i++; continue;
    }
    if (/^(---+|\*\*\*+)\s*$/.test(line)) { nodes.push(<hr key={i} />); i++; continue; }
    const bullet = /^[-*+]\s+/.test(line), numbered = /^\d+[.)]\s+/.test(line);
    if (bullet || numbered) {
      const start = i, items = [], pattern = bullet ? /^[-*+]\s+(.+)$/ : /^\d+[.)]\s+(.+)$/;
      while (i < lines.length && pattern.test(lines[i].trim())) {
        items.push(<li key={i}>{inline(lines[i].trim().replace(pattern, '$1'))}</li>); i++;
      }
      nodes.push(bullet ? <ul key={start}>{items}</ul> : <ol key={start}>{items}</ol>); continue;
    }
    if (line.startsWith('> ')) { nodes.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>); i++; continue; }
    const start = i, paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*+]\s|\d+[.)]\s|>\s|---+\s*$)/.test(lines[i].trim())) {
      paragraph.push(lines[i].trim()); i++;
    }
    if (i === start) { paragraph.push(line); i++; }
    nodes.push(<p key={start}>{inline(paragraph.join(' '))}</p>);
  }
  return <article className="rv-reading-content">{nodes.length ? nodes : <p className="muted">Nothing to preview yet.</p>}</article>;
}

export function ReviewerEditor() {
  const { id } = useParams(); const nav = useNavigate(); const lib = useReviewerLibrary();
  const r = lib.items.find(x => x.id === id); const [t, setT] = useState(r ? r.title : ''); const [b, setB] = useState(r ? r.body : '');
  const [dlg, setDlg] = useState(null); // 'move' | 'delete'
  const [view, setView] = useState('read');
  const printReviewer = () => { setView('read'); window.setTimeout(() => window.print(), 80); };
  // Study progress (Patch 15): opening a reviewer starts it ("In progress"); the student marks it completed when done.
  const seen = useRef(''); const log = useProgressLog(); const done = !!(log.reviewers[id] && log.reviewers[id].done);
  useEffect(() => { if (r && seen.current !== r.id) { seen.current = r.id; track.openReviewer(r.id); } }, [r && r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <Empty icon={Sparkles} title="Reviewer not found" text="It may have been deleted." action={<div className="head-actions" style={{ justifyContent: 'center' }}><Btn v="outline" onClick={() => nav('/reviewers')}>All reviewers</Btn><Btn onClick={() => nav('/reviewers/create')}>Create a reviewer</Btn></div>} />;
  const fo = folderOf(r); const dirty = cleanTitle(t) !== r.title || b !== r.body;
  const save = () => {
    lib.edit(r.id, { title: t, body: b }); setT(cleanTitle(t) || r.title); toast('Reviewer saved'); // an empty title keeps the old one
  };
  const toggleDone = () => { track.setReviewerDone(r, !done); toast(done ? 'Marked as not completed' : 'Reviewer marked as completed'); };
  const bookmark = () => { lib.setBookmark(r.id, !r.favorite); toast(r.favorite ? 'Bookmark removed' : 'Reviewer bookmarked'); };
  const move = v => { const name = resolveFolder(v, lib.items); lib.move(r.id, name); setDlg(null); toast(name ? `Moved to “${name}”` : 'Moved out of folders'); };
  const del = () => { lib.remove(r.id); track.forgetReviewers(r.id); logEvent(`Reviewer deleted: ${r.title.slice(0, 80)}`); toast('Reviewer deleted'); nav('/reviewers'); };
  return <><Head title="Reviewer Details / Editor" sub={`${r.style} · from ${r.file}${fo ? ` · in ${fo}` : ''}`} action={<div className="head-actions">
      <Btn v={done ? 'soft' : 'outline'} icon={CheckCircle2} aria-pressed={done} onClick={toggleDone}>{done ? 'Completed' : 'Mark as completed'}</Btn>
      <Btn v="outline" icon={r.favorite ? BookmarkOn : Bookmark} aria-pressed={!!r.favorite} onClick={bookmark}>{r.favorite ? 'Bookmarked' : 'Bookmark'}</Btn>
      <Btn v="outline" icon={FolderInput} onClick={() => setDlg('move')}>{fo ? 'Move' : 'Add to folder'}</Btn>
      <Btn v="outline" icon={Trash2} onClick={() => setDlg('delete')}>Delete</Btn>
      <Btn v="outline" icon={Printer} onClick={printReviewer}>Print / PDF</Btn>
      <Btn icon={Check} onClick={save}>Save changes</Btn></div>} />
    <div className="builder-layout rv-editor-layout"><div className="panel builder-form rv-editor-paper"><label className="field-label" htmlFor="rv-edit-title">Title</label><input id="rv-edit-title" className="field" maxLength={MAX_TITLE} value={t} onChange={e => setT(e.target.value)} /><div className="rv-reading-tabs" role="group" aria-label="Reviewer view"><button type="button" className={view === 'read' ? 'active' : ''} aria-pressed={view === 'read'} onClick={() => setView('read')}>Read reviewer</button><button type="button" className={view === 'edit' ? 'active' : ''} aria-pressed={view === 'edit'} onClick={() => setView('edit')}>Edit content</button></div>{view === 'read' ? <div className="rv-print-document"><header className="rv-print-header"><span>KNOXIA · STUDY REVIEWER</span><h1>{t || r.title}</h1><p>{r.style} · {r.file}</p></header><ReviewerReadingView content={b} /></div> : <><label className="field-label" htmlFor="rv-edit-body">Content (Markdown)</label><textarea id="rv-edit-body" className="field textarea" style={{ height: 380 }} value={b} onChange={e => setB(e.target.value)} /></>}{dirty && <p className="rv-hint" role="status">You have unsaved changes.</p>}<p className="muted">{r.generated ? 'AI-generated study notes. Review important details against your original material before studying.' : 'Review and edit your notes whenever you need.'}</p></div>
      <div className="panel"><h3>Study with this reviewer</h3><p className="muted">Turn your notes into practice.</p><div className="friend-buttons" style={{ flexDirection: 'column', alignItems: 'stretch', marginTop: 12 }}><Btn v="soft" icon={Layers} onClick={() => nav('/flashcards')}>Open flashcards</Btn><Btn v="soft" icon={BookOpen} onClick={() => nav('/quizzes/create?reviewer=' + encodeURIComponent(r.id))}>Create a quiz</Btn><Btn v="soft" icon={Sparkles} onClick={() => nav('/study-companion')}>Ask the companion</Btn><Btn v="outline" icon={ArrowUpRight} onClick={() => nav('/reviewers')}>All my reviewers</Btn></div></div></div>
    {dlg === 'move' && <PromptDialog title={`Move “${r.title}”`} body="Type a folder name, or pick one below. Leave it empty to take it out of any folder." label="Folder name" value={fo} placeholder="e.g. Midterms" maxLength={MAX_FOLDER} suggestions={folderCounts(lib.items).map(x => x.name)} allowEmpty confirmLabel="Move" onSubmit={move} onCancel={() => setDlg(null)} />}
    {dlg === 'delete' && <ConfirmDialog icon={Trash2} title={`Delete “${r.title}”?`} body="This permanently removes the reviewer and anything you edited in it. This can't be undone." confirmLabel="Delete" onCancel={() => setDlg(null)} onConfirm={del} />}</>;
}

/* ---------- Challenges ---------- */
export function Challenges() {
  const nav = useNavigate(); const [list, setList] = useChallenges();
  const add = () => { const c = { id: 'c' + Date.now(), title: `Open Challenge #${list.length + 1}`, opp: 'Alex Rivera', init: 'AR', q: (list.length * 2) % 6, score: 3 }; setList(a => [c, ...a]); toast('Challenge created'); };
  return <><Head title="Quiz Challenges" sub="Challenge friends and test your knowledge." action={<Btn icon={Plus} onClick={add}>Create challenge</Btn>} />
    <div className="panel list-panel">{list.map(c => <Row key={c.id} icon={Swords} tone="purple" title={c.title} sub={`vs ${c.opp} · 5 questions`}><Btn v="soft" icon={Play} onClick={() => nav(`/challenges/${c.id}/play`)}>Play</Btn></Row>)}</div></>;
}
export function ChallengePlay() {
  const { id } = useParams(); const nav = useNavigate(); const [list] = useChallenges(); const c = list.find(x => x.id === id) || list[0];
  const qs = BANK.slice(c.q, c.q + 5); const [res, setRes] = useState(null); const [run, setRun] = useState(0);
  if (res !== null) { const o = res > c.score ? 'You won the battle' : res < c.score ? `${c.opp} won this round` : 'It’s a draw'; return <><Head title="Challenge Game / Quiz Battle" sub={c.title} /><div className="study-center"><div className="panel study-card"><small>RESULT</small><h2>{o}</h2><p className="muted">You scored {res} / 5. {c.opp} scored {c.score} / 5.</p><Btn icon={RotateCcw} onClick={() => { setRes(null); setRun(x => x + 1); }}>Rematch</Btn> <Btn v="outline" onClick={() => nav('/challenges')}>Back to challenges</Btn></div></div></>; }
  return <><Head title="Challenge Game / Quiz Battle" sub={`${c.title} · vs ${c.opp}`} /><QuizRunner key={run} qs={qs} label="BATTLE" onFinish={a => setRes(a.filter((x, i) => x === qs[i][2]).length)} /></>;
}

/* ---------- Gamification & analytics ---------- */
export function Leaderboards() {
  const profile = useProfile(); const game = useMyGamification(); const [tab, setTab] = useState('This week'); const [scope, setScope] = useState('Everyone'); const k = { 'This week': .2, 'This month': .6, 'All time': 1 }[tab];
  const all = BOARD.filter(r => scope === 'Everyone' || r[1] === 'KP' || r[4]).map(r => { const me = r[1] === 'KP'; return { name: me ? profile.displayName : r[0], init: me ? profile.initials : r[1], av: me ? profile.avatar : '', xp: me ? { 'This week': game.week, 'This month': game.month, 'All time': game.xp }[tab] : Math.round(r[2] * k), streak: me ? game.streak.current : r[3], me }; }).sort((a, b) => b.xp - a.xp).map((r, i) => ({ ...r, rank: i + 1 }));
  const me = all.find(r => r.me); const above = all[me.rank - 2]; const top = all.slice(0, 3);
  return <><Head title="Leaderboards" sub="See how your learning journey compares with others." action={<div className="segmented" role="group" aria-label="Who to show">{['Everyone', 'Friends'].map(t => <button key={t} className={scope === t ? 'selected' : ''} onClick={() => setScope(t)}>{t}</button>)}</div>} />
    <div className="tabs">{['This week', 'This month', 'All time'].map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="stats-grid compact"><Stat label="Your rank" value={'#' + me.rank} note={`of ${all.length} students`} icon={Trophy} tone="orange" /><Stat label="Your XP" value={me.xp.toLocaleString()} note={tab} icon={Zap} /><Stat label={above ? 'To next rank' : 'Position'} value={above ? (above.xp - me.xp).toLocaleString() + ' XP' : 'Top spot'} note={above ? `Behind ${above.name}` : 'Keep it up'} icon={Target} tone="green" /></div>
    <div className="podium">{[1, 0, 2].map(i => top[i] && <div key={i} className={`pod p${i + 1} ${top[i].me ? 'me' : ''}`}>{i === 0 && <Crown size={22} />}<div className="avatar lg">{top[i].av ? <img src={top[i].av} alt="" /> : top[i].init}</div><b>{top[i].name}{top[i].me ? ' (you)' : ''}</b><span>{top[i].xp.toLocaleString()} XP</span><div className="pod-step">{i + 1}</div></div>)}</div>
    {all.length > 3 && <div className="panel lb-list"><div className="lb-row lb-head"><span>Rank</span><span>Student</span><span>Streak</span><span>XP</span></div>{all.slice(3).map(r => <div className={`lb-row ${r.me ? 'me' : ''}`} key={r.rank}><b>{r.rank}</b><span className="lb-user"><span className="avatar sm">{r.av ? <img src={r.av} alt="" /> : r.init}</span>{r.name}{r.me ? ' (you)' : ''}</span><span><Flame size={14} /> {r.streak}d</span><b>{r.xp.toLocaleString()}</b></div>)}</div>}</>;
}
export function Analytics() {
  // Real numbers from Study Progress (Patch 15) once there is activity; until then the sample values are shown and labelled as such.
  const pr = useStudyProgress(); const live = pr.hasActivity; const q = pr.quizzes;
  const avg = q.avg === null ? 86 : q.avg;
  const real = topicMastery(pr.deckList).map(t => [t.name, t.pct]);
  const topics = real.length ? real : [['Machine Learning', 78], ['Automata Theory', 54], ['Cybersecurity', 85], ['Computer Architecture', 41]];
  const peak = Math.max(1, ...pr.week.map(d => d.count));
  const bars = live ? pr.week.map(d => [d.label, d.count ? Math.max(8, Math.round(d.count / peak * 100)) : 0]) : [['M', 42], ['T', 68], ['W', 52], ['T', 88], ['F', 64], ['S', 100], ['S', 28]];
  return <><Head title="Learning Analytics" sub="Use your learning data to make your next study session count." action={<Btn v="outline" icon={Download} onClick={() => dl('knoxia-report.csv', [['Topic', 'Mastery %'], ...topics, ['Quizzes taken', q.taken], ['Quiz average %', avg], ['Study time', live ? fmtTime(pr.secs) || '0m' : 'n/a'], ['Current streak (days)', live ? pr.streak.current : 'n/a']])}>Export report</Btn>} />
    <div className="stats-grid"><Stat label="Study time" value={live ? fmtTime(pr.secs) || '0m' : '18h 42m'} note={live ? 'Flashcards and quizzes' : 'Sample data'} icon={Clock3} /><Stat label="Quiz average" value={avg + '%'} note={q.taken ? 'From your attempts' : 'Sample data'} icon={Target} tone="green" /><Stat label="Quizzes taken" value={String(q.taken)} note="This device" icon={BookOpen} tone="purple" /><Stat label="Streak" value={live ? `${pr.streak.current} day${pr.streak.current === 1 ? '' : 's'}` : '7 days'} note={live ? `Personal best: ${pr.streak.best}` : 'Sample data'} icon={Flame} tone="orange" /></div>
    <div className="dashboard-grid"><section className="panel"><h3>Study activity</h3><div className="bar-chart">{bars.map(([d, v], i) => <div className="bar-column" key={i}><div className="bar-bg"><span style={{ height: v + '%' }} /></div><small>{d}</small></div>)}</div>{live ? <p className="muted-sm" style={{ marginTop: 10 }}>Last 7 days. <Link className="link-btn" to="/progress">See Study Progress</Link></p> : <p className="muted-sm" style={{ marginTop: 10 }}>Sample data. Study a deck or take a quiz to see your own.</p>}</section>
      <section className="panel"><h3>Topic mastery</h3>{topics.map(([n, v]) => <div key={n}><div className="deck-bottom"><span>{n}</span><b>{v}%</b></div><div className="progress-track"><span style={{ width: v + '%' }} /></div></div>)}{real.length > 0 && <p className="muted-sm" style={{ marginTop: 10 }}>Share of flashcards you marked as known, by subject.</p>}</section></div></>;
}
export function Planner() {
  const [items, setItems] = usePlan();
  const [title, setTitle] = useState(''); const [date, setDate] = useState('2026-11-16');
  const add = e => { e.preventDefault(); if (!title.trim()) return; setItems(a => [...a, { id: String(Date.now()), title: title.trim(), date, done: false }]); setTitle(''); toast('Session added'); };
  const done = items.filter(x => x.done).length;
  return <><Head title="Study Planner" sub="Plan your sessions and keep your goals within reach." /><div className="stats-grid compact"><Stat label="Planned" value={String(items.length)} note="Study sessions" icon={CalendarDays} /><Stat label="Completed" value={String(done)} note="Keep it up" icon={CheckCircle2} tone="green" /><Stat label="Remaining" value={String(items.length - done)} note="Still to do" icon={Clock3} tone="orange" /></div>
    <form className="panel rename-form" style={{ marginBottom: 16 }} onSubmit={add}><input aria-label="Session title" placeholder="What will you study?" value={title} onChange={e => setTitle(e.target.value)} /><input type="date" aria-label="Date" style={{ flex: 'none', minWidth: 0 }} value={date} onChange={e => setDate(e.target.value)} /><Btn type="submit" icon={Plus}>Add session</Btn></form>
    <div className="panel list-panel">{[...items].sort((a, b) => a.date.localeCompare(b.date)).map(x => <div className="generic-row" key={x.id}><input type="checkbox" aria-label={`Mark ${x.title} done`} checked={x.done} onChange={() => setItems(a => a.map(y => y.id === x.id ? { ...y, done: !y.done } : y))} /><div><b style={x.done ? { textDecoration: 'line-through' } : undefined}>{x.title}</b><small>{x.date}</small></div><button className="plain-icon" aria-label={`Delete ${x.title}`} onClick={() => setItems(a => a.filter(y => y.id !== x.id))}><Trash2 size={18} /></button></div>)}</div></>;
}

/* ---------- Account ---------- */
export function Notifications() {
  const nav = useNavigate(); const [items, setItems] = useNotes(); const unread = items.filter(x => !x.read).length;
  return <><Head title="Notifications" sub={`${unread} unread`} action={<Btn v="outline" icon={Check} onClick={() => setItems(a => a.map(x => ({ ...x, read: true })))}>Mark all as read</Btn>} />
    <div className="panel list-panel">{items.map(x => <Row key={x.id} icon={Bell} tone={x.read ? 'blue' : 'orange'} title={x.t} sub={x.s} style={{ cursor: 'pointer' }} onClick={() => { setItems(a => a.map(y => y.id === x.id ? { ...y, read: true } : y)); nav(x.to); }}><span className="row-status">{x.read ? 'Read' : 'New'}</span></Row>)}</div></>;
}
export function SettingsPage() {
  const [s, setS] = useSettings();
  const [f, setF] = useState(s); const [tab, setTab] = useState('Profile'); const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const tog = (k, l) => <label className="check-list" key={k}><span><input type="checkbox" checked={f[k]} onChange={e => set(k, e.target.checked)} /> {l}</span></label>;
  return <><Head title="Settings" sub="Customize your KNOXIA experience." /><div className="settings-layout"><div className="panel settings-menu">{['Profile', 'Security', 'Preferences'].map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="panel settings-form">{tab === 'Profile' && <ProfileEditor />}
      {tab === 'Security' && <><h3>Account security</h3><label className="field-label">Current password</label><input className="field" type="password" /><label className="field-label">New password</label><input className="field" type="password" /><Btn onClick={() => toast('Password update needs a backend')}>Update password</Btn></>}
      {tab === 'Preferences' && <><h3>Preferences</h3><label className="field-label">Appearance</label><ThemePicker />{tog('notif', 'Email notifications')}{tog('reminders', 'Study reminders')}{tog('pub', 'Public profile')}{tog('board', 'Show me on leaderboards')}<Btn onClick={() => { setS(f); toast('Settings saved'); }}>Save changes</Btn></>}</div></div></>;
}

/* ---------- Admin ---------- */
export function Moderation() {
  const [items, setItems] = useReports(); const [tab, setTab] = useState('Pending');
  const act = (r, status) => { setItems(a => a.map(x => x.id === r.id ? { ...x, status } : x)); logEvent(`Report ${status.toLowerCase()}: ${r.type} by ${r.who}`); toast(`Report ${status.toLowerCase()}`); };
  const list = items.filter(x => tab === 'All' || (tab === 'Pending') === (x.status === 'Pending'));
  return <><Head title="Content Moderation" sub="Review reported content and community concerns." /><div className="tabs">{['Pending', 'Resolved', 'All'].map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="panel list-panel">{list.length === 0 && <Empty icon={ShieldCheck} title="Nothing to review" text="New reports will show up here." />}{list.map(r => <Row key={r.id} icon={ShieldCheck} tone={r.status === 'Pending' ? 'orange' : 'green'} title={`${r.type} by ${r.who}`} sub={r.reason}>{r.status === 'Pending' ? <div className="friend-buttons"><Btn v="outline" onClick={() => act(r, 'Dismissed')}>Dismiss</Btn><Btn icon={Trash2} onClick={() => act(r, 'Removed')}>Remove</Btn></div> : <span className="row-status">{r.status}</span>}</Row>)}</div></>;
}
export function Logs() {
  const [logs] = useLogs(); const [q, setQ] = useState(''); const list = logs.filter(l => l.t.toLowerCase().includes(q.toLowerCase()));
  return <><Head title="Activity Logs" sub="A record of recent administrative activity." action={<Btn v="outline" icon={Download} onClick={() => dl('knoxia-logs.csv', [['Time', 'Event'], ...logs.map(l => [l.time, l.t])])}>Download logs</Btn>} />
    <div className="toolbar"><div className="search-field"><Activity size={16} /><input aria-label="Search logs" placeholder="Search logs…" value={q} onChange={e => setQ(e.target.value)} /></div></div>
    <div className="panel list-panel">{list.map(l => <Row key={l.id} icon={Activity} title={l.t} sub={when(l.time)} />)}{list.length === 0 && <Empty icon={Activity} title="No matching events" text="Try a different search." />}</div></>;
}
