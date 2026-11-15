import React, { useCallback, useEffect, useState } from 'react';
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
const listeners = new Set();

const read = () => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; } };
const systemDark = () => !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
const resolve = (pref) => (pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref);

function apply(pref) {
  const theme = resolve(pref);
  const root = document.documentElement;
  root.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLORS[theme]);
  return theme;
}

function save(pref) {
  try { pref === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, pref); } catch { /* storage unavailable: keep in memory */ }
  apply(pref);
  listeners.forEach((fn) => fn(pref));
}

export function useTheme() {
  const [pref, setPref] = useState(read);
  const [theme, setTheme] = useState(() => resolve(read()));

  useEffect(() => {
    const sync = (p) => { setPref(p); setTheme(apply(p)); };
    listeners.add(sync);
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const onSystem = () => { if (read() === 'system') setTheme(apply('system')); };
    const onStorage = (e) => { if (e.key === KEY) sync(read()); };   // other tabs
    mq && mq.addEventListener('change', onSystem);
    window.addEventListener('storage', onStorage);
    setTheme(apply(read()));
    return () => { listeners.delete(sync); mq && mq.removeEventListener('change', onSystem); window.removeEventListener('storage', onStorage); };
  }, []);

  const setPreference = useCallback((p) => save(p), []);
  const toggle = useCallback(() => save(resolve(read()) === 'dark' ? 'light' : 'dark'), []);
  return { pref, theme, setPreference, toggle };
}

/** One-tap light/dark switch for headers. */
export function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button type="button" className={`icon-btn theme-toggle ${className}`} onClick={toggle} aria-pressed={dark} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? <Sun size={19} /> : <Moon size={19} />}
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
        <button key={id} type="button" role="radio" aria-checked={pref === id} className={pref === id ? 'chosen' : ''} onClick={() => setPreference(id)}>
          <Icon size={18} /><span>{label}</span>
        </button>
      ))}
    </div>
  );
}
