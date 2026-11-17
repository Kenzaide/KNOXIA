import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Flame, Gift, Medal, Target, Trophy, Users, Zap } from 'lucide-react';
import { SectionTitle } from './ui.jsx';
import { toast } from './materials.jsx';
import { useProfile } from './accounts.js';
import { useAuth } from './session.js';
import { supabase } from './lib/supabase.js';
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

// Server-backed leaderboard. Never mix browser-local demo accounts with real users.
export function LeaderboardsV2() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState('xp');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    if (!user?.id || !supabase) {
      setRows([]); setLoading(false);
      setError('Sign in with Supabase to view the leaderboard.');
      return;
    }
    setLoading(true); setError('');
    supabase.rpc('knoxia_leaderboard').then(({ data, error: rpcError }) => {
      if (!active) return;
      if (rpcError) {
        setRows([]);
        setError('Unable to load real rankings. Apply the real_leaderboard SQL migration in Supabase and try again. ' + rpcError.message);
      } else {
        setRows((data || []).map(p => ({
          id: p.user_id, name: p.display_name || 'Student',
          xp: Number(p.quiz_xp || 0), quizzes: Number(p.quizzes_completed || 0),
          avg: p.quiz_average == null ? null : Number(p.quiz_average),
          me: p.user_id === user.id,
        })));
      }
      setLoading(false);
    }).catch(err => {
      if (active) { setRows([]); setError(err.message || 'Could not load leaderboard.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [user?.id, refresh]);

  const ranked = useMemo(() => rankPeople(rows, metric), [rows, metric]);
  const mine = ranked.find(p => p.me);
  const higher = mine && ranked[mine.rank - 2];
  return <>
    <SectionTitle title="Leaderboards" subtitle="Real KNOXIA accounts and quiz results from Supabase." />
    <div className="gm-controls">
      <label className="field-label" htmlFor="gm-metric">Rank by</label>
      <select id="gm-metric" className="field gm-select" value={metric} onChange={e => setMetric(e.target.value)}>
        <option value="xp">Quiz XP</option>
        <option value="quizzes">Quizzes completed</option>
        <option value="avg">Quiz average (%)</option>
      </select>
      <button type="button" className="btn outline" onClick={() => setRefresh(n => n + 1)}>Refresh</button>
    </div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {loading ? <p className="muted">Loading real rankings…</p> : !error && <>
      <div className="stats-grid compact">
        <Stat icon={Trophy} label="Your rank" value={mine ? `#${mine.rank}` : '—'} note={`of ${ranked.length} students`} tone="orange"/>
        <Stat icon={Zap} label="Your quiz XP" value={num(mine?.xp)} note="From saved Supabase quiz attempts"/>
        <Stat icon={Target} label="Next position" value={higher ? `${num(Math.max(0, (higher[metric] ?? 0) - (mine[metric] ?? 0)))} ${metric === 'xp' ? 'XP' : metric === 'avg' ? 'pts' : ''}` : 'Top rank'} note={higher ? `Behind ${higher.name}` : 'Keep learning'} tone="green"/>
      </div>
      <div className="panel gm-board">
        <div className="gm-board-head"><span>Rank</span><span>Student</span><span>{metric === 'xp' ? 'Quiz XP' : metric === 'quizzes' ? 'Quizzes' : 'Average'}</span></div>
        {ranked.map(p => <div key={p.id} className={`gm-board-row${p.me ? ' gm-mine' : ''}`}>
          <b>#{p.rank}</b>
          <div className="gm-person"><span className="avatar sm">{p.name.slice(0, 2).toUpperCase()}</span><span><b>{p.name}{p.me ? ' (you)' : ''}</b><small>{p.quizzes} completed quizzes</small></span></div>
          <strong>{metric === 'avg' ? (p.avg == null ? '—' : p.avg + '%') : num(p[metric])}</strong>
        </div>)}
        {!ranked.length && <p className="muted">No registered users yet.</p>}
      </div>
      <p className="muted-sm gm-note">Only Supabase users appear. Quiz XP = 10 points per completed quiz + 1 per correct answer. Browser-only activities and scores are not included until they are synchronized.</p>
    </>}
  </>;
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
