import React, { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Moon, Sun, Monitor } from 'lucide-react';

/**
 * Theme handling.
 * - Preference is 'system' | 'light' | 'dark', saved in localStorage ('knoxia-theme').
 * - 'system' follows the OS setting and updates live when it changes.
 * - The resolved theme is written to <html data-theme="..."> (CSS reads it)
 *   and to <meta name="theme-color"> so the mobile browser bar matches.
 * - index.html runs the same logic before first paint to avoid a light flash.
 */
const KEY = 'knoxia-theme';
const COLORS = { light: '#EEF4FF', dark: '#0A1120' };
import { local } from './storage.js';
const listeners = new Set();

const read = () => { const v = local.getRaw(KEY); return v === 'light' || v === 'dark' ? v : 'system'; };
const systemDark = () => !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
const resolve = (pref) => (pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref);

function apply(pref) {
  const theme = resolve(pref);
  const root = document.documentElement;
  const changed = !!root.dataset.theme && root.dataset.theme !== theme;
  if (changed) { // fade colours smoothly while the theme flips
    root.classList.add('theme-fade');
    clearTimeout(window.__knoxiaThemeFade);
    window.__knoxiaThemeFade = setTimeout(() => root.classList.remove('theme-fade'), 420);
  }
  root.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLORS[theme]);
  return theme;
}

const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Centre of the clicked element, used as the origin of the circular reveal. */
const originOf = (e) => {
  const el = e && e.currentTarget;
  if (!el || !el.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/**
 * Run a theme change with a transition.
 * - With an origin + View Transitions API: circular reveal growing from the clicked control.
 * - Otherwise: a short colour cross-fade on every element (class "theme-fade" in index.css).
 * - Reduced motion: switch instantly.
 */
function withTransition(run, origin) {
  const root = document.documentElement;
  if (reducedMotion()) return run();

  if (origin && typeof document.startViewTransition === 'function') {
    const { x, y } = origin;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.classList.add('theme-vt');
    const vt = document.startViewTransition(() => { flushSync(run); });
    vt.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 600, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
    vt.finished.finally(() => root.classList.remove('theme-vt'));
    return;
  }

  root.classList.add('theme-fade');
  run();
  clearTimeout(withTransition.t);
  withTransition.t = setTimeout(() => root.classList.remove('theme-fade'), 500);
}

function save(pref, origin) {
  withTransition(() => {
    if (pref === 'system') local.removeRaw(KEY); else local.setRaw(KEY, pref);
    apply(pref);
    listeners.forEach((fn) => fn(pref));
  }, origin);
}

export function useTheme() {
  const [pref, setPref] = useState(read);
  const [theme, setTheme] = useState(() => resolve(read()));

  useEffect(() => {
    const sync = (p) => { setPref(p); setTheme(apply(p)); };
    listeners.add(sync);
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const onSystem = () => { if (read() === 'system') withTransition(() => setTheme(apply('system'))); };
    const onStorage = (e) => { if (e.key === KEY) sync(read()); };   // other tabs
    mq && mq.addEventListener('change', onSystem);
    window.addEventListener('storage', onStorage);
    setTheme(apply(read()));
    return () => { listeners.delete(sync); mq && mq.removeEventListener('change', onSystem); window.removeEventListener('storage', onStorage); };
  }, []);

  const setPreference = useCallback((p, e) => save(p, originOf(e)), []);
  const toggle = useCallback((e) => save(resolve(read()) === 'dark' ? 'light' : 'dark', originOf(e)), []);
  return { pref, theme, setPreference, toggle };
}

/** One-tap light/dark switch for headers. */
export function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button type="button" className={`icon-btn theme-toggle ${className}`} onClick={(e) => toggle(e)} aria-pressed={dark} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      <span key={theme} className="theme-icon">{dark ? <Sun size={19} /> : <Moon size={19} />}</span>
    </button>
  );
}

/** System / Light / Dark chooser for Settings. */
export function ThemePicker() {
  const { pref, setPreference } = useTheme();
  const opts = [['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]];
  return (
    <div className="theme-picker" role="radiogroup" aria-label="Appearance">
      {opts.map(([id, label, Icon]) => (
        <button key={id} type="button" role="radio" aria-checked={pref === id} className={pref === id ? 'chosen' : ''} onClick={(e) => setPreference(id, e)}>
          <Icon size={18} /><span>{label}</span>
        </button>
      ))}
    </div>
  );
}
