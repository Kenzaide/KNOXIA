/**
 * Public profile storage and hooks (Patch 19). The rules are in `src/profileCalc.js`.
 *
 * Study data is saved per account (`knoxia-decks::<email>` and so on, see storage.js). A profile page reads the
 * saved lists of the person it shows, so you can see a classmate's real streak, quizzes and shared materials
 * when they allow it. The same code reads your own data, so your profile and the Achievements page agree with
 * Study Progress.
 *
 * FRONTEND-ONLY DEMO: "who can see what" is only enforced by the screens. Every account's data sits in this
 * browser's localStorage and anyone using the browser could read it. A real backend must check visibility on
 * the server and only send what the viewer is allowed to see.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { local, userData, userKey, useUserData } from './storage.js';
import { useProfile, emailKey } from './accounts.js';
import { KEYS, BADGES } from './data.js';
import { KEY as DECKS_KEY, SEED as SEED_DECKS } from './flashcards.js';
import { SEED_MATERIALS } from './materials.jsx';
import { KEY as PROGRESS_KEY } from './progressStore.js';
import { buildProgress } from './progressCalc.js';
import { useFeed } from './feedStore.js';
import { postsBy } from './feedCalc.js';
import { DEFAULT_SOCIAL, cleanSocial, toggleShared, profileStats, badgeStatus, sharedMaterials } from './profileCalc.js';

export const SOCIAL_KEY = 'knoxia-social';
const MATERIALS_KEY = 'knoxia-materials';
const EMPTY_LIST = []; const EMPTY_OBJ = {}; // stable values, so React sees an unchanged snapshot while nothing is saved

/**
 * A saved value of `person` (or of you, when `mine`). Other people's data is read from their own key only,
 * never from the shared old key, so you can never be shown your own data as theirs.
 */
function useStoredOf(person, mine, key, fallback) {
  const k = mine ? userKey(key) : `${key}::${emailKey(person && person.email)}`;
  const subscribe = useCallback((fn) => (mine ? userData.subscribe(key, fn) : local.subscribe(k, fn)), [mine, key, k]);
  const read = () => (mine ? userData.get(key, fallback) : (person && person.email ? local.get(k, fallback) : fallback));
  return useSyncExternalStore(subscribe, read, () => fallback);
}
const list = (v) => (Array.isArray(v) ? v : EMPTY_LIST);

/** Everything about a person's learning that a profile can show, before visibility is applied. */
export function usePersonActivity(person, mine) {
  // Until an account saves its own library or decks, the app shows the sample ones (see materials.jsx and flashcards.js), so read them the same way.
  const storedMaterials = useStoredOf(person, mine, MATERIALS_KEY, null); const storedDecks = useStoredOf(person, mine, DECKS_KEY, null);
  const materials = Array.isArray(storedMaterials) ? storedMaterials : person && (person.email || mine) ? SEED_MATERIALS : EMPTY_LIST;
  const decks = Array.isArray(storedDecks) ? storedDecks : person && (person.email || mine) ? SEED_DECKS : EMPTY_LIST;
  const reviewers = list(useStoredOf(person, mine, KEYS.reviewers, EMPTY_LIST));
  const attempts = list(useStoredOf(person, mine, KEYS.attempts, EMPTY_LIST));
  const log = useStoredOf(person, mine, PROGRESS_KEY, EMPTY_OBJ);
  const socialRaw = useStoredOf(person, mine, SOCIAL_KEY, EMPTY_OBJ);
  const social = useMemo(() => cleanSocial(socialRaw), [socialRaw]);
  const { posts } = useFeed();
  const today = new Date().toDateString(); // recompute when the day changes
  return useMemo(() => {
    const records = log && typeof log.reviewers === 'object' && !Array.isArray(log.reviewers) ? log.reviewers : {};
    const progress = buildProgress({ reviewers, records, sessions: list(log && log.sessions), decks, attempts });
    const own = person && person.id ? postsBy(posts, person.id) : [];
    const stats = profileStats(progress, { materials: materials.length, decks: decks.length, posts: own.length });
    return { progress, stats, badges: badgeStatus(stats, BADGES), social, materials, shared: sharedMaterials(materials, social.shared), posts: own };
  }, [materials, decks, reviewers, attempts, log, social, posts, person, today]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Your own badges, from your real activity. Same shape as `BADGES` in data.js. */
export function useMyBadges() {
  const me = useProfile();
  return usePersonActivity(me, true).badges;
}

/** Your privacy and sharing choices, and the two ways to change them. */
export function useMySocial() {
  const [raw, setRaw] = useUserData(SOCIAL_KEY, DEFAULT_SOCIAL);
  const social = useMemo(() => cleanSocial(raw), [raw]);
  return useMemo(() => ({
    social,
    setVisibility: (visibility) => setRaw(cleanSocial({ ...social, visibility })),
    /** Share or unshare a material. Returns { error } when it cannot be done. */
    toggleShare(id) { const out = toggleShared(social.shared, id); if (!out.error) setRaw(cleanSocial({ ...social, shared: out.shared })); return out; },
  }), [social, setRaw]);
}
