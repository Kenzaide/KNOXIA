/**
 * Quiz generation, demo (Patch 12): the rules for quizzes and questions, a demo generator that builds
 * questions from a saved reviewer, and `useQuizLibrary`, the one place that changes the saved quizzes.
 *
 * FRONTEND-ONLY DEMO: there is no AI model here. `generateFromReviewer` reads the reviewer's text and
 * re-uses what is already in it (definitions, key points, review questions) to build multiple-choice and
 * true/false questions with simple rules. It never invents facts: every correct answer is a term,
 * answer or word taken from the reviewer, and wrong answers come from the same reviewer. Replace it with a
 * call to your AI service later; the UI only depends on the shapes below.
 *
 * A quiz is { id, title, source, sourceTitle, created, updated, questions }.
 *   source: 'reviewer' | 'manual' | 'sample'
 * A question is { id, type, q, options, answer, explanation }.
 *   type: 'mcq' (2 to 4 options) | 'tf' (options are always ['True', 'False']); `answer` is the index of the right option.
 */
import { useMemo } from 'react';
import { useUserData } from './storage.js';
import { BANK } from './data.js';
import { shuffle, uid, cleanLine } from './flashcards.js';

export const KEY = 'knoxia-quizzes';
export const MAX_QUIZZES = 50;
export const MAX_QUESTIONS = 50;
export const MAX_TITLE = 80;
export const MAX_Q = 300;
export const MAX_OPTION = 140;
export const MAX_EXPLANATION = 300;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4; // the quiz runner labels options A to D
export const TF = ['True', 'False'];
export const COUNTS = ['5', '10', '15', '20'];
export const TYPE_LABELS = { mcq: 'Multiple choice', tf: 'True or false' };

export const cleanQuizTitle = (s) => cleanLine(s, MAX_TITLE);
const multiline = (s, max) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '\u2026');

/* ---------- validation ---------- */
/** Returns an error message, or '' when the question can be saved. */
export function validateQuestion({ type, q, options, answer }) {
  if (!multiline(q, 1e5)) return 'Write the question.';
  if (multiline(q, 1e5).length > MAX_Q) return `The question can be up to ${MAX_Q} characters.`;
  if (type === 'tf') return answer === 0 || answer === 1 ? '' : 'Choose whether the statement is true or false.';
  const opts = (options || []).map((o) => cleanLine(o, 1e5));
  if (opts.length < MIN_OPTIONS || opts.length > MAX_OPTIONS) return `Give between ${MIN_OPTIONS} and ${MAX_OPTIONS} answer options.`;
  if (opts.some((o) => !o)) return 'Fill in every answer option, or remove the empty ones.';
  if (opts.some((o) => o.length > MAX_OPTION)) return `Each option can be up to ${MAX_OPTION} characters.`;
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return 'Two options are the same. Make each option different.';
  if (!Number.isInteger(answer) || answer < 0 || answer >= opts.length) return 'Mark which option is correct.';
  return '';
}
export const makeQuestion = ({ type, q, options, answer, explanation }) => ({
  id: uid(), type: type === 'tf' ? 'tf' : 'mcq', q: multiline(q, MAX_Q),
  options: type === 'tf' ? [...TF] : options.map((o) => cleanLine(o, MAX_OPTION)), answer,
  explanation: multiline(explanation, MAX_EXPLANATION),
});
/** The quiz runner and the results page read a question as [text, options, correct index, explanation]. */
export const toTuple = (q) => [q.q, q.options, q.answer, q.explanation || ''];

export const makeQuiz = ({ title, source = 'manual', sourceTitle = '', questions = [] }) => {
  const now = new Date().toISOString();
  return { id: uid(), title: cleanQuizTitle(title), source, sourceTitle: cleanLine(sourceTitle, 120), created: now, updated: now, questions };
};
export const sourceLabel = (qz) => (qz.source === 'reviewer' ? `From ${qz.sourceTitle || 'a reviewer'}` : qz.source === 'sample' ? 'Sample quiz' : 'Written by you');

/* ---------- sample quiz ---------- */
export const SAMPLE_MAX = BANK.length;
/** A shuffled set of questions from the built-in sample bank, with the answer in a random place. */
export function sampleQuestions(count) {
  return shuffle(BANK).slice(0, Math.max(1, Math.min(Number(count) || 5, BANK.length))).map(([q, options, answer, explanation]) => {
    const order = shuffle(options.map((_, i) => i)); // shuffle the options and keep track of the right one
    return makeQuestion({ type: 'mcq', q, options: order.map((i) => options[i]), answer: order.indexOf(answer), explanation });
  });
}

