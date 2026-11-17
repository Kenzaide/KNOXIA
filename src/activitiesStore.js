/**
 * Group study activity storage and hooks (Patch 22). The rules are in `src/activitiesCalc.js`.
 *
 * FRONTEND-ONLY DEMO: activities are saved in this browser's localStorage under one shared key, so accounts
 * registered in the same browser share them (open a second tab and sign in as another person to try it).
 * Anyone using the browser can edit them. Swapping in a backend later: keep the exported function names.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { local } from './storage.js';
import { ACTIVITIES_KEY, savedRooms } from './roomsStore.js';
import {
  activitiesOf, startSession, joinSession, leaveSession, shareQuiz, submitQuiz, createGoals, addGoal, toggleGoal, deleteActivity,
} from './activitiesCalc.js';

const NONE = [];
const saved = () => local.get(ACTIVITIES_KEY, NONE, Array.isArray);

/** The activities of one room, newest first. Re-renders on any change, also from another tab. */
export function useRoomActivities(roomId) {
  const subscribe = useCallback((fn) => local.subscribe(ACTIVITIES_KEY, fn), []);
  const raw = useSyncExternalStore(subscribe, saved, () => NONE);
  return useMemo(() => activitiesOf(raw, roomId), [raw, roomId]);
}

// Each action reads the latest saved data, applies one rule and saves only when it worked.
function apply(fn) { const out = fn(saved(), savedRooms()); if (out.ok) local.set(ACTIVITIES_KEY, out.activities); return out; }

export const startStudySession = (me, roomId, fields) => apply((a, r) => startSession(a, r, me.id, roomId, fields));
export const joinStudySession = (me, id) => apply((a, r) => joinSession(a, r, me.id, id));
export const leaveStudySession = (me, id) => apply((a) => leaveSession(a, me.id, id));
export const shareGroupQuiz = (me, roomId, fields) => apply((a, r) => shareQuiz(a, r, me.id, roomId, fields));
export const submitGroupQuiz = (me, id, answers, secs) => apply((a, r) => submitQuiz(a, r, me.id, id, answers, secs));
export const startGoalList = (me, roomId, title) => apply((a, r) => createGoals(a, r, me.id, roomId, title));
export const addGroupGoal = (me, id, text) => apply((a, r) => addGoal(a, r, me.id, id, text));
export const toggleGroupGoal = (me, id, itemId) => apply((a, r) => toggleGoal(a, r, me.id, id, itemId));
export const removeActivity = (me, id) => apply((a, r) => deleteActivity(a, r, me.id, id));
