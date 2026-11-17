import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Flame, Gift, Medal, Target, Trophy, Users, Zap } from 'lucide-react';
import { SectionTitle } from './ui.jsx';
import { toast } from './materials.jsx';
import { useProfile } from './accounts.js';
import { usePeople, useFriends } from './friendsStore.js';
import { useMyGamification } from './gamificationStore.js';
import { usePersonActivity } from './profileStore.js';
import { useUserData, local } from './storage.js';
import { KEYS } from './data.js';
import { KEY as PROGRESS_KEY } from './progressStore.js';
import { missionProgress, claimId, leaderboardStats, rankPeople } from './gamificationPhase5Calc.js';
import { dayKey, shiftDay } from './progressCalc.js';

const MISSION_KEY = 'knoxia-mission-claims';
const Stat = ({ icon: Icon, label, value, note, tone = '' }) => <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={18}/></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>;
const num = n => Number(n || 0).toLocaleString();
const list = x => Array.isArray(x) ? x : [];
const userRead = (key, email, fallback) => local.get(`${key}::${String(email).toLowerCase()}`, fallback);

// Browser-local demo: only accounts on this device have activity records. No invented competitor scores.
export function LeaderboardsV2() {
  const me = useProfile(); const game = useMyGamification(); const people = usePeople(); const friends = useFriends();
  const [period, setPeriod] = useState('week'); const [metric, setMetric] = useState('xp'); const [scope, setScope] = useState('everyone');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const keys = [KEYS.attempts, PROGRESS_KEY, MISSION_KEY];
    const unsub = people.filter(p => p.email && p.id !== me.id).flatMap(p => keys.map(k => local.subscribe(`${k}::${p.email.toLowerCase()}`, () => setVersion(v => v + 1))));
    return () => unsub.forEach(fn => fn());
  }, [people, me.id]);
  const rows = useMemo(() => {
    const ids = new Set(friends.friends.map(f => f.otherId));
    const candidates = people.filter(p => p.email && (scope === 'everyone' || ids.has(p.id) || p.id === me.id));
    if (me.email && !candidates.some(p => p.id === me.id)) candidates.push(me);
    return rankPeople(candidates.map(p => {
      const mine = p.id === me.id;
      const stats = mine ? { xp: game.xp, week: game.week, month: game.month, streak: game.streak.current } : leaderboardStats({
        attempts: userRead(KEYS.attempts, p.email, []), sessions: list(userRead(PROGRESS_KEY, p.email, {}).sessions), claims: userRead(MISSION_KEY, p.email, []),
      });
      const attempts = list(userRead(KEYS.attempts, p.email, []));
      const quizzes = attempts.filter(a => a && a.kind !== 'missed' && Number(a.n) > 0);
      const avg = quizzes.length ? Math.round(quizzes.reduce((s, a) => s + Math.max(0, Math.min(100, Number(a.score || 0) / Number(a.n) * 100)), 0) / quizzes.length) : null;
      return { id: p.id, name: p.displayName, initials: p.initials, avatar: p.avatar, me: mine, xp: stats[period === 'all' ? 'xp' : period], streak: stats.streak, quizzes: quizzes.length, avg };
    }), metric);
  }, [people, friends.friends, me, game, period, scope, metric, version]);
  const mine = rows.find(r => r.me); const higher = mine && rows[mine.rank - 2];
  return <><SectionTitle title="Leaderboards" subtitle="Real progress from accounts using this browser. Keep learning and climb the ranks." />
    <div className="gm-controls"><div className="segmented" aria-label="Leaderboard period">{[['week','This week'],['month','This month'],['all','All time']].map(([id,label]) => <button key={id} className={period===id?'selected':''} onClick={() => setPeriod(id)}>{label}</button>)}</div><div className="segmented" aria-label="Leaderboard audience">{[['everyone','Everyone'],['friends','Friends']].map(([id,label]) => <button key={id} className={scope===id?'selected':''} onClick={() => setScope(id)}>{label}</button>)}</div></div>
    <div className="gm-controls"><label className="field-label" htmlFor="gm-metric">Rank by</label><select id="gm-metric" className="field gm-select" value={metric} onChange={e => setMetric(e.target.value)}><option value="xp">XP</option><option value="quizzes">Quizzes completed</option><option value="avg">Quiz average (%)</option><option value="streak">Current streak</option></select></div>
    <div className="stats-grid compact"><Stat icon={Trophy} label="Your rank" value={mine ? `#${mine.rank}` : '—'} note={`of ${rows.length} students`} tone="orange"/><Stat icon={Zap} label="Your XP" value={num(game.xp)} note="All-time experience"/><Stat icon={Target} label="Next position" value={higher ? `${num(Math.max(0, (higher[metric] ?? 0) - (mine[metric] ?? 0)))} ${metric === 'xp' ? 'XP' : metric === 'avg' ? 'pts' : ''}` : 'Top rank'} note={higher ? `Behind ${higher.name}` : 'Keep it up'} tone="green"/></div>
    <div className="panel gm-board"><div className="gm-board-head"><span>Rank</span><span>Student</span><span>{metric === 'xp' ? 'XP' : metric === 'quizzes' ? 'Quizzes' : metric === 'avg' ? 'Average' : 'Streak'}</span></div>{rows.map(r => <div key={r.id} className={`gm-board-row${r.me?' gm-mine':''}`}><b>#{r.rank}</b><div className="gm-person"><span className="avatar sm">{r.avatar?<img src={r.avatar} alt=""/>:r.initials}</span><span><b>{r.name}{r.me?' (you)':''}</b><small>{r.streak} day streak · {r.quizzes} quizzes</small></span></div><strong>{metric==='avg'?(r.avg===null?'—':r.avg+'%'):metric==='xp'?num(r.xp):num(r[metric])}</strong></div>)}{!rows.length&&<p className="muted">No accounts available in this view.</p>}</div>
    <p className="muted-sm gm-note">Demo leaderboard: only registered accounts on this device are included. Friend-only results require an accepted friendship. Scores are not synchronized across devices.</p></>;
}

export function Missions() {
  const game = useMyGamification(); const [claims, setClaims] = useUserData(MISSION_KEY, []);
  const missions = missionProgress(game.awards); const saved = list(claims); const done = missions.filter(m => m.done).length;
  const claim = m => { if (!m.done || saved.some(c => c.id === claimId(m))) return; setClaims(old => [...list(old), { id: claimId(m), xp: m.reward, at: Date.now() }]); toast(`Mission complete! +${m.reward} XP`); };
  return <><SectionTitle title="Challenges & Missions" subtitle="Small daily and weekly goals that reward consistent learning." />
    <div className="stats-grid compact"><Stat icon={Target} label="Missions completed" value={`${done}/${missions.length}`} note="Current daily and weekly goals"/><Stat icon={Gift} label="Rewards ready" value={String(missions.filter(m=>m.done&&!saved.some(c=>c.id===claimId(m))).length)} note="Claim your bonus XP" tone="green"/><Stat icon={Zap} label="Total XP" value={num(game.xp)} note="Including claimed rewards" tone="orange"/></div>
    {['daily','weekly'].map(period => <section key={period}><h3 className="room-heading">{period === 'daily' ? 'Daily missions' : 'Weekly missions'}</h3><div className="gm-missions">{missions.filter(m=>m.period===period).map(m => { const claimed = saved.some(c=>c.id===claimId(m)); return <div key={m.id} className="panel gm-mission"><div className="gm-mission-icon"><Target size={20}/></div><div className="gm-mission-body"><b>{m.name}</b><p>{m.description}</p><div className="progress-track" role="progressbar" aria-label={`${m.name} progress`} aria-valuemin={0} aria-valuemax={m.target} aria-valuenow={Math.min(m.count,m.target)}><span style={{width:m.pct+'%'}}/></div><small>{Math.min(m.count,m.target)} of {m.target} · +{m.reward} XP</small></div><button className={`btn ${claimed?'outline':m.done?'primary':'soft'}`} disabled={!m.done||claimed} onClick={()=>claim(m)}>{claimed?'Claimed':m.done?'Claim reward':'In progress'}</button></div>; })}</div></section>)}
    <p className="muted-sm gm-note">Missions reset at local midnight (daily) and Monday (weekly). Rewards are saved to this browser's account data. <Link className="link-btn" to="/challenges">Try quiz battles</Link> for more practice.</p></>;
}

export function StreakPage() {
  const me = useProfile(); const data = usePersonActivity(me, true); const s = data.progress.streak;
  const today = dayKey(new Date()); const studied = new Set(data.progress.events.map(e=>dayKey(e.date)));
  const days = Array.from({length:28}, (_,i)=>shiftDay(today,i-27));
  return <><SectionTitle title="Study Streaks" subtitle="Make learning a habit, one day at a time." />
    <div className="stats-grid compact"><Stat icon={Flame} label="Current streak" value={`${s.current} days`} note="Active through today or yesterday" tone="orange"/><Stat icon={Trophy} label="Longest streak" value={`${s.best} days`} note="Your personal best"/><Stat icon={CalendarDays} label="Study days" value={String(s.days)} note="Days with recorded activity" tone="green"/></div>
    <div className="panel gm-calendar"><h3>Last 28 days</h3><p className="muted-sm">A highlighted day means you completed a quiz, flashcard session or reviewer.</p><div className="gm-day-grid">{days.map(d=><div key={d} className={`gm-day${studied.has(d)?' done':''}${d===today?' today':''}`} title={d} aria-label={`${d}: ${studied.has(d)?'studied':'no recorded study'}`}><span>{Number(d.slice(-2))}</span>{studied.has(d)?<CheckCircle2 size={13}/>:null}</div>)}</div></div>
    <div className="panel gm-streak-tip"><Flame size={21}/><div><b>{s.current ? 'Keep your momentum going!' : 'Start your streak today!'}</b><p>Complete a quiz, finish a flashcard session or mark a reviewer complete. Studying yesterday keeps your current streak alive until the end of today.</p><Link className="link-btn" to="/progress">View study progress</Link></div></div></>;
}
