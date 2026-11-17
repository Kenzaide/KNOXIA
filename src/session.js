/** Supabase is the sole source of truth for KNOXIA authentication. */
import { useSyncExternalStore } from 'react';
import { supabase } from './lib/supabase.js';

export const REMEMBER_DAYS = 30;
const PUBLIC = new Set(['/', '/terms', '/privacy', '/reset-password', '/verify-email']);
const GUEST = new Set(['/login', '/register', '/forgot-password']);
export const normalizePath = p => p.replace(/\/+$/, '') || '/';
export function accessFor(pathname) {
  const p = normalizePath(pathname);
  return GUEST.has(p) ? 'guest' : PUBLIC.has(p) ? 'public' : 'private';
}
export function safeRedirect(from, fallback = '/dashboard') {
  if (!from || typeof from.pathname !== 'string') return fallback;
  const { pathname } = from;
  if (!pathname.startsWith('/') || pathname.startsWith('//') || accessFor(pathname) !== 'private') return fallback;
  const search = typeof from.search === 'string' && from.search.startsWith('?') ? from.search : '';
  const hash = typeof from.hash === 'string' && from.hash.startsWith('#') ? from.hash : '';
  return pathname + search + hash;
}

// Never trust old localStorage/sessionStorage login flags.
for (const key of ['knoxia-session', 'knoxia-remember']) {
  try { window.localStorage.removeItem(key); window.sessionStorage.removeItem(key); } catch { /* storage blocked */ }
}
const listeners = new Set();
let current = null;
let ready = !supabase;
const notify = () => listeners.forEach(fn => fn());
const userFrom = session => session?.user ? {
  email: session.user.email || '',
  name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '',
  id: session.user.id
} : null;
function applySession(session) {
  const user = userFrom(session);
  const next = user ? { user } : null;
  if (JSON.stringify(current) !== JSON.stringify(next) || !ready) {
    current = next;
    ready = true;
    notify();
  }
}
if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => applySession(session));
  // Restore an existing verified Supabase session after refresh.
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) console.error('KNOXIA authentication:', error.message);
    applySession(error ? null : data.session);
  }).catch(err => {
    console.error('KNOXIA authentication:', err);
    applySession(null);
  });
}
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const getSnapshot = () => current;
const getReady = () => ready;
export const getSession = () => current;
export async function login({ email, password }) {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!email || !password) throw new Error('Enter your email and password.');
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  if (!data.session) throw new Error('Please verify your email before signing in.');
  applySession(data.session);
  return data.session;
}
export async function logout() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
  applySession(null);
}
export function useAuth() {
  const session = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const authReady = useSyncExternalStore(subscribe, getReady, () => false);
  return { session, user: session?.user || null, isAuthenticated: !!session, ready: authReady, login, logout };
}