/* ---------- reading a reviewer ---------- */
const HEAD = /^[A-Z][A-Z0-9 &/'\u2019-]{2,}$/;
const SKIP_POINTS = /^(SOURCE|FORMAT|FOCUS REQUESTED|KEY TERMS?( TO KNOW)?|NOTES)$/;
const DEF_HEAD = /DEFINITION|MEMORIZE/;
const QA_HEAD = /QUESTIONS/;
const BULLET = /^\s*(?:[-\u2022*])\s+(.*\S)\s*$/;
const STOP = new Set('about after again against also another because before between could during every first from have into more most other should their there these they this those through under were what when where which while with would'.split(' '));

/** Splits a reviewer's text into { head, lines } sections. Text under no heading, or after a blank line, stays with the section above. */
export function readReviewer(body) {
  const sections = [];
  for (const block of String(body || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
    if (!lines.length) continue;
    const head = lines[0].trim();
    if (HEAD.test(head)) sections.push({ head, lines: lines.slice(1) });
    else if (sections.length) sections[sections.length - 1].lines.push(...lines);
  }
  const defs = [], points = [], qas = [];
  for (const sec of sections) {
    if (DEF_HEAD.test(sec.head)) {
      for (const l of sec.lines) {
        const m = BULLET.exec(l); const d = m && /^([^:]{2,60}):\s+(.{8,})$/.exec(m[1]);
        if (d && d[1].trim().toLowerCase() !== 'term') defs.push({ term: d[1].trim(), meaning: d[2].trim() }); // "Term: meaning" is the empty starter template
      }
    } else if (QA_HEAD.test(sec.head)) {
      for (let k = 0; k < sec.lines.length; k++) {
        const qm = /^\s*\d+[.)]\s+(.+)$/.exec(sec.lines[k]); const am = qm && sec.lines[k + 1] && /^\s*Answer:\s*(.+)$/i.exec(sec.lines[k + 1]);
        if (am) { qas.push({ q: qm[1].trim(), a: am[1].trim() }); k++; }
      }
    } else if (!SKIP_POINTS.test(sec.head)) {
      for (const l of sec.lines) { const m = BULLET.exec(l); if (m && m[1].split(/\s+/).length >= 6) points.push(m[1].trim()); }
    }
  }
  return { defs, points, qas };
}

/** The most distinctive word of a sentence (long, not a common word), or '' when there is none. */
const keyWord = (s) => (s.match(/[A-Za-z][A-Za-z'-]{5,}/g) || []).map((w) => w.replace(/['-]+$/, '')).filter((w) => w.length >= 6 && !STOP.has(w.toLowerCase())).sort((a, b) => b.length - a.length)[0] || '';
/** Gives `w` the same capital-letter style as `like`, so a wrong option never stands out by its capital letter. */
const matchCase = (w, like) => (!w ? w : /^[A-Z]/.test(like) && like !== like.toUpperCase() ? w[0].toUpperCase() + w.slice(1) : /^[a-z]/.test(like) ? w[0].toLowerCase() + w.slice(1) : w);
const swapWord = (s, from, to) => s.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), to);
const uniqueCI = (list, not) => { const seen = new Set([String(not).toLowerCase()]); return list.filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); };
/** Puts the right answer among the wrong ones at a random place. Needs at least one wrong answer. */
const place = (right, wrong) => { const opts = shuffle([right, ...wrong]); return { options: opts, answer: opts.indexOf(right) }; };
const pickWrong = (pool, right, n) => shuffle(uniqueCI(pool, right)).slice(0, n);
const tfQuestion = (q, truth, explanation) => makeQuestion({ type: 'tf', q: `True or false: ${q}`, answer: truth ? 0 : 1, explanation });

/**
 * Builds up to `count` questions from a reviewer's text. Every definition, key point and review question is
 * used at most once. Throws an Error with a student-friendly message when nothing can be built.
 * @param {{ body: string, count?: number, types?: ('mcq'|'tf')[] }} input
 */
