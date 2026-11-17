import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowUpRight, Check, CheckCircle2, Clock3, Layers, Pencil, Play, Plus, RotateCcw, Shuffle, Trash2, X, AlertCircle } from 'lucide-react';
import { Button, SectionTitle, ConfirmDialog } from './ui.jsx';
import { toast, SUBJECTS } from './materials.jsx';
import { logEvent } from './data.js';
import { track } from './progressStore.js'; // study progress (Patch 15)
import {
  MAX_DECKS, MAX_CARDS, MAX_DECK_TITLE, MAX_FRONT, MAX_BACK,
  cleanDeckTitle, knownCount, masteryPct, sessionOrder, useDeckLibrary,
} from './flashcards.js';

/**
 * Flashcards (Patch 11): the deck library, the deck editor and the study session.
 *   /flashcards            create, open and delete decks
 *   /flashcards/:id        edit the deck's details and its cards
 *   /flashcards/:id/study  flip, shuffle and mark cards; results are saved on each card
 */
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const Empty = ({ icon: I, title, text, children }) => <div className="empty-state"><I size={32} /><b>{title}</b><p>{text}</p>{children}</div>;
const Stat = ({ label, value, note, icon: I, tone = '' }) => <div className="stat-card"><div className={`stat-icon ${tone}`}><I size={18} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>;
const Btn = ({ children, v = 'primary', icon: I, ...p }) => <button type="button" className={`btn ${v}`} {...p}>{I && <I size={16} />}<span>{children}</span></button>;
const subjectOptions = (current) => [...new Set([...SUBJECTS, current].filter(Boolean))];

