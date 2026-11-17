/**
 * Demo reviewer generator (Patch 9).
 *
 * FRONTEND-ONLY DEMO: there is no AI model here. The text is split into sentences and scored with
 * simple rules (word frequency, headings, definition and example patterns), then arranged into
 * sections for the chosen reviewer format. It only re-uses sentences that are already in the
 * material, so it never invents facts. Replace `generateReviewer` with a call to your AI service
 * when one exists; the UI only depends on the shape of what it returns:
 *
 *   { demo, style, stats, focus, sections: [{ id, heading, kind, items }] }
 *   kind: 'text' (items = strings) | 'bullets' (strings) | 'chips' (strings) | 'defs' ([{ term, meaning }]) | 'qa' ([{ q, a }])
 */

export const STYLES = ['Quick summary', 'Detailed reviewer', 'Exam cram', 'Topic-by-topic'];
export const MIN_WORDS = 40;
export const MAX_CHARS = 60000;

/** How many items each format keeps. `topics` is only used by Topic-by-topic. */
const PLAN = {
  'Quick summary': { overview: 2, concepts: 5, defs: 4, examples: 0, qa: 0, terms: 6 },
  'Detailed reviewer': { overview: 3, concepts: 10, defs: 8, examples: 4, qa: 6, terms: 10 },
  'Exam cram': { overview: 0, concepts: 8, defs: 6, examples: 0, qa: 8, terms: 8 },
  'Topic-by-topic': { overview: 2, concepts: 0, defs: 6, examples: 3, qa: 4, terms: 8, topics: 8 },
};

