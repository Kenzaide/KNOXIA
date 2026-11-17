/** Phase 6: browser-local productivity screens. Reuses the existing KNOXIA design tokens and stores. */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Edit3, Plus, Trash2, Target, Sparkles, BookOpen, X, ListTodo, Settings2 } from 'lucide-react';
import { usePlan, useNotes, useSettings } from './data.js';
import { useProfile } from './accounts.js';
import { ProfileEditor } from './profile.jsx';
import { ThemePicker } from './theme.jsx';
import { useStudyProgress } from './progressStore.js';
import { useMyGamification } from './gamificationStore.js';
import { fmtTime, dayKey } from './progressCalc.js';
import { toast } from './materials.jsx';
import { useUserData } from './storage.js';

const today = () => dayKey(new Date());
const validDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(new Date(`${v}T12:00:00`).getTime());
const dateLabel = v => validDay(v) ? new Date(`${v}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'No date';
const cleanTasks = v => (Array.isArray(v) ? v : []).filter(x => x && typeof x.id === 'string').map(x => ({ ...x, title: String(x.title || '').slice(0,120), date: validDay(x.date) ? x.date : today(), done: !!x.done, kind: x.kind === 'deadline' ? 'deadline' : 'study', notes: String(x.notes || '').slice(0,500) }));
const button = (label, fn, Icon = Plus, variant = 'primary') => <button type="button" className={`btn ${variant}`} onClick={fn}><Icon size={16}/>{label}</button>;
const Section = ({title,subtitle,action}) => <div className="section-title"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>;
const IconStat = ({icon:Icon,label,value,note,tone=''}) => <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={18}/></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>;
const sorted = tasks => [...tasks].sort((a,b) => a.date.localeCompare(b.date) || Number(a.done)-Number(b.done));

export function Planner() {
  const [raw,setRaw] = usePlan(); const tasks = useMemo(()=>cleanTasks(raw),[raw]);
  const [editing,setEditing] = useState(null); const [form,setForm] = useState({title:'',date:today(),kind:'study',notes:''});
  const [filter,setFilter] = useState('Upcoming');
  const reset = () => {setEditing(null);setForm({title:'',date:today(),kind:'study',notes:''});};
  const save = e => {e.preventDefault();const title=form.title.trim();if(!title){toast('Add a task title first');return;}if(!validDay(form.date)){toast('Choose a valid date');return;}
    if(editing) setRaw(a=>a.map(x=>x.id===editing?{...x,...form,title}:x));
    else setRaw(a=>[{id:`task-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,...form,title,done:false},...a]);
    toast(editing?'Task updated':'Task added');reset();};
  const change = (id,patch) => setRaw(a=>a.map(x=>x.id===id?{...x,...patch}:x));
  const visible = sorted(tasks).filter(x=>filter==='All'||(filter==='Completed'?x.done:filter==='Upcoming'?!x.done:x.kind==='deadline'));
  const due = tasks.filter(x=>!x.done && x.date<today()).length;
  return <><Section title="Study Planner" subtitle="Organize study sessions and deadlines in one place." action={<Link className="btn outline" to="/study-calendar"><CalendarDays size={16}/>Calendar view</Link>}/>
    <div className="stats-grid compact"><IconStat icon={ListTodo} label="Total tasks" value={tasks.length} note="All scheduled"/><IconStat icon={CheckCircle2} label="Completed" value={tasks.filter(x=>x.done).length} note="Tasks finished" tone="green"/><IconStat icon={Clock3} label="Overdue" value={due} note="Unfinished deadlines" tone="orange"/></div>
    <div className="panel" style={{marginBottom:16}}><h3>{editing?'Edit task':'Add a study task'}</h3><form onSubmit={save} className="phase6-form">
      <label className="field-label">Task title<input className="field" value={form.title} maxLength={120} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Review machine learning" required/></label>
      <div className="phase6-fields"><label className="field-label">Scheduled date<input className="field" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} required/></label><label className="field-label">Type<select className="field" value={form.kind} onChange={e=>setForm(f=>({...f,kind:e.target.value}))}><option value="study">Study session</option><option value="deadline">Deadline</option></select></label></div>
      <label className="field-label">Notes (optional)<textarea className="field textarea" style={{minHeight:70}} maxLength={500} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="What needs to get done?"/></label>
      <div className="phase6-actions"><button className="btn primary" type="submit"><Check size={16}/>{editing?'Save changes':'Add task'}</button>{editing&&button('Cancel',reset,X,'outline')}</div>
    </form></div>
    <div className="panel"><div className="phase6-toolbar"><h3>My tasks</h3><div className="segmented" role="group" aria-label="Task filter">{['Upcoming','Deadlines','Completed','All'].map(t=><button key={t} className={filter===t?'selected':''} onClick={()=>setFilter(t)}>{t}</button>)}</div></div>
      {!visible.length&&<p className="muted">No tasks here yet. Add a study task above to get started.</p>}
      {visible.map(x=><div className="phase6-task" key={x.id}><input type="checkbox" aria-label={`Complete ${x.title}`} checked={x.done} onChange={()=>change(x.id,{done:!x.done})}/><div className="phase6-task-main"><b style={x.done?{textDecoration:'line-through',opacity:.65}:undefined}>{x.title}</b><small>{dateLabel(x.date)} · {x.kind==='deadline'?'Deadline':'Study session'}{!x.done&&x.date<today()?' · Overdue':''}</small>{x.notes&&<small>{x.notes}</small>}</div><button className="plain-icon" title="Edit task" aria-label={`Edit ${x.title}`} onClick={()=>{setEditing(x.id);setForm({title:x.title,date:x.date,kind:x.kind,notes:x.notes});window.scrollTo({top:0,behavior:'smooth'});}}><Edit3 size={17}/></button><button className="plain-icon" title="Delete task" aria-label={`Delete ${x.title}`} onClick={()=>{if(window.confirm(`Delete “${x.title}”?`))setRaw(a=>a.filter(y=>y.id!==x.id));}}><Trash2 size={17}/></button></div>)}
    </div></>;
}

