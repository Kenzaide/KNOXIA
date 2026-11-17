/**
 * XP, level and achievement hooks (Patches 23 and 24). The rules are in `src/xpCalc.js` and `src/achievementsCalc.js`;
 * the numbers come from `usePersonActivity` (profileStore.js), so Achievements, Leaderboards and profiles all agree.
 *
 * XP and progress are always worked out from the saved activity. The only thing saved here, per account under
 * `knoxia-gamification`, is { ready, level, unlocked: { [achievementId]: ISO date | null } }: it remembers when each
 * badge was unlocked and which level you last saw, so a badge or level-up is announced once.
 *
 * FRONTEND-ONLY DEMO: this is saved in the browser, so it can be edited. A real backend should award XP on the server.
 */
import { useEffect, useMemo } from 'react';
import { useUserData } from './storage.js';
import { useProfile } from './accounts.js';
import { toast } from './materials.jsx';
import { addNote } from './friendsStore.js';
import { usePersonActivity } from './profileStore.js';
import { xpSince } from './xpCalc.js';
import { achievementStatus, newlyEarned } from './achievementsCalc.js';

export const GAME_KEY = 'knoxia-gamification';
const EMPTY = { ready: false, level: 1, unlocked: {} };
const clean = (r) => (r && typeof r === 'object' && !Array.isArray(r) ? { ready: !!r.ready, level: Number.isFinite(r.level) ? r.level : 1, unlocked: r.unlocked && typeof r.unlocked === 'object' && !Array.isArray(r.unlocked) ? r.unlocked : {} } : EMPTY);

/** Your XP, level, XP awards and achievements (with unlock dates). */
export function useMyGamification() {
  const me = useProfile(); const data = usePersonActivity(me, true); const [raw] = useUserData(GAME_KEY, EMPTY); const rec = clean(raw);
  return useMemo(() => ({
    xp: data.xp, level: data.level, awards: data.awards, stats: data.stats, streak: data.progress.streak,
    week: xpSince(data.awards, 7), month: xpSince(data.awards, 30),
    achievements: achievementStatus(data.stats, rec.unlocked),
  }), [data, raw]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Announces new badges and level-ups (a toast and a notification) and remembers when badges were unlocked.
 * The first time it runs for an account it only records what is already earned, so nobody gets a flood of notifications.
 * Mount it once, inside the signed-in app.
 */
export function useGamificationSync() {
  const me = useProfile(); const data = usePersonActivity(me, true); const [raw, setRaw] = useUserData(GAME_KEY, EMPTY);
  useEffect(() => {
    if (!me.email) return;
    const rec = clean(raw); const list = achievementStatus(data.stats); const level = data.level.level;
    const earned = list.filter((a) => a.earned);
    if (!rec.ready) { setRaw({ ready: true, level, unlocked: Object.fromEntries(earned.map((a) => [a.id, null])) }); return; }
    const fresh = newlyEarned(list, rec.unlocked); const up = level > rec.level;
    if (!fresh.length && level === rec.level) return;
    const now = new Date().toISOString();
    setRaw({ ready: true, level, unlocked: { ...rec.unlocked, ...Object.fromEntries(fresh.map((id) => [id, now])) } });
    fresh.forEach((id) => { const a = list.find((x) => x.id === id); addNote(me.email, { id: `ach-${id}`, t: `Badge unlocked: ${a.name}`, s: a.desc, to: '/achievements' }); });
    if (up) addNote(me.email, { id: `level-${level}`, t: `You reached level ${level}`, s: `${data.level.title}. Keep studying to level up again.`, to: '/achievements' });
    toast(up ? `Level ${level}!${fresh.length ? ` +${fresh.length} new badge${fresh.length === 1 ? '' : 's'}` : ''}` : fresh.length === 1 ? `Badge unlocked: ${list.find((x) => x.id === fresh[0]).name}` : `${fresh.length} new badges unlocked`);
  }, [me.email, data.stats, data.level, raw]); // eslint-disable-line react-hooks/exhaustive-deps
}
