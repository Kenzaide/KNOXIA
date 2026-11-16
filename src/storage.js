/**
 * Central browser storage. Every read/write of localStorage and sessionStorage for app data goes
 * through this file, so there is one place to swap for a real backend later.
 *
 *  - Safe: private mode, blocked storage and full quotas never throw (data then lives in memory).
 *  - Shared: all components using the same key read one value and re-render together,
 *    also across browser tabs (localStorage only).
 *  - Per user: `userData` / `useUserData` keep each account's data separate in the same browser.
 *
 * FRONTEND-ONLY DEMO: anything stored here can be edited by the user. Real data belongs on a server.
 */
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { getSession, useAuth } from './session.js';

/* ---------- raw access with an in-memory fallback ---------- */
const areas = {};
function area(kind) {
  if (kind in areas) return areas[kind];
  let a = null;
  try { a = kind === 'local' ? window.localStorage : window.sessionStorage; a.setItem('__knoxia_probe', '1'); a.removeItem('__knoxia_probe'); } catch { a = null; }
  return (areas[kind] = a);
}
const memory = { local: new Map(), session: new Map() };
const rawGet = (kind, key) => { const a = area(kind); if (a) { try { return a.getItem(key); } catch { /* fall back */ } } return memory[kind].has(key) ? memory[kind].get(key) : null; };
const rawSet = (kind, key, v) => { const a = area(kind); if (a) { try { a.setItem(key, v); memory[kind].delete(key); return true; } catch { /* quota: fall back */ } } memory[kind].set(key, v); return false; };
const rawRemove = (kind, key) => { const a = area(kind); if (a) { try { a.removeItem(key); } catch { /* ignore */ } } memory[kind].delete(key); };

/* ---------- change notification ---------- */
const listeners = new Map();
const emit = (kind, key) => { const s = listeners.get(`${kind}:${key}`); if (s) [...s].forEach((fn) => fn()); };
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (e) => { // another tab changed localStorage
    if (e.key === null) listeners.forEach((s, id) => { if (id.startsWith('local:')) s.forEach((fn) => fn()); });
    else emit('local', e.key);
  });
}

/* ---------- JSON store (one per storage area) ---------- */
const cache = new Map(); // keeps parsed values referentially stable so React can compare snapshots
function createStore(kind) {
  const id = (key) => `${kind}:${key}`;
  const api = {
    getRaw: (key) => rawGet(kind, key),
    setRaw: (key, str) => { const ok = rawSet(kind, key, String(str)); emit(kind, key); return ok; },
    removeRaw: (key) => { rawRemove(kind, key); cache.delete(id(key)); emit(kind, key); },
    /** Parsed value, or `fallback` when missing, corrupt, or rejected by `check`. */
    get(key, fallback = null, check) {
      const raw = rawGet(kind, key); if (raw === null) return fallback;
      const c = cache.get(id(key)); let value;
      if (c && c.raw === raw) value = c.value;
      else { try { value = JSON.parse(raw); } catch { return fallback; } cache.set(id(key), { raw, value }); }
      return check && !check(value) ? fallback : value;
    },
    set(key, value) { const raw = JSON.stringify(value); const ok = rawSet(kind, key, raw); cache.set(id(key), { raw, value }); emit(kind, key); return ok; },
    update(key, fn, fallback = null, check) { const next = fn(api.get(key, fallback, check)); api.set(key, next); return next; },
    remove: (key) => api.removeRaw(key),
    subscribe(key, fn) {
      const k = id(key); if (!listeners.has(k)) listeners.set(k, new Set());
      listeners.get(k).add(fn); return () => listeners.get(k).delete(fn);
    },
  };
  return api;
}
export const local = createStore('local');   // survives closing the browser
export const tab = createStore('session');   // ends with the tab

/* ---------- per-user data ---------- */
const MISSING = Symbol('missing');
export const userKey = (key) => {
  const s = getSession(); const email = s && s.user && typeof s.user.email === 'string' ? s.user.email.trim().toLowerCase() : '';
  return email ? `${key}::${email}` : key;
};
/** Like `local`, but scoped to the signed-in account. Reads fall back to the old unscoped key so earlier data is kept. */
export const userData = {
  get(key, fallback = null, check) {
    const k = userKey(key); const own = local.get(k, MISSING, check);
    if (own !== MISSING) return own;
    return k !== key ? local.get(key, fallback, check) : fallback;
  },
  set: (key, value) => local.set(userKey(key), value),
  update(key, fn, fallback = null, check) { const next = fn(userData.get(key, fallback, check)); userData.set(key, next); return next; },
  remove: (key) => local.remove(userKey(key)),
  subscribe(key, fn) { const a = local.subscribe(userKey(key), fn); const b = local.subscribe(key, fn); return () => { a(); b(); }; },
};

/** Guards against wrong-shaped saved data (e.g. an object where a list is expected). */
const shapeCheck = (init) => (Array.isArray(init) ? Array.isArray : init && typeof init === 'object' ? (v) => !!v && typeof v === 'object' && !Array.isArray(v) : undefined);

/** Shared, persisted, per-user state: `const [items, setItems] = useUserData('knoxia-notes', defaults)`. */
export function useUserData(key, initial) {
  useAuth(); // re-render when the signed-in user changes, so the right account's data is shown
  const init = useRef(initial); const check = useRef(shapeCheck(initial));
  const scoped = userKey(key);
  const subscribe = useCallback((fn) => userData.subscribe(key, fn), [key, scoped]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = useSyncExternalStore(subscribe, () => userData.get(key, init.current, check.current), () => init.current);
  const setValue = useCallback((v) => {
    const cur = userData.get(key, init.current, check.current);
    userData.set(key, typeof v === 'function' ? v(cur) : v);
  }, [key]);
  return [value, setValue];
}
