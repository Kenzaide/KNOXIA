/**
 * Registered accounts and profile data (patches 2 + 3).
 *
 * FRONTEND-ONLY DEMO: accounts live in this browser's localStorage so a registration survives refreshes,
 * logging out and closing the browser. It is NOT a user database and NOT security: anyone with access to
 * this browser can read or edit it. Passwords are stored only as a salted hash (PBKDF2 where the browser
 * allows it), never in plain text, but a real backend must replace all of this.
 *
 * The session (src/session.js) only remembers *who* is signed in (their email). Everything else about the
 * person (name, username, avatar, academic details...) is read from here through useProfile(), so a profile
 * edit shows up everywhere at once: sidebar, top bar, dashboard greeting, leaderboards, rooms, profile page.
 *
 * Swapping in a backend later: keep these function names and make them call your API instead.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { useAuth } from './session.js';

const KEY = 'knoxia-accounts';

/** While there is no backend, an email nobody registered still signs in (as a "demo" account). Set false to require registration. */
export const ALLOW_DEMO_LOGIN = true;

export const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;
export const USERNAME_HELP = 'Username must be 3–20 characters: letters, numbers, dots or underscores.';
export const BIO_MAX = 160;

/* ---------- Storage + tiny external store (same pattern as session.js) ---------- */
const area = () => { try { return window.localStorage || null; } catch { return null; } };
const isAccount = (a) => !!a && typeof a === 'object' && typeof a.id === 'string' && typeof a.email === 'string' && typeof a.username === 'string';

let memory = null; // only used when storage is unavailable or full
function load() {
  try {
    const raw = area()?.getItem(KEY);
    if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) return a.filter(isAccount); }
  } catch { /* corrupt or blocked: fall through */ }
  return memory || [];
}

let accounts = load();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
function refresh() { const next = load(); if (JSON.stringify(next) !== JSON.stringify(accounts)) { accounts = next; emit(); } }
function commit(next) {
  accounts = next; memory = null;
  try { const st = area(); if (!st) throw new Error('no storage'); st.setItem(KEY, JSON.stringify(next)); } catch { memory = next; }
  emit();
}
const onStorage = (e) => { if (e.key === null || e.key === KEY) refresh(); }; // another tab registered or edited a profile
function subscribe(fn) {
  listeners.add(fn);
  if (listeners.size === 1) { window.addEventListener('storage', onStorage); refresh(); }
  return () => { listeners.delete(fn); if (!listeners.size) window.removeEventListener('storage', onStorage); };
}

/* ---------- Lookups ---------- */
export const emailKey = (e) => String(e || '').trim().toLowerCase();
const nameKey = (u) => String(u || '').trim().toLowerCase();
export const getAccounts = () => accounts;
export const findByEmail = (email) => accounts.find((a) => a.email === emailKey(email)) || null;
export const findByUsername = (username, exceptId) => accounts.find((a) => nameKey(a.username) === nameKey(username) && a.id !== exceptId) || null;

/* ---------- Password hashing (demo-grade) ---------- */
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
function randomSalt() {
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch { for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); }
  return hex(b);
}
// Non-cryptographic fallback for insecure (plain http) pages where crypto.subtle does not exist.
function weakHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
async function digest(pw, salt, alg) {
  if (alg === 'weak') return weakHash(salt + pw);
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (alg !== 'pbkdf2' || !subtle) return null;
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256));
}
async function makePw(pw) {
  const salt = randomSalt(); const alg = globalThis.crypto && globalThis.crypto.subtle ? 'pbkdf2' : 'weak';
  return { alg, salt, hash: await digest(pw, salt, alg) };
}
async function verifyPw(pw, rec) {
  if (!rec || !rec.hash) return false;
  try { const h = await digest(pw, rec.salt, rec.alg); return h !== null && h === rec.hash; } catch { return false; }
}

