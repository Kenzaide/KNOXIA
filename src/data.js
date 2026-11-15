import { useEffect, useState } from 'react';

// Persists state in localStorage until a backend is connected.
export function useLocal(key, init) {
  const [v, setV] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(key)); if (s !== null) return s; } catch { /* use init */ }
    return init;
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }, [key, v]);
  return [v, setV];
}
// Synchronous write used right before navigating, so the next page can read it.
export const pushLS = (k, item, seed = []) => {
  try { const a = JSON.parse(localStorage.getItem(k)) || seed; localStorage.setItem(k, JSON.stringify([item, ...a])); } catch { /* ignore */ }
};

export const DECKS = [
  { id: '1', title: 'Machine Learning Fundamentals', cards: [['What is supervised learning?', 'Learning from labeled training data.'], ['What is overfitting?', 'A model memorizes training data and performs poorly on new data.'], ['What does regularization do?', 'Penalizes model complexity to reduce overfitting.'], ['What is a feature?', 'An input variable the model uses to make predictions.']] },
  { id: '2', title: 'Automata Theory', cards: [['What is a DFA?', 'A finite automaton with exactly one transition per state and symbol.'], ['How does an NFA differ?', 'It may have several (or no) next states for one symbol.'], ['What do finite automata recognize?', 'Regular languages.']] },
  { id: '3', title: 'Cybersecurity Essentials', cards: [['What is the CIA triad?', 'Confidentiality, Integrity and Availability.'], ['What is authentication?', 'Verifying who a user or system claims to be.'], ['What is least privilege?', 'Giving users only the access they need.']] },
  { id: '4', title: 'Computer Architecture', cards: [['What is a cache?', 'Small, fast memory that stores recently used data.'], ['What is pipelining?', 'Overlapping instruction stages to raise throughput.'], ['What is a data hazard?', 'An instruction needs a result that is not ready yet.']] },
];

// [question, options, correct index, explanation]
export const BANK = [
  ['Which best describes supervised learning?', ['Learning from labeled data', 'Learning without any data', 'Learning through rewards only', 'Learning by random guessing'], 0, 'Supervised models learn from input and label pairs.'],
  ['Which technique helps reduce overfitting?', ['Adding more layers', 'Regularization', 'Training for longer', 'Removing the validation set'], 1, 'Regularization penalizes complexity so the model generalizes better.'],
  ['How many transitions does a DFA have per state and symbol?', ['Zero or more', 'Exactly one', 'At most two', 'Any number'], 1, 'A DFA is deterministic: one transition for each state and symbol.'],
  ['Which language class do finite automata recognize?', ['Regular languages', 'Context-free languages', 'Recursively enumerable languages', 'Context-sensitive languages'], 0, 'Finite automata recognize exactly the regular languages.'],
  ['What does a CPU cache mainly reduce?', ['Instruction count', 'Memory access time', 'Clock speed', 'Disk size'], 1, 'Caches keep frequently used data close to the CPU.'],
  ['Which pipeline hazard happens when an instruction needs a result that is not ready?', ['Data hazard', 'Control hazard', 'Structural hazard', 'Power hazard'], 0, 'That is a data hazard (read-after-write dependency).'],
  ['Which of these is part of the CIA triad?', ['Integrity', 'Inspection', 'Isolation', 'Indexing'], 0, 'The triad is Confidentiality, Integrity and Availability.'],
  ['A model that does well on training data but poorly on new data is…', ['Underfitting', 'Overfitting', 'Balanced', 'Normalized'], 1, 'This gap between training and new data is overfitting.'],
  ['What can an NFA do that a DFA cannot?', ['Have multiple possible next states', 'Use larger alphabets', 'Run faster', 'Produce output symbols'], 0, 'NFAs allow several next states for one input symbol.'],
  ['Which control verifies a user’s identity?', ['Authentication', 'Encryption', 'Backup', 'Logging'], 0, 'Authentication proves who is asking for access.'],
];

