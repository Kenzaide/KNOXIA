import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Clock3, Pause, Play, Square } from 'lucide-react';
import { track } from './progressStore.js';

const FocusContext = createContext(null);
export const useGlobalFocus = () => useContext(FocusContext);

export function GlobalFocusProvider({ children }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState(0);
  const runningRef = useRef(false);
  const lastTick = useRef(null);
  const unsaved = useRef(0);
  const [active, setActive] = useState(false);

  const flush = () => {
    if (unsaved.current > 0) {
      track.focus(unsaved.current);
      unsaved.current = 0;
      setPending(0);
    }
  };
  const tick = () => {
    if (!runningRef.current || lastTick.current === null) return;
    const now = Date.now();
    const delta = Math.max(0, Math.floor((now - lastTick.current) / 1000));
    if (!delta) return;
    lastTick.current += delta * 1000;
    unsaved.current += delta;
    setPending(unsaved.current);
    setElapsed(v => v + delta);
  };
  const pause = () => {
    tick();
    runningRef.current = false;
    lastTick.current = null;
    setRunning(false);
    flush();
  };
  const start = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastTick.current = Date.now();
    setRunning(true);
    setActive(true);
  };
  const finish = () => {
    pause();
    setActive(false);
    setElapsed(0);
  };
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') tick();
    }, 1000);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && runningRef.current) pause();
    };
    const onPageHide = () => {
      if (runningRef.current) tick();
      flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      if (runningRef.current) tick();
      flush();
    };
  }, []);
  const value = { running, active, elapsed, pending, start, pause, finish };
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  return <FocusContext.Provider value={value}>
    {children}
    {active && <aside className="kn-global-focus" role="status" aria-label="Study focus timer">
      <Clock3 size={17}/><strong>Focus {clock}</strong>
      <button type="button" onClick={running ? pause : start} aria-label={running ? 'Pause focus timer' : 'Resume focus timer'}>{running ? <Pause size={16}/> : <Play size={16}/>}</button>
      <button type="button" onClick={finish} aria-label="Finish and save focus session"><Square size={15}/><span>Finish</span></button>
    </aside>}
  </FocusContext.Provider>;
}