/* ---------- Library ---------- */
export function FlashcardLibrary() {
  const nav = useNavigate(); const lib = useDeckLibrary(); const { decks } = lib;
  const [creating, setCreating] = useState(false); const [saving, setSaving] = useState(false); const [title, setTitle] = useState(''); const [subject, setSubject] = useState(SUBJECTS[0]); const [err, setErr] = useState('');
  const [del, setDel] = useState(null);
  const cards = decks.reduce((t, d) => t + d.cards.length, 0); const known = decks.reduce((t, d) => t + knownCount(d), 0);

  const create = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!cleanDeckTitle(title)) { setErr('Give your deck a name.'); return; }
    setSaving(true);
    setErr('');
    try {
      const id = await lib.create({ title, subject });
      toast('Deck created');
      nav('/flashcards/' + id);
    } catch (error) {
      setErr(error?.message || 'Could not create deck. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  const confirmDelete = () => { const d = del; setDel(null); lib.remove(d.id); logEvent(`Flashcard deck deleted: ${d.title.slice(0, 80)}`); toast('Deck deleted'); };

  return <>
    {lib.error && <div className="notice error" role="alert">{lib.error}</div>}
    {lib.loading && <p className="muted" role="status">Loading flashcards from Supabase…</p>}
    <SectionTitle title="Flashcard Library" subtitle="Practice active recall and make knowledge stick." action={<Button icon={Plus} onClick={() => { setCreating((c) => !c); setErr(''); }}>Create deck</Button>} />
    {creating && <form className="panel fc-create" onSubmit={create} noValidate aria-label="Create a deck">
      <label className="ufield"><span>Deck name</span><input autoFocus value={title} maxLength={MAX_DECK_TITLE} placeholder="e.g. Operating Systems midterm" onChange={(e) => { setTitle(e.target.value); setErr(''); }} /></label>
      <label className="ufield"><span>Subject</span><select value={subject} onChange={(e) => setSubject(e.target.value)}>{SUBJECTS.map((x) => <option key={x}>{x}</option>)}</select></label>
      <div className="form-actions"><Button variant="outline" onClick={() => { setCreating(false); setTitle(''); setErr(''); }}>Cancel</Button><Button type="submit">Create deck</Button></div>
      {err && <div className="notice error" role="alert"><AlertCircle size={16} />{err}</div>}
    </form>}
    <div className="stats-grid compact">
      <Stat label="Total decks" value={decks.length} note={`${plural(new Set(decks.map((d) => d.subject).filter(Boolean)).size, 'subject')}`} icon={Layers} />
      <Stat label="Cards mastered" value={known} note={`Of ${plural(cards, 'card')}`} icon={CheckCircle2} tone="green" />
      <Stat label="Still learning" value={cards - known} note={cards - known ? 'Worth another pass' : 'Nothing left to review'} icon={Clock3} tone="orange" />
    </div>
    {decks.length === 0 ? <Empty icon={Layers} title="No decks yet" text="Create a deck, add a few cards and start studying.">{!creating && <Button icon={Plus} onClick={() => setCreating(true)}>Create deck</Button>}</Empty> :
      <div className="deck-grid">{decks.map((d) => { const pct = masteryPct(d); return <div className="deck-card panel" key={d.id}>
        <div className={`deck-art ${d.tone}`}><Layers size={24} /><span>{plural(d.cards.length, 'card')}</span></div>
        <div className="deck-info"><small>{d.subject || 'No subject'}</small><h3>{d.title}</h3>
          <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label={`${d.title} mastery`}><span style={{ width: pct + '%' }} /></div>
          <div className="deck-bottom"><span>{pct}% mastered</span>
            {d.cards.length ? <button type="button" onClick={() => nav(`/flashcards/${d.id}/study`)}>Study deck <ArrowUpRight size={16} /></button> : <button type="button" onClick={() => nav('/flashcards/' + d.id)}>Add cards <Plus size={16} /></button>}</div>
          <div className="fc-deck-tools"><Link className="link-btn" to={'/flashcards/' + d.id} viewTransition><Pencil size={14} /> Edit</Link><button type="button" className="link-btn fc-danger" onClick={() => setDel(d)}><Trash2 size={14} /> Delete</button></div>
        </div></div>; })}</div>}
    {del && <ConfirmDialog icon={Trash2} title={`Delete “${del.title}”?`} body={`This permanently removes the deck and its ${plural(del.cards.length, 'card')}. This can't be undone.`} confirmLabel="Delete" onCancel={() => setDel(null)} onConfirm={confirmDelete} />}
  </>;
}

/* ---------- Deck editor ---------- */
function CardForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [front, setFront] = useState(initial ? initial.front : ''); const [back, setBack] = useState(initial ? initial.back : ''); const [err, setErr] = useState('');
  const frontRef = useRef(null);
  const submit = (e) => {
    e.preventDefault(); const msg = onSubmit(front, back);
    if (msg) { setErr(msg); return; }
    if (!initial) { setFront(''); setBack(''); setErr(''); frontRef.current && frontRef.current.focus(); } // ready for the next card
  };
  const ctrlEnter = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(e); };
  return <form className="fc-card-form" onSubmit={submit} noValidate>
    <label className="ufield"><span>Front <em>(question or term)</em></span><textarea ref={frontRef} rows="2" autoFocus={!!initial} maxLength={MAX_FRONT} value={front} onKeyDown={ctrlEnter} onChange={(e) => { setFront(e.target.value); setErr(''); }} /></label>
    <label className="ufield"><span>Back <em>(answer)</em></span><textarea rows="3" maxLength={MAX_BACK} value={back} onKeyDown={ctrlEnter} onChange={(e) => { setBack(e.target.value); setErr(''); }} /></label>
    {err && <div className="notice error" role="alert"><AlertCircle size={16} />{err}</div>}
    <div className="form-actions">{onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}<Button type="submit" icon={initial ? Check : Plus}>{submitLabel}</Button></div>
  </form>;
}