/* ---------- Helpers for building names ---------- */
const newId = () => `acc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
function namesFromEmail(email) {
  const local = emailKey(email).split('@')[0] || '';
  const parts = local.split(/[._\-+]+/).map((w) => w.replace(/\d+/g, '')).filter(Boolean);
  return { first: cap(parts[0] || 'Student'), last: parts.slice(1).map(cap).join(' ') };
}
function freeUsername(base, exceptId) {
  let b = String(base || '').replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 16) || 'student';
  if (b.length < 3) b = b.padEnd(3, '0');
  let u = b, i = 1;
  while (findByUsername(u, exceptId)) u = b + (++i);
  return u;
}
const blank = { first: '', middle: '', last: '', suffix: '', bio: '', avatar: '', sid: '', school: '', college: '', course: '', year: '', section: '' };

/* ---------- Public API ---------- */
/**
 * Creates a registered (but not yet email-verified) account. Resolves {ok, account} or {error}.
 * An email that was only half-registered (never verified) or only used in demo mode can be registered again.
 */
export async function registerAccount(d) {
  const email = emailKey(d.email); const username = String(d.username || '').trim();
  if (!USERNAME_RE.test(username)) return { error: USERNAME_HELP };
  const same = findByEmail(email);
  if (same && same.verified && !same.demo) return { error: 'An account with this email already exists. Try logging in instead.' };
  if (findByUsername(username, same && same.id)) return { error: 'That username is already taken. Please choose another one.' };
  const t = (k) => String(d[k] || '').trim(); const now = Date.now();
  const account = {
    ...blank, id: same ? same.id : newId(), email, username,
    first: t('first'), middle: t('middle'), last: t('last'), suffix: t('suffix'), avatar: d.avatar || '',
    sid: t('sid'), school: t('school'), college: t('college'), course: t('course'), year: t('year'), section: t('section'),
    verified: false, demo: false, createdAt: now, updatedAt: now, pw: await makePw(String(d.pw || '')),
  };
  commit([...accounts.filter((a) => a.id !== account.id), account]);
  return { ok: true, account };
}

export function verifyAccount(email) {
  const a = findByEmail(email); if (!a) return false;
  commit(accounts.map((x) => (x.id === a.id ? { ...x, verified: true, updatedAt: Date.now() } : x)));
  return true;
}

/** Creates a passwordless "demo" account (unregistered email in demo mode, or a session from before accounts existed). */
function createDemoAccount(email) {
  const e = emailKey(email); const n = namesFromEmail(e); const now = Date.now();
  const account = { ...blank, id: newId(), email: e, username: freeUsername(e.split('@')[0]), first: n.first, last: n.last, verified: true, demo: true, createdAt: now, updatedAt: now, pw: null };
  commit([...accounts, account]);
  return account;
}

/** The account for this email, created as a demo account if a session from before accounts existed has none yet. Call from an effect, not while rendering. */
export function ensureAccount(email) { return findByEmail(email) || createDemoAccount(email); }

/** Checks a login. Resolves {ok, account} or {reason: 'invalid' | 'unverified', account?}. */
export async function authenticate(email, pw) {
  const acc = findByEmail(email);
  if (!acc) return ALLOW_DEMO_LOGIN ? { ok: true, account: createDemoAccount(email) } : { reason: 'invalid' };
  if (acc.demo) return { ok: true, account: acc };
  if (!(await verifyPw(pw, acc.pw))) return { reason: 'invalid' };
  if (!acc.verified) return { reason: 'unverified', account: acc };
  return { ok: true, account: acc };
}

const EDITABLE = ['first', 'middle', 'last', 'suffix', 'username', 'bio', 'avatar', 'sid', 'school', 'college', 'course', 'year', 'section'];

/** Returns an error message for an invalid set of profile fields, or '' when fine. */
export function profileError(v, exceptId) {
  if (!String(v.first || '').trim()) return 'Please enter your first name.';
  if (!String(v.last || '').trim()) return 'Please enter your last name.';
  if (!USERNAME_RE.test(String(v.username || '').trim())) return USERNAME_HELP;
  if (findByUsername(v.username, exceptId)) return 'That username is already taken. Please choose another one.';
  if (String(v.bio || '').length > BIO_MAX) return `Your bio can be up to ${BIO_MAX} characters.`;
  if (v.year && !YEARS.includes(v.year)) return 'Please choose a valid year level.';
  return '';
}

/** Saves profile edits for the signed-in person. Resolves {ok, account} or {error}. The email is never changed here. */
export function updateProfile(email, patch) {
  const acc = findByEmail(email) || createDemoAccount(email); // sessions from before accounts existed get a record on first save
  const next = { ...acc };
  EDITABLE.forEach((k) => { if (k in patch) next[k] = typeof patch[k] === 'string' && k !== 'avatar' ? patch[k].trim() : patch[k]; });
  const error = profileError(next, acc.id);
  if (error) return { error };
  next.updatedAt = Date.now();
  commit(accounts.map((x) => (x.id === acc.id ? next : x)));
  return { ok: true, account: next };
}

/* ---------- Profile view-model ---------- */
const join = (...p) => p.filter(Boolean).join(' ');
/** Turns a stored account (or null) into everything the UI needs. Never throws and always returns usable names. */
export function buildProfile(acc, email = '') {
  const n = namesFromEmail(email);
  const a = acc || { ...blank, id: '', email: emailKey(email), username: emailKey(email).split('@')[0].replace(/[^a-z0-9_.]/g, '') || 'student', first: n.first, last: n.last, verified: false, demo: true, createdAt: 0, updatedAt: 0 };
  const initials = ((a.first[0] || '') + (a.last[0] || a.first[1] || '')).toUpperCase() || '?';
  return {
    ...a, exists: !!acc,
    firstName: a.first || 'there', displayName: join(a.first, a.last, a.suffix) || a.username, fullName: join(a.first, a.middle, a.last, a.suffix) || a.username,
    initials, academic: [a.year, a.course].filter(Boolean).join(' • '),
  };
}
export const profileByUsername = (username) => { const a = findByUsername(username); return a ? buildProfile(a, a.email) : null; };

/** The signed-in person's profile. Re-renders whenever it changes (this tab or another). */
export function useProfile() {
  const { user } = useAuth();
  const list = useSyncExternalStore(subscribe, () => accounts, () => []);
  const email = user ? emailKey(user.email) : '';
  return useMemo(() => buildProfile(list.find((a) => a.email === email) || null, email), [list, email]);
}

/** Registered accounts, for admin views. */
export function useAccounts() { return useSyncExternalStore(subscribe, () => accounts, () => []); }
