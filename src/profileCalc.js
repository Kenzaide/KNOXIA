/**
 * Public profile rules (Patch 19): who may see what, what a person shares, and which badges they have earned.
 *
 * Pure functions only: no storage, no React (so `npm test` can cover them). Storage and hooks live in
 * `src/profileStore.js`, the screens in `src/profileSocial.jsx`.
 *
 * Each person saves { visibility, shared } under `knoxia-social`:
 *   visibility  'everyone' | 'friends' | 'me': who can see their learning activity, achievements and shared materials.
 *               The default is 'friends'. Their posts on the feed are always public, because the feed is.
 *   shared      ids of their own materials they chose to show on their profile. Nothing is shared until they pick it.
 */
export const MAX_SHARED = 20;
export const VISIBILITY = [
  { key: 'everyone', label: 'Everyone', hint: 'Anyone with an account can see them.' },
  { key: 'friends', label: 'Friends only', hint: 'Only people you are friends with can see them.' },
  { key: 'me', label: 'Only me', hint: 'Nobody else can see them.' },
];
export const DEFAULT_SOCIAL = { visibility: 'friends', shared: [] };
export const isVisibility = (v) => VISIBILITY.some((o) => o.key === v);

/** Saved settings can be missing, corrupt or edited by hand: always return a complete, valid record. */
export function cleanSocial(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const shared = Array.isArray(r.shared) ? [...new Set(r.shared.filter((x) => typeof x === 'string' && x))].slice(0, MAX_SHARED) : [];
  return { visibility: isVisibility(r.visibility) ? r.visibility : DEFAULT_SOCIAL.visibility, shared };
}

/**
 * Can someone see this person's activity, achievements and shared materials?
 * `rel` is how the viewer stands with them (friendsCalc.relation): 'self', 'friends', or anything else for a stranger.
 */
export function canSee(visibility, rel) {
  if (rel === 'self') return true;
  if (visibility === 'everyone') return true;
  if (visibility === 'friends') return rel === 'friends';
  return false;
}

/** Share a material, or stop sharing it. At most MAX_SHARED at once; returns { shared } or { shared, error }. */
export function toggleShared(shared, id) {
  const list = Array.isArray(shared) ? shared : [];
  if (!id) return { shared: list, error: 'Pick a material to share.' };
  if (list.includes(id)) return { shared: list.filter((x) => x !== id) };
  if (list.length >= MAX_SHARED) return { shared: list, error: `You can share up to ${MAX_SHARED} materials.` };
  return { shared: [...list, id] };
}

/** The materials a person chose to show: only ones that still exist, newest upload first. Only public details are kept. */
export function sharedMaterials(materials, shared) {
  const ids = new Set(Array.isArray(shared) ? shared : []);
  const time = (m) => { const t = new Date(m.uploaded).getTime(); return Number.isFinite(t) ? t : 0; };
  return (Array.isArray(materials) ? materials : []).filter((m) => m && typeof m === 'object' && ids.has(m.id))
    .map((m) => ({ id: m.id, name: String(m.name || 'Untitled'), type: String(m.type || ''), subject: String(m.subject || ''), desc: String(m.desc || ''), uploaded: m.uploaded }))
    .sort((a, b) => time(b) - time(a));
}

/* ---------- Stats and badges ---------- */
const hour = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? -1 : t.getHours(); };

/** The numbers badges and the profile need, from the study progress (progressCalc.buildProgress) and a few counts. */
export function profileStats(progress, { materials = 0, decks = 0, posts = 0 } = {}) {
  const p = progress || {}; const events = Array.isArray(p.events) ? p.events : [];
  const streak = p.streak || { current: 0, best: 0, days: 0 }; const quizzes = p.quizzes || { taken: 0, avg: null, best: null };
  return {
    streakCurrent: streak.current, streakBest: streak.best, studyDays: streak.days, secs: p.secs || 0,
    quizzesTaken: quizzes.taken, quizAvg: quizzes.avg, quizBest: quizzes.best,
    earlyBird: events.some((e) => { const h = hour(e.date); return h >= 0 && h < 7; }),
    materials, decks, posts,
  };
}

/** What earns each badge. Team Player and Challenger depend on study rooms and challenges, which are demo-only for now, so they stay locked. */
export const BADGE_RULES = {
  '7-Day Streak': (s) => s.streakBest >= 7,
  'Quiz Master': (s) => s.quizBest !== null && s.quizBest >= 90,
  'Early Bird': (s) => s.earlyBird,
  'Deck Builder': (s) => s.decks >= 5,
  'Team Player': () => false,
  'Bookworm': (s) => s.materials >= 10,
  'Challenger': () => false,
  '30-Day Streak': (s) => s.streakBest >= 30,
};

/** `badges` is the list from data.js ([name, description, icon, _]); the result has the same shape with `earned` filled in from real activity. */
export const badgeStatus = (stats, badges) => badges.map(([name, desc, icon]) => [name, desc, icon, !!(BADGE_RULES[name] && BADGE_RULES[name](stats))]);

/** The most recent `n` events, for a short "recent activity" list. */
export const recentEvents = (events, n = 5) => (Array.isArray(events) ? events.slice(0, n) : []);