export const makeReviewer = ({ title, file, style, notes }) => ({
  id: String(Date.now()), title, file, style, updated: new Date().toISOString(),
  body: `SOURCE\n${file}\n\nFORMAT\n${style}\n\nKEY CONCEPTS\n- Add the main ideas from the material here.\n\nDEFINITIONS\n- Term: meaning\n\nEXAMPLES\n- Worked example${notes ? `\n\nNOTES\n${notes}` : ''}`,
});
export const saveReviewer = (o) => { const r = makeReviewer(o); pushLS('knoxia-reviewers', r); return r.id; };

export const ROOMS = [
  { id: 'r1', name: 'Machine Learning Review', topic: 'Supervised learning', members: ['AR', 'MS', 'KP'] },
  { id: 'r2', name: 'Automata Theory Study Group', topic: 'DFA and NFA', members: ['JL', 'KP'] },
  { id: 'r3', name: 'Finals Preparation Room', topic: 'Mixed subjects', members: ['MS', 'AR', 'JL', 'KP'] },
];
export const CHALLENGES = [
  { id: 'c1', title: 'Machine Learning Face-off', opp: 'Mika Santos', init: 'MS', q: 0, score: 3 },
  { id: 'c2', title: 'Automata Speed Round', opp: 'Alex Rivera', init: 'AR', q: 2, score: 4 },
  { id: 'c3', title: 'Cybersecurity Challenge', opp: 'Jordan Lee', init: 'JL', q: 5, score: 2 },
];
export const BOARD = [['Alex Rivera', 'AR', 2840], ['Mika Santos', 'MS', 2510], ['Kenneth Punla', 'KP', 3240], ['Jordan Lee', 'JL', 1960], ['Sam Cruz', 'SC', 1720]];
export const BADGES = [
  ['7-Day Streak', 'Study 7 days in a row', 'Flame', true], ['Quiz Master', 'Score 90% or higher on a quiz', 'Target', true],
  ['Early Bird', 'Study before 7 AM', 'Zap', true], ['Deck Builder', 'Create 5 flashcard decks', 'Layers', false],
  ['Team Player', 'Join 3 study rooms', 'Users', false], ['Bookworm', 'Upload 10 materials', 'BookOpen', false],
  ['Challenger', 'Win 5 quiz challenges', 'Trophy', false], ['30-Day Streak', 'Study 30 days in a row', 'Medal', false],
];
export const NOTES = [
  { id: 'n1', t: 'Your quiz result is ready', s: 'Open your latest attempt to review answers.', to: '/analytics', read: false },
  { id: 'n2', t: 'Mika sent you a friend request', s: 'Accept it to study together.', to: '/friends', read: false },
  { id: 'n3', t: 'You earned a new achievement', s: '7-Day Streak', to: '/achievements', read: false },
  { id: 'n4', t: 'Alex challenged you', s: 'Machine Learning Face-off', to: '/challenges', read: true },
];
export const REPORTS = [
  { id: 'p1', type: 'Post', who: 'Mika Santos', reason: 'Contains an unrelated link', status: 'Pending' },
  { id: 'p2', type: 'Profile', who: 'Jordan Lee', reason: 'Inappropriate bio', status: 'Pending' },
  { id: 'p3', type: 'Comment', who: 'Alex Rivera', reason: 'Spam', status: 'Pending' },
  { id: 'p4', type: 'Post', who: 'Sam Cruz', reason: 'Duplicate post', status: 'Dismissed' },
];
export const LOGS = [
  { id: 'l1', t: 'User login: kenneth@example.com', time: '2026-11-15T07:58:00' },
  { id: 'l2', t: 'Material uploaded: Introduction to Machine Learning', time: '2026-11-14T08:00:00' },
  { id: 'l3', t: 'Report resolved: Duplicate post', time: '2026-11-13T15:20:00' },
  { id: 'l4', t: 'New user registered: Sam Cruz', time: '2026-11-12T10:05:00' },
];
export const logEvent = (t) => pushLS('knoxia-logs', { id: String(Date.now()), t, time: new Date().toISOString() }, LOGS);