export function StudyCalendar() {
  const [raw] = usePlan();const tasks=useMemo(()=>cleanTasks(raw),[raw]);const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));const [selected,setSelected]=useState(today());
  const y=month.getFullYear(),m=month.getMonth(),days=new Date(y,m+1,0).getDate(),offset=new Date(y,m,1).getDay();
  const day=n=>`${y}-${String(m+1).padStart(2,'0')}-${String(n).padStart(2,'0')}`;
  const changeMonth=n=>setMonth(d=>new Date(d.getFullYear(),d.getMonth()+n,1));
  return <><Section title="Study Calendar" subtitle="Your study sessions and deadlines, organized by date." action={<Link className="btn outline" to="/study-planner"><ListTodo size={16}/>Manage tasks</Link>}/>
    <div className="panel"><div className="phase6-calendar-head"><button className="plain-icon" onClick={()=>changeMonth(-1)} aria-label="Previous month"><ChevronLeft/></button><h3>{month.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</h3><div className="phase6-actions"><button className="btn outline" onClick={()=>{setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1));setSelected(today());}}>Today</button><button className="plain-icon" onClick={()=>changeMonth(1)} aria-label="Next month"><ChevronRight/></button></div></div>
    <div className="phase6-calendar" role="grid" aria-label="Study calendar">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><div className="phase6-weekday" key={d}>{d}</div>)}{Array.from({length:offset},(_,i)=><div key={`blank-${i}`} className="phase6-calendar-blank"/>)}{Array.from({length:days},(_,i)=>{const key=day(i+1),events=tasks.filter(t=>t.date===key);return <button key={key} type="button" className={`phase6-day${selected===key?' selected':''}${today()===key?' today':''}`} onClick={()=>setSelected(key)} aria-label={`${dateLabel(key)}, ${events.length} tasks`} aria-pressed={selected===key}><b>{i+1}</b><span className="phase6-dots">{events.slice(0,3).map(t=><i key={t.id} className={t.done?'done':t.kind}/>)}</span></button>})}</div></div>
    <div className="panel" style={{marginTop:16}}><h3>{dateLabel(selected)}</h3>{tasks.filter(x=>x.date===selected).length?sorted(tasks.filter(x=>x.date===selected)).map(x=><div className="phase6-task" key={x.id}><CheckCircle2 size={17} color={x.done?'var(--green-text)':'var(--muted)'}/><div className="phase6-task-main"><b>{x.title}</b><small>{x.kind==='deadline'?'Deadline':'Study session'} · {x.done?'Completed':'Pending'}</small></div></div>):<p className="muted">Nothing scheduled on this date.</p>}<Link className="link-btn" to="/study-planner">Add or edit a task</Link></div></>;
}

