/**
 * Flashcards (Patch 11): the rules for decks and cards, plus `useDeckLibrary`, the one place that
 * changes the saved decks.
 *
 * A deck is { id, title, subject, tone, created, updated, cards: [{ id, front, back, known }] }.
 * `known` is the result of the last study session for that card: true = "I knew it", false = "Still
 * learning". A deck's mastery is the share of its cards that are known. Editing a card's text resets
 * its `known` flag, because what you learned may no longer be what the card says.
 *
 * Decks, cards, and mastery are stored in Supabase.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './session.js';
import { supabase } from './lib/supabase.js';
import { useUserData } from './storage.js';
import { DECKS } from './data.js';

export const KEY = 'knoxia-decks';
export const MAX_DECKS = 50;
export const MAX_CARDS = 500;
export const MAX_DECK_TITLE = 80;
export const MAX_SUBJECT = 40;
export const MAX_FRONT = 300;
export const MAX_BACK = 600;
export const TONES = ['blue', 'purple', 'green', 'orange'];

export const uid = () => crypto.randomUUID();

/** One-line text: single spaces, length-limited. */
export const cleanLine = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
/** Card text keeps its line breaks but not stray spaces or runs of blank lines. */
export const cleanSide = (s, max) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
export const cleanDeckTitle = (s) => cleanLine(s, MAX_DECK_TITLE);

/** Returns an error message, or '' when the card is fine. */
export function validateCard(front, back) {
  const f = cleanSide(front, 1e5), b = cleanSide(back, 1e5);
  if (!f) return 'Write the question or term for the front of the card.';
  if (!b) return 'Write the answer for the back of the card.';
  if (f.length > MAX_FRONT) return `The front can be up to ${MAX_FRONT} characters.`;
  if (b.length > MAX_BACK) return `The back can be up to ${MAX_BACK} characters.`;
  return '';
}

export const makeCard = (front, back) => ({ id: uid(), front: cleanSide(front, MAX_FRONT), back: cleanSide(back, MAX_BACK), known: false });
export const makeDeck = (title, subject, index = 0) => {
  const now = new Date().toISOString();
  return { id: uid(), title: cleanDeckTitle(title), subject: cleanLine(subject, MAX_SUBJECT), tone: TONES[index % TONES.length], created: now, updated: now, cards: [] };
};

/* ---------- progress ---------- */
export const knownCount = (d) => d.cards.filter((c) => c.known).length;
export const masteryPct = (d) => (d.cards.length ? Math.round((knownCount(d) / d.cards.length) * 100) : 0);

