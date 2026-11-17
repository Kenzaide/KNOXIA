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
import { KEYS } from './data.js';
import { KEY as DECKS_KEY, SEED as SEED_DECKS } from './flashcards.js';
import { SEED_MATERIALS } from './materials.jsx';
import { KEY as PROGRESS_KEY } from './progressStore.js';
import { buildProgress } from './progressCalc.js';
import { useFeed } from './feedStore.js';
import { postsBy } from './feedCalc.js';
import { DEFAULT_SOCIAL, cleanSocial, toggleShared, profileStats, sharedMaterials } from './profileCalc.js';
import { ROOMS_KEY, ACTIVITIES_KEY, savedRooms } from './roomsStore.js';
import { cleanRooms } from './roomsCalc.js';
import { cleanActivities } from './activitiesCalc.js';
import { buildAwards, totalXp, levelFor } from './xpCalc.js';
import { claimedAwards } from './gamificationPhase5Calc.js';
import { achievementStatus, badgeTuples } from './achievementsCalc.js';

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
const savedActivities = () => local.get(ACTIVITIES_KEY, EMPTY_LIST, Array.isArray);
/** Study rooms and group activities are shared by everyone in this browser (roomsStore.js, activitiesStore.js). */
function useShared(key, read) { const subscribe = useCallback((fn) => local.subscribe(key, fn), [key]); return useSyncExternalStore(subscribe, read, () => EMPTY_LIST); }

/** Everything about a person's learning that a profile can show, before visibility is applied. */
export function usePersonActivity(person, mine) {
  // Until an account saves its own library or decks, the app shows the sample ones (see materials.jsx and flashcards.js), so read them the same way.
  const storedMaterials = useStoredOf(person, mine, MATERIALS_KEY, null); const storedDecks = useStoredOf(person, mine, DECKS_KEY, null);
  const materials = Array.isArray(storedMaterials) ? storedMaterials : person && (person.email || mine) ? SEED_MATERIALS : EMPTY_LIST;
  const decks = Array.isArray(storedDecks) ? storedDecks : person && (person.email || mine) ? SEED_DECKS : EMPTY_LIST;
  const reviewers = list(useStoredOf(person, mine, KEYS.reviewers, EMPTY_LIST));
  const attempts = list(useStoredOf(person, mine, KEYS.attempts, EMPTY_LIST));
  const log = useStoredOf(person, mine, PROGRESS_KEY, EMPTY_OBJ);
  const missionClaims = useStoredOf(person, mine, 'knoxia-mission-claims', EMPTY_LIST);
  const socialRaw = useStoredOf(person, mine, SOCIAL_KEY, EMPTY_OBJ);
  const social = useMemo(() => cleanSocial(socialRaw), [socialRaw]);
  const { posts } = useFeed();
  const rooms = useShared(ROOMS_KEY, savedRooms); const activities = useShared(ACTIVITIES_KEY, savedActivities);
  const today = new Date().toDateString(); // recompute when the day changes
  return useMemo(() => {
    const records = log && typeof log.reviewers === 'object' && !Array.isArray(log.reviewers) ? log.reviewers : {};
    const sessions = list(log && log.sessions);
    const progress = buildProgress({ reviewers, records, sessions, decks, attempts });
    const own = person && person.id ? postsBy(posts, person.id) : [];
    // Rooms and group activities belong to the account id; sample classmates have no study data of their own.
    const id = person && person.id && (person.email || mine) ? person.id : '';
    const myRooms = id ? cleanRooms(rooms).filter((r) => r.memberIds.includes(id)) : [];
    const acts = id ? cleanActivities(activities).filter((a) => a.kind === 'quiz' ? a.results.some((r) => r.userId === id) : a.kind === 'session' ? a.joinedIds.includes(id) : a.items.some((i) => i.doneBy === id)) : [];
    const awards = buildAwards({
      attempts, sessions, posts: own.map((p) => p.createdAt),
      groupSessions: acts.filter((a) => a.kind === 'session').map((a) => a.startedAt),
      groupQuizzes: acts.filter((a) => a.kind === 'quiz').map((a) => a.results.find((r) => r.userId === id).at),
    });
    awards.push(...claimedAwards(missionClaims));
    awards.sort((a, b) => b.date - a.date);
    const xp = totalXp(awards); const level = levelFor(xp);
    const stats = profileStats(progress, { materials: materials.length, decks: decks.length, posts: own.length, rooms: myRooms.length, groupActivities: acts.length, level: level.level });
    return { progress, stats, badges: badgeTuples(stats), achievements: achievementStatus(stats), awards, xp, level, social, materials, shared: sharedMaterials(materials, social.shared), posts: own };
  }, [materials, decks, reviewers, attempts, log, missionClaims, social, posts, person, mine, rooms, activities, today]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Your own badges, from your real activity. Each is [name, description, icon, earned]. */
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
