import React, { useEffect, useRef, useState } from 'react';

export const POSES = ['default', 'happy', 'think', 'study', 'sleepy'];

/**
 * Knowl, the KNOXIA owl.
 * - All poses are stacked and preloaded; changing `pose` crossfades between them.
 * - Idle: floats gently (sleepy pose breathes instead).
 * - Pointer: tilts slightly toward the cursor (skipped for touch and reduced-motion).
 * - Click: hops, then calls onClick.
 */
export function Knowl({ pose = 'default', onClick, label = 'Knowl the owl', className = '' }) {
  const root = useRef(null);
  const [hop, setHop] = useState(0);

  useEffect(() => {
    const el = root.current;
    if (!el || !window.matchMedia) return;
    const ok = window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches;
    if (!ok) return;
    let raf = 0;
    const move = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
        const dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
        const c = (n) => Math.max(-1, Math.min(1, n * 2.2));
        el.style.setProperty('--tilt-x', `${(c(dx) * 7).toFixed(1)}px`);
        el.style.setProperty('--tilt-y', `${(c(dy) * 4).toFixed(1)}px`);
        el.style.setProperty('--tilt-r', `${(c(dx) * 3).toFixed(1)}deg`);
      });
    };
    window.addEventListener('pointermove', move);
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);

  const press = () => { setHop((h) => h + 1); onClick && onClick(); };

  return (
    <button type="button" ref={root} className={`knowl ${pose === 'sleepy' ? 'is-sleepy' : ''} ${className}`} aria-label={label} onClick={press}>
      <span className="knowl-shadow" aria-hidden="true" />
      <span className="knowl-tilt">
        <span className="knowl-float">
          <span className={hop ? 'knowl-hop' : ''} key={hop}>
            <span className="knowl-stack">
              {POSES.map((p) => (
                <img key={p} src={`/knowl/${p}.webp`} alt="" width="640" height="620" draggable="false" className={p === pose ? 'on' : ''} />
              ))}
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}

/** Small round Knowl face for chat headers and message bubbles. */
export function KnowlAvatar({ pose = 'default', size = 36, className = '' }) {
  return (
    <span className={`knowl-avatar ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <img src={`/knowl/${pose}.webp`} alt="" draggable="false" />
    </span>
  );
}