/** Fisher-Yates. Returns a new array; `rnd` can be swapped out in tests. */
export function shuffle(list, rnd = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** The card ids for one study session. Shuffling never changes the saved order of the deck. */
export const sessionOrder = (cards, { shuffled = false, only } = {}) => {
  const ids = cards.filter((c) => !only || only.has(c.id)).map((c) => c.id);
  return shuffled ? shuffle(ids) : ids;
};

/* ---------- the built-in sample decks, shown until the student changes anything ---------- */
const SUBJECTS = { 1: 'Artificial Intelligence', 2: 'Computer Science', 3: 'Cybersecurity', 4: 'Computer Systems' };
const SEED_DATE = '2026-11-01T08:00:00.000Z';
export const SEED = DECKS.map((d, i) => ({
  id: d.id, title: d.title, subject: SUBJECTS[d.id] || '', tone: TONES[i % TONES.length], created: SEED_DATE, updated: SEED_DATE,
  cards: d.cards.map(([front, back], k) => ({ id: `${d.id}-${k + 1}`, front, back, known: false })),
}));

/** Old saved data may be missing fields: read every deck as a complete one. */
const normalize = (d) => ({ ...d, cards: Array.isArray(d.cards) ? d.cards : [], subject: d.subject || '', tone: TONES.includes(d.tone) ? d.tone : 'blue' });

/** The saved decks and every change to them. */
export function useDeckLibrary() {
  const { user } = useAuth();
  const [saved, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const snapshot = useRef([]);
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  const owner = user?.id;

  useEffect(() => {
    const gen = ++generation.current;
    snapshot.current = [];
    setDecks([]);
    setError('');
    setLoading(true);
    if (!owner || !supabase) {
      setLoading(false);
      setError('Sign in with Supabase to manage flashcards.');
      return;
    }
    (async () => {
      const { data: deckRows, error: deckError } = await supabase.from('flashcard_decks')
        .select('id,title,subject,created_at').eq('owner_id', owner).order('created_at', { ascending: false });
      if (deckError) throw deckError;
      const ids = (deckRows || []).map(d => d.id);
      let cardRows = [];
      if (ids.length) {
        const { data, error: cardError } = await supabase.from('flashcards')
          .select('id,deck_id,front,back,known').in('deck_id', ids).order('id');
        if (cardError) throw cardError;
        cardRows = data || [];
      }
      if (generation.current !== gen) return;
      const decks = (deckRows || []).map((d, i) => ({
        id: d.id, title: d.title, subject: d.subject || '',
        tone: TONES[i % TONES.length], created: d.created_at, updated: d.created_at,
        cards: cardRows.filter(c => c.deck_id === d.id).map(c => ({
          id: c.id, front: c.front, back: c.back, known: c.known === true,
        })),
      }));
      snapshot.current = decks;
      setDecks(decks);
      setLoading(false);
    })().catch(err => {
      if (generation.current === gen) {
        setError('Could not load flashcards: ' + err.message);
        setLoading(false);
      }
    });
    return () => { generation.current++; };
  }, [owner]);

  // Serialize writes so rapid card edits cannot overwrite newer changes.
  // The UI updates immediately; failures are reported and the next refresh reloads server truth.
  const write = (task) => {
    const gen = generation.current;
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (generation.current !== gen || !owner) return;
      try {
        await task();
      } catch (err) {
        if (generation.current === gen) setError('Could not save flashcards: ' + err.message);
        throw err;
      }
    });
  };
  const patch = (id, fn) => {
    const d = snapshot.current.find(d => d.id === id);
    if (!d) return;
    const next = { ...fn(normalize(d)), updated: new Date().toISOString() };
    snapshot.current = snapshot.current.map(x => x.id === id ? next : x);
    setDecks(snapshot.current);
    return next;
  };
  return useMemo(() => ({
    decks: saved, loading, error,
    async create({ title, subject }) {
      if (loading) throw new Error('Flashcards are still loading. Please try again.');
      if (error) throw new Error(error);
      if (!owner || !supabase) throw new Error('Please sign in again.');
      if (!cleanDeckTitle(title)) throw new Error('Give your deck a name.');
      if (snapshot.current.length >= MAX_DECKS) throw new Error(`You can keep up to ${MAX_DECKS} decks.`);
      const deck = makeDeck(title, subject, snapshot.current.length);
      // Save before navigating. The editor mounts its own hook and reads from Supabase;
      // an optimistic insert followed by immediate navigation races that initial read.
      const { error: insertError } = await supabase.from('flashcard_decks').insert({
        id: deck.id, owner_id: owner, title: deck.title, subject: deck.subject,
      });
      if (insertError) {
        setError('Could not save flashcards: ' + insertError.message);
        throw insertError;
      }
      snapshot.current = [deck, ...snapshot.current];
      setDecks(snapshot.current);
      return deck.id;
    },
    async createGenerated({ title, subject, cards }) {
      if (loading || error) throw new Error(error || 'Flashcards are still loading.');
      if (!owner || !supabase) throw new Error('Please sign in again.');
      if (!cleanDeckTitle(title)) throw new Error('Give your deck a name.');
      if (!Array.isArray(cards) || !cards.length || cards.length > 40) throw new Error('Invalid generated cards.');
      if (snapshot.current.length >= MAX_DECKS) throw new Error('Deck limit reached.');
      for (const card of cards) {
        const problem = validateCard(card.front, card.back);
        if (problem) throw new Error(problem);
      }
      const deck = makeDeck(title, subject, snapshot.current.length);
      deck.cards = cards.map(card => makeCard(card.front, card.back));
      const { error: deckError } = await supabase.from('flashcard_decks').insert({
        id: deck.id, owner_id: owner, title: deck.title, subject: deck.subject,
      });
      if (deckError) throw deckError;
      const { error: cardError } = await supabase.from('flashcards').insert(
        deck.cards.map(card => ({ id: card.id, deck_id: deck.id, front: card.front, back: card.back }))
      );
      if (cardError) {
        const { error: rollbackError } = await supabase.from('flashcard_decks').delete().eq('id', deck.id).eq('owner_id', owner);
        throw new Error(cardError.message + (rollbackError ? '; cleanup failed: ' + rollbackError.message : ''));
      }
      snapshot.current = [deck, ...snapshot.current];
      setDecks(snapshot.current);
      return deck.id;
    },
    details(id, { title, subject }) {
      if (!cleanDeckTitle(title)) return false;
      const next = patch(id, d => ({ ...d, title: cleanDeckTitle(title), subject: cleanLine(subject, MAX_SUBJECT) }));
      if (next) write(async () => {
        const { error } = await supabase.from('flashcard_decks')
          .update({ title: next.title, subject: next.subject }).eq('id', id).eq('owner_id', owner);
        if (error) throw error;
      });
      return !!next;
    },
    remove(id) {
      snapshot.current = snapshot.current.filter(d => d.id !== id); setDecks(snapshot.current);
      write(async () => {
        const { error } = await supabase.from('flashcard_decks').delete().eq('id', id).eq('owner_id', owner);
        if (error) throw error;
      });
    },
    addCard(id, front, back) {
      const err = validateCard(front, back); if (err) return err;
      const deck = snapshot.current.find(d => d.id === id);
      if (!deck) return 'Deck not found.';
      if (deck.cards.length >= MAX_CARDS) return `A deck can hold up to ${MAX_CARDS} cards.`;
      const card = makeCard(front, back);
      patch(id, d => ({ ...d, cards: [...d.cards, card] }));
      write(async () => {
        const { error } = await supabase.from('flashcards').insert({
          id: card.id, deck_id: id, front: card.front, back: card.back,
        });
        if (error) throw error;
      });
      return '';
    },
    editCard(id, cardId, front, back) {
      const err = validateCard(front, back); if (err) return err;
      const f = cleanSide(front, MAX_FRONT), b = cleanSide(back, MAX_BACK);
      patch(id, d => ({ ...d, cards: d.cards.map(c => c.id === cardId
        ? { ...c, front: f, back: b, known: f === c.front && b === c.back ? c.known : false } : c) }));
      write(async () => {
        const { error } = await supabase.from('flashcards').update({ front: f, back: b, known: f === deck.cards.find(c => c.id === cardId)?.front && b === deck.cards.find(c => c.id === cardId)?.back ? deck.cards.find(c => c.id === cardId)?.known === true : false }).eq('id', cardId).eq('deck_id', id);
        if (error) throw error;
      });
      return '';
    },
    removeCard(id, cardId) {
      patch(id, d => ({ ...d, cards: d.cards.filter(c => c.id !== cardId) }));
      write(async () => {
        const { error } = await supabase.from('flashcards').delete().eq('id', cardId).eq('deck_id', id);
        if (error) throw error;
      });
    },
    // Persist each answered card so library mastery survives reloads and new sessions.
    mark(id, marks) {
      const updates = Object.entries(marks).filter(([cardId]) => snapshot.current.find(d => d.id === id)?.cards.some(c => c.id === cardId));
      if (!updates.length) return;
      patch(id, d => ({ ...d, cards: d.cards.map(c => Object.prototype.hasOwnProperty.call(marks, c.id) ? { ...c, known: marks[c.id] === true } : c) }));
      write(async () => {
        for (const [cardId, known] of updates) {
          const { error } = await supabase.from('flashcards').update({ known: known === true }).eq('id', cardId).eq('deck_id', id);
          if (error) throw error;
        }
      });
    },
    resetProgress(id) {
      patch(id, d => ({ ...d, cards: d.cards.map(c => ({ ...c, known: false })) }));
      write(async () => {
        const { error } = await supabase.from('flashcards').update({ known: false }).eq('deck_id', id);
        if (error) throw error;
      });
    },
  }), [saved, loading, error, owner]);
}
