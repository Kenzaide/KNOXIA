/**
 * Gamification screens (Patches 23 and 24): the Achievements & Badges page with your level, XP and every badge with progress.
 * Rules are in xpCalc.js and achievementsCalc.js, hooks in gamificationStore.js.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Medal, Lock, Trophy, Zap, Sparkles } from 'lucide-react';
import { SectionTitle } from './ui.jsx';
import { fmtDate } from './materials.jsx';
import { BADGE_ICONS } from './badgeIcons.js';
import { XP_RULES, xpBreakdown } from './xpCalc.js';
import { byGroup } from './achievementsCalc.js';
import { useMyGamification } from './gamificationStore.js';

const Stat = ({ label, value, note, icon: I, tone = '' }) => <div className="stat-card"><div className={`stat-icon ${tone}`}><I size={18} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>;

function LevelCard({ g }) {
  const { level } = g; const rows = xpBreakdown(g.awards);
  return <div className="panel xp-card">
    <div className="xp-top"><div className="xp-level" aria-label={`Level ${level.level}`}>{level.level}</div>
      <div><b>Level {level.level} · {level.title}</b><small>{level.xp.toLocaleString()} XP in total</small></div></div>
    <div className="progress-track" role="progressbar" aria-label="Progress to the next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level.pct}><span style={{ width: `${level.pct}%` }} /></div>
    <small className="muted-sm">{level.toNext.toLocaleString()} XP to level {level.level + 1} ({level.into} of {level.needed})</small>
    <details className="xp-how"><summary>Where your XP comes from</summary>
      {rows.length === 0 ? <p className="muted-sm">Nothing yet. Take a quiz, study flashcards or complete a reviewer to earn XP.</p>
        : <ul>{rows.map((r) => <li key={r.kind}><span>{r.label}<small> × {r.count}</small></span><b>{r.xp.toLocaleString()} XP</b></li>)}</ul>}
      <p className="muted-sm">How XP is earned: {Object.values(XP_RULES).map((r) => `${r.label.toLowerCase()} (${r.hint})`).join('; ')}.</p>
    </details>
  </div>;
}

export function Achievements() {
  const g = useMyGamification(); const list = g.achievements; const got = list.filter((a) => a.earned).length;
  return <>
    <SectionTitle title="Achievements & Badges" subtitle="Collect badges as you build better learning habits." />
    <LevelCard g={g} />
    <div className="stats-grid compact">
      <Stat label="Earned" value={String(got)} note="Badges collected" icon={Medal} tone="orange" />
      <Stat label="Locked" value={String(list.length - got)} note="Still to unlock" icon={Lock} />
      <Stat label="Progress" value={Math.round((got / list.length) * 100) + '%'} note="Of all badges" icon={Trophy} tone="green" />
    </div>
    {byGroup(list).map(({ group, items }) => <section key={group} aria-label={group}>
      <h3 className="room-heading">{group}</h3>
      <div className="friend-grid">{items.map((a) => { const I = BADGE_ICONS[a.icon] || Medal; return <div className={`panel friend-card badge-card${a.earned ? '' : ' locked'}`} key={a.id}>
        <div className={`stat-icon ${a.earned ? 'orange' : ''}`} style={{ margin: '0 auto 10px' }}>{a.earned ? <I size={18} /> : <Lock size={18} />}</div>
        <h3>{a.name}</h3><p>{a.desc}</p>
        {a.earned ? <span className="friend-status">Earned{a.at ? ` · ${fmtDate(a.at)}` : ''}</span>
          : a.soon ? <span className="friend-status muted">Coming soon with Quiz Challenges</span>
          : <><div className="progress-track" role="progressbar" aria-label={`${a.name} progress`} aria-valuemin={0} aria-valuemax={a.target} aria-valuenow={a.current}><span style={{ width: `${a.pct}%` }} /></div><small className="muted-sm">{a.current} of {a.target}</small></>}
      </div>; })}</div>
    </section>)}
    <p className="muted-sm" style={{ marginTop: 16 }}><Sparkles size={13} /> Badges and XP are worked out from your real activity. See your <Link className="link-btn" to="/progress">study progress</Link> or climb the <Link className="link-btn" to="/leaderboards">leaderboard</Link>.</p>
  </>;
}
