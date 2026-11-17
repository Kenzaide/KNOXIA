/**
 * Demo authentication session.
 *
 * FRONTEND-ONLY DEMO: this only gates the UI. Anything stored in the browser can
 * be edited by the user, so it is NOT security. Replace with real sessions
 * (e.g. httpOnly cookies issued by a backend) before production.
 *
 * Remember me:
 *  - checked   -> saved in localStorage, survives closing the browser, expires after 30 days
 *  - unchecked -> saved in sessionStorage, ends when the tab/browser session ends
 * If the browser blocks storage entirely, the session is kept in memory for the page's lifetime.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'knoxia-session';
const LEGACY_KEYS = ['knoxia-remember'];                                       // old cosmetic flag, never a session
const SIGNUP_KEYS = ['knoxia-pending-email', 'knoxia-name', 'knoxia-email', 'knoxia-reg-draft']; // sessionStorage leftovers from sign-up
export const REMEMBER_DAYS = 30;
const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;
const MAX_TIMEOUT = 2 ** 31 - 1; // setTimeout overflows (fires immediately) above this

/* ---------- Route access ---------- */
// Anything not listed here is private and needs a session.
const PUBLIC = new Set(['/', '/terms', '/privacy', '/reset-password', '/verify-email']);
const GUEST = new Set(['/login', '/register', '/forgot-password']); // signed-in users are sent on to the app

export const normalizePath = (p) => p.replace(/\/+$/, '') || '/';
export function accessFor(pathname) {
  const p = normalizePath(pathname);
  return GUEST.has(p) ? 'guest' : PUBLIC.has(p) ? 'public' : 'private';
}

/** Where to go after signing in: the page the visitor originally wanted, if it is a safe in-app path. */
export function safeRedirect(from, fallback = '/dashboard') {
  if (!from || typeof from.pathname !== 'string') return fallback;
  const { pathname } = from;
  if (!pathname.startsWith('/') || pathname.startsWith('//') || accessFor(pathname) !== 'private') return fallback;
  const search = typeof from.search === 'string' && from.search.startsWith('?') ? from.search : '';
  const hash = typeof from.hash === 'string' && from.hash.startsWith('#') ? from.hash : '';
  return pathname + search + hash;
}

/* ---------- Storage helpers (every access can throw in private mode / when blocked) ---------- */
const area = (name) => { try { return window[name] || null; } catch { return null; } };
const read = (st) => { try { return st ? st.getItem(KEY) : null; } catch { return null; } };
const drop = (st, key = KEY) => { try { if (st) st.removeItem(key); } catch { /* ignore */ } };

const isValid = (s) => !!s && typeof s === 'object' && typeof s.remember === 'boolean' && Number.isFinite(s.createdAt)
  && (s.expiresAt === null || Number.isFinite(s.expiresAt)) && !!s.user && typeof s.user === 'object' && typeof s.user.email === 'string';
const parse = (raw) => { try { const s = JSON.parse(raw); return isValid(s) ? s : null; } catch { return null; } };
const expired = (s, now) => s.expiresAt !== null && s.expiresAt <= now;

let memory = null; // only used when storage is unavailable

/** Reads the stored session, discarding anything corrupt or expired. */
function load(now = Date.now()) {
  for (const st of [area('sessionStorage'), area('localStorage')]) {
    const raw = read(st);
    if (!raw) continue;
    const s = parse(raw);
    if (!s || expired(s, now)) { drop(st); continue; }
    return s;
  }
  if (memory && !expired(memory, now)) return memory;
  memory = null;
  return null;
}

/* ---------- Tiny external store so every component sees the same session ---------- */
let current = load();
const listeners = new Set();
let timer = null;

function schedule() {
  clearTimeout(timer);
  if (current && current.expiresAt !== null) {
    timer = setTimeout(sync, Math.min(Math.max(current.expiresAt - Date.now(), 0) + 50, MAX_TIMEOUT));
  }
}
function sync() {
  const next = load();
  const changed = JSON.stringify(next) !== JSON.stringify(current);
  if (changed) current = next;
  schedule();
  if (changed) listeners.forEach((fn) => fn());
}
const onStorage = (e) => { if (e.key === null || e.key === KEY) sync(); };             // another tab signed in/out
const onVisible = () => { if (document.visibilityState === 'visible') sync(); };        // catches expiry after sleep
function subscribe(fn) {
  listeners.add(fn);
  if (listeners.size === 1) { window.addEventListener('storage', onStorage); document.addEventListener('visibilitychange', onVisible); sync(); }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) { window.removeEventListener('storage', onStorage); document.removeEventListener('visibilitychange', onVisible); clearTimeout(timer); }
  };
}

/* ---------- Public API ---------- */
export function login({ email, name = '', remember = false } = {}) {
  const now = Date.now();
  const session = {
    user: { email: String(email || '').trim().toLowerCase(), name: String(name || '') },
    remember: !!remember, createdAt: now, expiresAt: remember ? now + REMEMBER_MS : null,
  };
  const keep = area(remember ? 'localStorage' : 'sessionStorage');
  drop(area(remember ? 'sessionStorage' : 'localStorage')); // never leave a second copy behind
  memory = null;
  try { if (!keep) throw new Error('no storage'); keep.setItem(KEY, JSON.stringify(session)); } catch { memory = session; }
  LEGACY_KEYS.forEach((k) => drop(area('localStorage'), k));
  sync();
  return session;
}

/** Ends the session everywhere it is stored and forgets sign-up leftovers. */
export function logout() {
  drop(area('sessionStorage')); drop(area('localStorage'));
  memory = null;
  SIGNUP_KEYS.forEach((k) => drop(area('sessionStorage'), k));
  LEGACY_KEYS.forEach((k) => drop(area('localStorage'), k));
  sync();
}

export const getSession = () => current;

export function useAuth() {
  const session = useSyncExternalStore(subscribe, () => current, () => null);
  return {
    session,
    user: session ? session.user : null,
    isAuthenticated: !!session,
    login,
    logout
  };
}