export function Notifications() {
  const nav=useNavigate();const [notes,setNotes]=useNotes();const [tasks]=usePlan();const [settings]=useSettings();const [filter,setFilter]=useState('All');
  const due=cleanTasks(tasks).filter(t=>!t.done&&t.date<=today()&&t.date>=dayKey(new Date(Date.now()-86400000*7)));
  const reminders=settings.reminders===false?[]:due.map(t=>({id:`reminder-${t.id}`,t:t.date<today()?'Overdue study task':'Study task due today',s:t.title,to:'/study-planner',read:false,virtual:true}));
  const all=[...reminders,...notes];const visible=all.filter(x=>filter==='All'||(filter==='Unread'?!x.read:filter==='Reminders'?x.virtual:x.read));
  const mark=id=>setNotes(a=>a.map(x=>x.id===id?{...x,read:true}:x));
  return <><Section title="Notifications" subtitle="Stay on top of learning updates and reminders." action={button('Mark all read',()=>setNotes(a=>a.map(x=>({...x,read:true}))),Check,'outline')}/>
    <div className="phase6-toolbar"><div className="segmented" role="group" aria-label="Notification filter">{['All','Unread','Reminders','Read'].map(t=><button key={t} className={filter===t?'selected':''} onClick={()=>setFilter(t)}>{t}</button>)}</div><span className="muted-sm">{notes.filter(x=>!x.read).length} unread updates · {reminders.length} task reminders</span></div>
    <div className="panel list-panel">{!visible.length&&<p className="muted">You're all caught up.</p>}{visible.map(x=><div className="phase6-task" key={x.id}><div className={`activity-dot ${x.read?'blue':'orange'}`}><Bell size={17}/></div><button type="button" className="phase6-note" onClick={()=>{if(!x.virtual)mark(x.id);nav(x.to||'/notifications');}}><b>{x.t}</b><small>{x.s}</small></button><span className="row-status">{x.virtual?'Reminder':x.read?'Read':'New'}</span>{!x.virtual&&<button className="plain-icon" title="Dismiss" aria-label={`Dismiss ${x.t}`} onClick={()=>setNotes(a=>a.filter(y=>y.id!==x.id))}><X size={17}/></button>}</div>)}</div>
    <p className="muted-sm" style={{marginTop:12}}>Reminders appear in-app when a task is due or overdue. Background push and email delivery require a backend.</p></>;
}

export function SettingsPage() {
  const [settings,setSettings]=useSettings();const [tab,setTab]=useState('Profile');const [draft,setDraft]=useState(settings);const [layout,setLayout]=useUserData('knoxia-dashboard-layout',{showTasks:true,showActions:true});
  useEffect(()=>setDraft(settings),[settings]);
  const toggle=(key,label)=> <label className="phase6-setting" key={key}><span>{label}</span><input type="checkbox" checked={draft[key]!==false} onChange={e=>setDraft(s=>({...s,[key]:e.target.checked}))}/></label>;
  return <><Section title="Settings" subtitle="Make KNOXIA work the way you study."/><div className="settings-layout"><div className="panel settings-menu">{['Profile','Privacy','Notifications','Appearance','Dashboard','Account'].map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</div><div className="panel settings-form">
    {tab==='Profile'&&<ProfileEditor/>}
    {tab==='Privacy'&&<><h3>Privacy & visibility</h3><p className="muted">These preferences are stored in your browser. Server-side privacy controls will be added with the backend.</p>{toggle('pub','Public profile')}{toggle('board','Appear on leaderboards')}{button('Save privacy preferences',()=>{setSettings(draft);toast('Privacy preferences saved');},Check)}</>}
    {tab==='Notifications'&&<><h3>Notification preferences</h3>{toggle('notif','Enable notification preferences')}{toggle('reminders','Show study task reminders')}{button('Save preferences',()=>{setSettings(draft);toast('Notification preferences saved');},Check)}<p className="muted-sm">Email and push delivery are not connected yet.</p></>}
    {tab==='Appearance'&&<><h3>Appearance</h3><p className="muted">Choose a theme for the entire app. System follows your device automatically.</p><ThemePicker/></>}
    {tab==='Dashboard'&&<><h3>Dashboard cards</h3><p className="muted">Choose which sections appear on your home dashboard.</p>{[['showTasks','Upcoming tasks'],['showActions','Quick actions']].map(([key,label])=><label className="phase6-setting" key={key}><span>{label}</span><input type="checkbox" checked={layout[key]!==false} onChange={e=>setLayout(s=>({...s,[key]:e.target.checked}))}/></label>)}</>}
    {tab==='Account'&&<><h3>Account settings</h3><p className="muted">Your account is currently stored in this browser. Profile changes are available in the Profile tab.</p><p className="muted-sm">Password recovery, changing email, and account deletion require the backend account service. No simulated password change is offered here.</p></>}
  </div></div></>;
}

export function DashboardExtras() {
  const [raw]=usePlan();const [layout]=useUserData('knoxia-dashboard-layout',{showTasks:true,showActions:true});const pr=useStudyProgress();const game=useMyGamification();const tasks=sorted(cleanTasks(raw).filter(x=>!x.done)).slice(0,4);
  if(layout.showTasks===false&&layout.showActions===false)return null;
  return <div className="phase6-dashboard-grid">
    {layout.showTasks!==false&&<section className="panel"><Section title="Upcoming tasks" subtitle="Your next study priorities" action={<Link className="link-btn" to="/study-planner">View planner</Link>}/>{tasks.length?tasks.map(x=><div className="phase6-task" key={x.id}><div className="activity-dot"><CalendarDays size={16}/></div><div className="phase6-task-main"><b>{x.title}</b><small>{dateLabel(x.date)} · {x.kind==='deadline'?'Deadline':'Study'}</small></div></div>):<p className="muted">No upcoming tasks. Add one in your planner.</p>}</section>}
    {layout.showActions!==false&&<section className="panel"><Section title="Your learning snapshot" subtitle="Live progress and quick actions"/><div className="phase6-snapshot"><span><Sparkles size={17}/> {game.xp.toLocaleString()} XP</span><span><Target size={17}/> {pr.quizzes.taken} quizzes</span><span><Clock3 size={17}/> {fmtTime((pr.week || []).reduce((sum, day) => sum + (day.secs || 0), 0)) || '0m'} studied</span></div><div className="phase6-actions" style={{marginTop:18}}><Link className="btn primary" to="/reviewers/create"><BookOpen size={16}/>Create reviewer</Link><Link className="btn outline" to="/study-calendar"><CalendarDays size={16}/>Calendar</Link></div></section>}
  </div>;
}