export function generateFromReviewer({ body, count = 10, types = ['mcq', 'tf'] }) {
  const want = new Set(types.filter((t) => t === 'mcq' || t === 'tf')); if (!want.size) throw new Error('Choose at least one question type.');
  const read = readReviewer(body); const { defs, points } = read;
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const defMeanings = new Set(read.defs.map((d) => norm(d.meaning)));
  // A review question that only restates a definition would repeat the definition's own question.
  const qas = read.qas.filter((x) => !defMeanings.has(norm(x.a)));
  const blankKeys = qas.map((x) => /^Fill in the blank:/i.test(x.q) && /^([^.]{1,40})\.\s/.exec(x.a)).filter(Boolean).map((m) => m[1].trim());
  const terms = defs.map((d) => d.term), meanings = defs.map((d) => clip(d.meaning, MAX_OPTION)), answers = qas.map((x) => clip(x.a, MAX_OPTION));
  const words = points.map(keyWord).filter(Boolean);

  const makers = {
    def: (d) => [
      want.has('mcq') && uniqueCI(terms, d.term).length >= 1 && (() => { const { options, answer } = place(d.term, pickWrong(terms, d.term, MAX_OPTIONS - 1)); return makeQuestion({ type: 'mcq', q: `Which term matches this description? ${clip(d.meaning, 200)}`, options, answer, explanation: `${d.term}: ${d.meaning}` }); })(),
      want.has('mcq') && uniqueCI(meanings, clip(d.meaning, MAX_OPTION)).length >= 1 && (() => { const right = clip(d.meaning, MAX_OPTION); const { options, answer } = place(right, pickWrong(meanings, right, MAX_OPTIONS - 1)); return makeQuestion({ type: 'mcq', q: `What is ${d.term}?`, options, answer, explanation: `${d.term}: ${d.meaning}` }); })(),
      want.has('tf') && uniqueCI(defs.map((x) => x.meaning), d.meaning).length >= 1 && (() => { const truth = Math.random() < 0.5; const other = shuffle(uniqueCI(defs.map((x) => x.meaning), d.meaning))[0]; return tfQuestion(`${d.term}: ${clip(truth ? d.meaning : other, 220)}`, truth, `${d.term}: ${d.meaning}`); })(),
    ],
    // Only multiple choice from key points: a believable false statement cannot be made by swapping words.
    point: (s) => {
      const w = keyWord(s); if (!w) return [];
      const wrong = pickWrong(words, w, MAX_OPTIONS - 1).map((x) => matchCase(x, w));
      return [want.has('mcq') && wrong.length >= 2 && (() => { const { options, answer } = place(w, wrong); return makeQuestion({ type: 'mcq', q: `Fill in the blank: ${clip(swapWord(s, w, '_____'), 240)}`, options, answer, explanation: s }); })()];
    },
    qa: (x) => {
      const blank = /^Fill in the blank:/i.test(x.q) && /^([^.]{1,40})\.\s+(.+)$/.exec(x.a); // generator format: "Key. Full sentence."
      if (blank) {
        const right = blank[1].trim(); const wrong = pickWrong([...words, ...blankKeys], right, MAX_OPTIONS - 1).map((w) => matchCase(w, right));
        return [want.has('mcq') && wrong.length >= 2 && (() => { const { options, answer } = place(right, wrong); return makeQuestion({ type: 'mcq', q: x.q, options, answer, explanation: blank[2] }); })()];
      }
      const right = clip(x.a, MAX_OPTION);
      return [want.has('mcq') && uniqueCI(answers, right).length >= 1 && (() => { const { options, answer } = place(right, pickWrong(answers, right, MAX_OPTIONS - 1)); return makeQuestion({ type: 'mcq', q: x.q, options, answer, explanation: x.a }); })()];
    },
  };

  const items = shuffle([...defs.map((d) => ['def', d]), ...points.map((p) => ['point', p]), ...qas.map((x) => ['qa', x])]);
  const questions = [];
  for (const [kind, data] of items) {
    if (questions.length >= Math.min(count, MAX_QUESTIONS)) break;
    const made = shuffle(makers[kind](data).filter(Boolean).filter((q) => !validateQuestion(q)))[0];
    if (made && !questions.some((q) => q.q === made.q)) questions.push(made);
  }
  if (!questions.length) {
    const found = defs.length + points.length + qas.length;
    throw new Error(found === 0
      ? 'This reviewer has no definitions, key points or review questions to build from. Add some, write your own questions, or try the sample quiz.'
      : !want.has('mcq') ? 'True or false questions are built from definitions, and this reviewer has fewer than two. Add multiple choice too, or add more definitions.'
      : 'There is not enough in this reviewer to build questions. Add more definitions or key points, or write your own.');
  }
  return { questions, short: questions.length < count, found: defs.length + points.length + qas.length };
}

/* ---------- saved quizzes ---------- */
const NONE = [];
const normalize = (qz) => ({ ...qz, questions: Array.isArray(qz.questions) ? qz.questions.filter((q) => q && Array.isArray(q.options)) : [] });

/** The saved quizzes and every change to them. */
export function useQuizLibrary() {
  const [saved, setSaved] = useUserData(KEY, NONE);
  return useMemo(() => {
    const items = saved.map(normalize);
    const patch = (id, fn) => setSaved((a) => a.map((x) => (x.id === id ? { ...fn(normalize(x)), updated: new Date().toISOString() } : x)));
    return {
      items,
      /** Returns the new quiz's id, or '' when the quiz limit is reached. */
      add(quiz) { if (saved.length >= MAX_QUIZZES) return ''; setSaved((a) => [quiz, ...a]); return quiz.id; },
      /** Returns false when the new title is empty. */
      rename(id, title) { const t = cleanQuizTitle(title); if (!t) return false; patch(id, (x) => ({ ...x, title: t })); return true; },
      remove: (id) => setSaved((a) => a.filter((x) => x.id !== id)),
      /** Returns an error message, or '' when the question was added. */
      addQuestion(id, input) {
        const err = validateQuestion(input); if (err) return err;
        const cur = saved.find((x) => x.id === id); if (cur && (cur.questions || []).length >= MAX_QUESTIONS) return `A quiz can hold up to ${MAX_QUESTIONS} questions.`;
        patch(id, (x) => ({ ...x, questions: [...x.questions, makeQuestion(input)] })); return '';
      },
      editQuestion(id, qid, input) {
        const err = validateQuestion(input); if (err) return err;
        patch(id, (x) => ({ ...x, questions: x.questions.map((q) => (q.id === qid ? { ...makeQuestion(input), id: qid } : q)) })); return '';
      },
      removeQuestion: (id, qid) => patch(id, (x) => ({ ...x, questions: x.questions.filter((q) => q.id !== qid) })),
    };
  }, [saved, setSaved]);
}