export function DeckEditor() {
  const { id } = useParams(); const nav = useNavigate(); const lib = useDeckLibrary(); const deck = lib.decks.find((d) => d.id === id);
  const [title, setTitle] = useState(deck ? deck.title : ''); const [subject, setSubject] = useState(deck ? deck.subject : '');
  const [editing, setEditing] = useState(null); const [dlg, setDlg] = useState(null); // dlg: 'deck' | 'reset' | { card }
  const [detailErr, setDetailErr] = useState('');
  useEffect(() => { if (editing && deck && !deck.cards.some((c) => c.id === editing)) setEditing(null); }, [deck, editing]);
  if (lib.loading) return <p className="muted" role="status">Loading deck from Supabase…</p>;
  if (lib.error) return <div className="notice error" role="alert">{lib.error}</div>;
  if (!deck) return <Empty icon={Layers} title="Deck not found" text="It may have been deleted."><Button onClick={() => nav('/flashcards')}>Back to flashcards</Button></Empty>;

  const dirty = cleanDeckTitle(title) !== deck.title || subject !== deck.subject;
  const saveDetails = (e) => { e.preventDefault(); if (!lib.details(deck.id, { title, subject })) { setDetailErr('Give your deck a name.'); return; } setDetailErr(''); setTitle(cleanDeckTitle(title)); toast('Deck saved'); };
  const known = knownCount(deck);
  const removeDeck = () => { setDlg(null); lib.remove(deck.id); logEvent(`Flashcard deck deleted: ${deck.title.slice(0, 80)}`); toast('Deck deleted'); nav('/flashcards'); };

  return <>
    <SectionTitle title="Edit deck" subtitle={`${plural(deck.cards.length, 'card')} · ${masteryPct(deck)}% mastered`} action={<div className="head-actions">
      <Btn v="outline" icon={ArrowUpRight} onClick={() => nav('/flashcards')}>All decks</Btn>
      <Btn v="outline" icon={Trash2} onClick={() => setDlg('deck')}>Delete deck</Btn>
      <Btn icon={Play} disabled={!deck.cards.length} onClick={() => nav(`/flashcards/${deck.id}/study`)}>Study</Btn></div>} />
    <div className="fc-editor">
      <div className="fc-col">
        <form className="panel" onSubmit={saveDetails} noValidate><h3>Deck details</h3>
          <label className="ufield"><span>Name</span><input value={title} maxLength={MAX_DECK_TITLE} onChange={(e) => { setTitle(e.target.value); setDetailErr(''); }} /></label>
          <label className="ufield"><span>Subject</span><select value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">No subject</option>{subjectOptions(deck.subject).map((x) => <option key={x}>{x}</option>)}</select></label>
          {detailErr && <div className="notice error" role="alert"><AlertCircle size={16} />{detailErr}</div>}
          <div className="form-actions">{dirty && <span className="muted fc-dirty" role="status">Unsaved changes</span>}<Button type="submit" icon={Check}>Save details</Button></div></form>
        <div className="panel"><h3>Add a card</h3><p className="muted">Press Ctrl + Enter to add and keep going.</p>
          <CardForm submitLabel="Add card" onSubmit={(f, b) => { const m = lib.addCard(deck.id, f, b); if (!m) toast('Card added'); return m; }} /></div>
      </div>
      <div className="panel fc-cards"><div className="list-head"><h3>Cards ({deck.cards.length})</h3>{known > 0 && <button type="button" className="link-btn" onClick={() => setDlg('reset')}><RotateCcw size={14} /> Reset progress</button>}</div>
        {deck.cards.length === 0 && <p className="muted">No cards yet. Add your first card to get started.</p>}
        <ol className="fc-list">{deck.cards.map((c, i) => <li key={c.id} className={editing === c.id ? 'editing' : ''}>
          {editing === c.id ? <CardForm initial={c} submitLabel="Save card" onCancel={() => setEditing(null)} onSubmit={(f, b) => { const m = lib.editCard(deck.id, c.id, f, b); if (!m) { setEditing(null); toast('Card saved'); } return m; }} /> : <>
            <span className="fc-num">{i + 1}</span>
            <div className="fc-text-pair"><b>{c.front}</b><span>{c.back}</span></div>
            <span className={`status-pill ${c.known ? 'active' : ''}`}>{c.known ? 'Known' : 'Learning'}</span>
            <div className="fc-row-tools"><button type="button" className="plain-icon" aria-label={`Edit card ${i + 1}`} onClick={() => setEditing(c.id)}><Pencil size={16} /></button><button type="button" className="plain-icon" aria-label={`Delete card ${i + 1}`} onClick={() => setDlg({ card: c })}><Trash2 size={16} /></button></div></>}
        </li>)}</ol></div>
    </div>
    {dlg === 'deck' && <ConfirmDialog icon={Trash2} title={`Delete “${deck.title}”?`} body={`This permanently removes the deck and its ${plural(deck.cards.length, 'card')}. This can't be undone.`} confirmLabel="Delete" onCancel={() => setDlg(null)} onConfirm={removeDeck} />}
    {dlg === 'reset' && <ConfirmDialog icon={RotateCcw} title="Reset progress?" body="Every card goes back to “Still learning”. Your cards are not changed." confirmLabel="Reset" onCancel={() => setDlg(null)} onConfirm={() => { lib.resetProgress(deck.id); setDlg(null); toast('Progress reset'); }} />}
    {dlg && dlg.card && <ConfirmDialog icon={Trash2} title="Delete this card?" body={`“${dlg.card.front.slice(0, 80)}” will be removed from the deck.`} confirmLabel="Delete" onCancel={() => setDlg(null)} onConfirm={() => { lib.removeCard(deck.id, dlg.card.id); setDlg(null); toast('Card deleted'); }} />}
  </>;
}