const STOP = new Set(('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just may me might more most must my no nor not now of off on once only or other our out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours often every using used use uses within without whether however therefore thus etc via per one two three four five means exactly example examples instance instances well good many called known need needs happens happen finds find predicts improves tend like make makes made get gets given give gives different similar simple small large big new first second next later usually always never able even still really much'.split(' ')));
const PRONOUN_START = /^(this|that|these|those|it|they|we|you|he|she|there|here|which|who|what|when|where|how|one|some|each|both|such|its|their)\b/i;
const EXAMPLE_CUE = /\b(for example|for instance|e\.g\.|such as|consider|suppose|imagine|as an example|a typical example)\b/i;
const DEF_VERBS = '(?:is|are|refers to|refer to|means|mean|is defined as|are defined as|is called|are called|is known as|are known as|describes|represents)';
const DEF_RE = new RegExp(`^(?:(?:a|an|the)\\s+)?([A-Za-z][\\w\\-/()' ]{1,60}?)\\s+${DEF_VERBS}\\s+(.{12,})$`, 'i');
const LABEL_RE = /^([A-Za-z][\w\-/()' ]{1,50}?)\s*(?::|\u2014|\u2013| - )\s+(.{12,})$/;

const WEAK_START = /^(?:often|also|usually|sometimes|not|very|more|less|easier|harder|always|never|typically|generally|still|just|mostly|rarely|likely|able|good|bad|used (?:to|for))\b/i;
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const words = (s) => (String(s).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []);
const keyWords = (s) => words(s).filter((w) => !STOP.has(w) && w.length >= 4);
const stem = (w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const trimTo = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '\u2026');
const endSentence = (s) => (/[.!?'")\]]$/.test(s) ? s : s + '.');

const BULLET = /^([\u2022\u25cf\u25aa\-*]|\d+[.)])\s+/;
/** A short, title-like line without a full stop: "Memory Hierarchy", "1. Pipelining". */
const isHeading = (line) => {
  const w = line.split(/\s+/);
  return line.length <= 70 && w.length <= 9 && !/[.!?:;,]$/.test(line) && !BULLET.test(line) && /^[\dA-Z#]/.test(line) && w.filter((x) => /^[A-Z0-9(#]/.test(x)).length / w.length >= 0.5;
};
const cleanHeading = (l) => clean(l.replace(/^#+\s*/, '').replace(/^\d+[.)]\s+/, ''));

/**
 * Splits the text into blocks, each tagged with the heading it sits under. A heading is a short title-like line
 * ("Memory Hierarchy") on its own or at the start of a block (a slide title), or in the middle of a block when
 * the line before it ends a sentence (text read from a PDF). A heading applies until the next heading.
 * Two headings in a row mean the first was a document title, so only the later one is kept.
 */
function readBlocks(text) {
  const raw = String(text).replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  const out = []; let current = '';
  raw.forEach((lines, bi) => {
    let seg = null; const push = () => { if (seg && seg.lines.length) out.push(seg); };
    lines.forEach((line, i) => {
      const next = lines[i + 1]; const prev = lines[i - 1];
      const here = isHeading(line) && (next ? /^([\dA-Z]|[\u2022\u25cf\u25aa\-*])/.test(next) && (i === 0 || /[.!?:]$/.test(prev)) : lines.length === 1 && bi < raw.length - 1);
      if (here) { push(); current = cleanHeading(line); seg = { heading: current, lines: [] }; }
      else { if (!seg) seg = { heading: current, lines: [] }; seg.lines.push(line); }
    });
    push();
  });
  return out;
}

/** Turns one line or paragraph into sentences. Bullet lines count as one sentence each. */
function sentencesOf(lines) {
  const out = [];
  for (const line of lines) {
    const bullet = BULLET.test(line);
    const body = line.replace(BULLET, '');
    const parts = bullet ? [body] : body.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/);
    for (const p of parts) { const s = clean(p); if (words(s).length >= 4 && s.length <= 320) out.push(s); }
  }
  return out;
}

function parseDefinition(s) {
  const m = DEF_RE.exec(s) || LABEL_RE.exec(s);
  if (!m) return null;
  const term = clean(m[1]).replace(/^(?:a|an|the)\s+/i, '');
  const meaning = clean(m[2]).replace(/[.]+$/, '');
  const n = words(term).length;
  if (n < 1 || n > 6 || PRONOUN_START.test(term) || STOP.has(term.toLowerCase())) return null;
  if (words(meaning).length < 3 || WEAK_START.test(meaning)) return null;
  return { term: cap(term), meaning: cap(meaning) };
}

/** Words the student asked to focus on ("focus on definitions and DFAs" -> dfas). */
function focusWords(instructions) {
  const generic = new Set(['focus', 'include', 'emphasize', 'emphasis', 'make', 'sure', 'please', 'add', 'more', 'less', 'real', 'world', 'examples', 'example', 'definitions', 'definition', 'terms', 'short', 'simple', 'detail', 'details', 'important', 'main', 'key', 'ideas', 'concepts', 'questions', 'question', 'practice', 'exam', 'reviewer']);
  return [...new Set(keyWords(instructions).filter((w) => !generic.has(w)))].slice(0, 8);
}

/**
 * Builds a reviewer from plain text. Throws an Error with a student-friendly message when the text is too short.
 * @param {{ text: string, style?: string, instructions?: string, title?: string }} input
 */
export function generateReviewer({ text, style = 'Detailed reviewer', instructions = '' }) {
  const body = String(text || '').slice(0, MAX_CHARS);
  const totalWords = (body.match(/\S+/g) || []).length;
  if (totalWords < MIN_WORDS) throw new Error(`There is not enough text to build a reviewer. Add at least ${MIN_WORDS} words (this has ${totalWords}).`);
  const base = PLAN[style] || PLAN['Detailed reviewer'];
  const wantsDefs = /definition|terms|vocab/i.test(instructions), wantsExamples = /example|real.?world|application/i.test(instructions);
  const plan = { ...base, defs: base.defs + (wantsDefs ? 4 : 0), examples: base.examples + (wantsExamples ? 3 : 0) };
  const focus = focusWords(instructions);

  // 1. Sentences, with the heading of the block they came from and their position in the text.
  const blocks = readBlocks(body);
  const sents = [];
  blocks.forEach((b, bi) => sentencesOf(b.lines).forEach((s, si) => sents.push({ s, heading: b.heading, block: bi, first: si === 0, idx: sents.length })));
  const topics = [...new Set(sents.map((x) => x.heading).filter(Boolean))].map((heading, i) => ({ heading, title: i === 0 }));
  if (!sents.length) throw new Error('No full sentences were found in this text. Try a file or notes written in sentences or bullet points.');

  // 2. Word frequency across the material (a word that appears in many places is probably a key idea).
  const freq = new Map(); sents.forEach(({ s }) => keyWords(s).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1)));
  const top = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 40);
  const maxF = top.length ? top[0][1] : 1;

  // 3. Definitions and examples.
  const defs = []; const seen = new Set(); const defIdx = new Set();
  sents.forEach((x) => {
    const d = parseDefinition(x.s);
    if (d && !seen.has(d.term.toLowerCase())) { seen.add(d.term.toLowerCase()); defs.push({ ...d, idx: x.idx, heading: x.heading }); defIdx.add(x.idx); }
  });
  const exampleIdx = new Set(sents.filter((x) => EXAMPLE_CUE.test(x.s)).map((x) => x.idx));

  // 4. Score every sentence.
  const score = (x) => {
    const ks = keyWords(x.s); if (!ks.length) return 0;
    let v = ks.reduce((t, w) => t + (freq.get(w) || 0) / maxF, 0) / Math.sqrt(ks.length + 2);
    if (x.first) v *= 1.25; if (x.idx < 3) v *= 1.15;
    if (defIdx.has(x.idx)) v *= 1.2;
    if (focus.length && ks.some((w) => focus.some((f) => w.startsWith(f.slice(0, Math.max(4, f.length - 1)))))) v *= 1.6;
    if (x.s.length < 35) v *= 0.7;
    return v;
  };
  const ranked = sents.map((x) => ({ ...x, v: score(x) })).sort((a, b) => b.v - a.v || a.idx - b.idx);
  const pick = (n, skip = new Set()) => ranked.filter((x) => !skip.has(x.idx)).slice(0, n).sort((a, b) => a.idx - b.idx);

  // 5. Sections for the chosen format.
  const sections = []; const used = new Set();
  const add = (id, heading, kind, items) => { if (items.length) sections.push({ id, heading, kind, items }); };

  const opener = plan.overview && !exampleIdx.has(sents[0].idx) ? [sents[0]] : [];
  const overview = [...opener, ...pick(plan.overview - opener.length, new Set([...defIdx, ...exampleIdx, ...opener.map((x) => x.idx)]))].sort((a, b) => a.idx - b.idx);
  overview.forEach((x) => used.add(x.idx));
  add('overview', style === 'Exam cram' ? 'Exam focus' : 'Overview', 'text', overview.length ? [overview.map((x) => endSentence(x.s)).join(' ')] : []);

  if (style === 'Topic-by-topic') {
    const heads = topics.slice(0, plan.topics);
    heads.forEach((t, i) => {
      const inTopic = ranked.filter((x) => x.heading === t.heading && !used.has(x.idx));
      const inBlock = (inTopic.some((x) => !defIdx.has(x.idx)) ? inTopic.filter((x) => !defIdx.has(x.idx)) : inTopic).slice(0, 3).sort((a, b) => a.idx - b.idx);
      inBlock.forEach((x) => used.add(x.idx));
      add(`topic-${i}`, t.heading, 'bullets', inBlock.map((x) => endSentence(x.s)));
    });
    if (!heads.length) { // no headings in the material: fall back to plain key points
      const pts = pick(8, used); pts.forEach((x) => used.add(x.idx)); add('concepts', 'Key points', 'bullets', pts.map((x) => endSentence(x.s)));
    }
  } else {
    const pts = pick(plan.concepts, new Set([...used, ...defIdx, ...exampleIdx])); pts.forEach((x) => used.add(x.idx));
    add('concepts', style === 'Exam cram' ? 'Must-know points' : 'Key concepts', 'bullets', pts.map((x) => endSentence(x.s)));
  }

  const termList = []; const stems = new Set();
  for (const [w] of top) { if (!stems.has(stem(w))) { stems.add(stem(w)); termList.push(cap(w)); } if (termList.length >= plan.terms) break; }
  if (style !== 'Exam cram') add('terms', 'Key terms to know', 'chips', termList);

  const chosenDefs = [...defs].sort((a, b) => (focus.some((f) => a.term.toLowerCase().includes(f.slice(0, 4))) ? -1 : 0) - (focus.some((f) => b.term.toLowerCase().includes(f.slice(0, 4))) ? -1 : 0) || a.idx - b.idx).slice(0, plan.defs);
  add('definitions', style === 'Exam cram' ? 'Memorize these' : 'Definitions', 'defs', chosenDefs.map(({ term, meaning }) => ({ term, meaning: endSentence(meaning) })));

  const ex = plan.examples ? sents.filter((x) => exampleIdx.has(x.idx)).slice(0, plan.examples) : [];
  add('examples', 'Examples from your material', 'bullets', ex.map((x) => endSentence(x.s)));

  if (plan.qa) {
    const qa = [];
    chosenDefs.forEach((d) => qa.push({ q: `What is ${d.term.slice(1) === d.term.slice(1).toLowerCase() ? d.term.charAt(0).toLowerCase() + d.term.slice(1) : d.term}?`, a: endSentence(d.meaning) }));
    topics.filter((t) => !(t.title && topics.length > 2)).forEach((t) => { if (qa.length < plan.qa) { const mine = ranked.filter((x) => x.heading === t.heading && !defIdx.has(x.idx)); const first = mine.find((x) => !exampleIdx.has(x.idx)) || mine[0]; if (first) qa.push({ q: `Explain: ${t.heading}`, a: endSentence(first.s) }); } });
    const leftovers = pick(plan.qa, defIdx).filter((x) => !qa.some((q) => q.a === endSentence(x.s)));
    leftovers.forEach((x) => {
      if (qa.length >= plan.qa) return;
      const key = keyWords(x.s).sort((a, b) => (freq.get(b) || 0) - (freq.get(a) || 0))[0];
      const blanked = key ? x.s.replace(new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'gi'), '_____') : '';
      if (blanked && blanked !== x.s) qa.push({ q: `Fill in the blank: ${blanked}`, a: `${cap(key)}. ${endSentence(x.s)}` });
    });
    add('questions', style === 'Exam cram' ? 'Likely exam questions' : 'Review questions', 'qa', qa.slice(0, plan.qa));
  }

  const count = (kind) => sections.filter((s) => s.kind === kind).reduce((t, s) => t + s.items.length, 0);
  return {
    demo: true, style, focus, sections, truncated: String(text || '').length > MAX_CHARS,
    stats: { words: totalWords, sentences: sents.length, points: count('bullets'), definitions: count('defs'), questions: count('qa') },
  };
}

/** Plain-text form of a result. The reviewer editor stores and edits this text. */
export function reviewerToText(result, { file = '', style = '' } = {}) {
  const lines = [`SOURCE\n${file}`, `FORMAT\n${style || result.style}`];
  for (const sec of result.sections) {
    const head = sec.heading.toUpperCase();
    if (sec.kind === 'text') lines.push(`${head}\n${sec.items.join('\n')}`);
    else if (sec.kind === 'chips') lines.push(`${head}\n- ${sec.items.join(' \u00b7 ')}`);
    else if (sec.kind === 'bullets') lines.push(`${head}\n${sec.items.map((i) => `- ${i}`).join('\n')}`);
    else if (sec.kind === 'defs') lines.push(`${head}\n${sec.items.map((d) => `- ${d.term}: ${d.meaning}`).join('\n')}`);
    else if (sec.kind === 'qa') lines.push(`${head}\n${sec.items.map((p, i) => `${i + 1}. ${p.q}\n   Answer: ${p.a}`).join('\n')}`);
  }
  if (result.focus && result.focus.length) lines.push(`FOCUS REQUESTED\n${result.focus.join(', ')}`);
  return lines.join('\n\n');
}