/* ---------- Study session ---------- */
export function FlashStudy() {
  const { id } = useParams(); const nav = useNavigate(); const lib = useDeckLibrary(); const deck = lib.decks.find((d) => d.id === id);
  const [shuffled, setShuffled] = useState(false);
  const [order, setOrder] = useState(() => (deck ? sessionOrder(deck.cards) : []));
  const [i, setI] = useState(0); const [flip, setFlip] = useState(false); const [marks, setMarks] = useState({});
  const cardRef = useRef(null);
  // Study progress (Patch 15): every session that rated at least one card is logged once. A new run (restart, shuffle,
  // "study missed"), finishing the deck and leaving the page all flush the cards rated so far; `logged` stops double counting.
  const t0 = useRef(Date.now()); const logged = useRef(0); const latest = useRef({});

  // The session shows the cards that still exist; a card deleted elsewhere is skipped.
  const byId = useMemo(() => new Map((deck ? deck.cards : []).map((c) => [c.id, c])), [deck]);
  const cards = order.map((cid) => byId.get(cid)).filter(Boolean); const n = cards.length;
  const done = n > 0 && i >= n; const card = cards[i];
  const knew = cards.filter((c) => marks[c.id] === true).length; const missed = cards.filter((c) => marks[c.id] === false);

  latest.current = { deck, cards, marks };
  const flush = () => {
    const { deck: d, cards: cs, marks: m } = latest.current; if (!d) return;
    const rated = cs.filter((c) => c.id in m); if (rated.length <= logged.current) return;
    logged.current = rated.length; track.flashcards({ deckId: d.id, title: d.title, total: rated.length, correct: rated.filter((c) => m[c.id] === true).length, secs: (Date.now() - t0.current) / 1000 });
  };
  const start = (nextOrder, nextShuffled = shuffled) => { flush(); logged.current = 0; t0.current = Date.now(); setOrder(nextOrder); setShuffled(nextShuffled); setI(0); setFlip(false); setMarks({}); };
  const mark = (ok) => { if (!card) return; setMarks((m) => ({ ...m, [card.id]: ok })); lib.mark(deck.id, { [card.id]: ok }); setFlip(false); setI((x) => x + 1); };

  useEffect(() => { if (done) flush(); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (card && cardRef.current) cardRef.current.focus({ preventScroll: true }); }, [i, card && card.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // 1 = still learning, 2 = I knew it (once the answer is showing)
    if (!card || !flip) return;
    const k = (e) => { if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return; if (e.key === '1') mark(false); else if (e.key === '2') mark(true); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  });

  if (!deck) return <Empty icon={Layers} title="Deck not found" text="It may have been deleted."><Button onClick={() => nav('/flashcards')}>Back to flashcards</Button></Empty>;
  if (!n) return <Empty icon={Layers} title="This deck has no cards yet" text="Add a few cards, then come back to study."><Button icon={Plus} onClick={() => nav('/flashcards/' + deck.id)}>Add cards</Button></Empty>;

  if (done) return <><SectionTitle title="Flashcard Study Session" subtitle={deck.title} />
    <div className="study-center"><div className="panel study-card" role="status"><small>SESSION COMPLETE</small><h2>You knew {knew} of {n} cards</h2>
      <p className="muted">{missed.length ? `${plural(missed.length, 'card')} marked “still learning”. Study just those next.` : 'Every card marked as known. Nice work.'}</p>
      <div className="friend-buttons">
        {missed.length > 0 && <Btn icon={RotateCcw} onClick={() => start(sessionOrder(deck.cards, { shuffled, only: new Set(missed.map((c) => c.id)) }))}>Study missed ({missed.length})</Btn>}
        <Btn v={missed.length ? 'outline' : 'primary'} icon={RotateCcw} onClick={() => start(sessionOrder(deck.cards, { shuffled }))}>Study all again</Btn>
        <Btn v="outline" icon={Pencil} onClick={() => nav('/flashcards/' + deck.id)}>Edit deck</Btn>
        <Btn v="outline" onClick={() => nav('/flashcards')}>Back to library</Btn></div></div></div></>;

  return <><SectionTitle title="Flashcard Study Session" subtitle={deck.title} action={<div className="head-actions">
      <Btn v={shuffled ? 'soft' : 'outline'} icon={Shuffle} aria-pressed={shuffled} onClick={() => start(sessionOrder(deck.cards, { shuffled: !shuffled }), !shuffled)}>{shuffled ? 'Shuffled' : 'Shuffle'}</Btn>
      <Btn v="outline" icon={RotateCcw} onClick={() => start(sessionOrder(deck.cards, { shuffled }))}>Restart</Btn></div>} />
    <div className="study-center">
      <div className="study-progress"><span>Card {i + 1} of {n}</span><span>{Math.round((i / n) * 100)}% complete</span></div>
      <div className="progress-track" role="progressbar" aria-valuenow={Math.round((i / n) * 100)} aria-valuemin="0" aria-valuemax="100" aria-label="Session progress"><span style={{ width: (i / n) * 100 + '%' }} /></div>
      <button type="button" ref={cardRef} className={`fc-flip${flip ? ' flipped' : ''}`} onClick={() => setFlip((f) => !f)}>
        <span className="fc-inner">
          <span className="fc-face fc-front" aria-hidden={flip}><small>QUESTION · {deck.title}</small><span className="fc-text">{card.front}</span><em>Click or press Space to flip</em></span>
          <span className="fc-face fc-back" aria-hidden={!flip}><small>ANSWER</small><span className="fc-text">{card.back}</span><em>Click to flip back</em></span>
        </span>
      </button>
      <div className="fc-actions">{!flip ? <Btn onClick={() => setFlip(true)}>Reveal answer</Btn> : <div className="friend-buttons"><Btn v="outline" icon={X} onClick={() => mark(false)}>Still learning <kbd>1</kbd></Btn><Btn icon={Check} onClick={() => mark(true)}>I knew it <kbd>2</kbd></Btn></div>}</div>
      <div className="study-footer"><span>Be honest. It helps you review the right cards.</span><Btn v="outline" onClick={() => nav('/flashcards')}>Exit session</Btn></div>
    </div></>;
}
