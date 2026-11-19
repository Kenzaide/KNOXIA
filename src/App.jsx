import React, { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, NavLink, Link, Navigate, useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { useMaterials, toast, colorOf, fmtSize, fmtDate, SUBJECTS, MAX_MB, MAX_BATCH, validateFile, fileExt, parseTags } from './materials.jsx';
import { saveFile, getFile, hashFile, newId } from './files.js';
import { uploadMaterial, materialDownloadUrl } from './lib/learningApi.js';
import { ReviewerEditor, SavedReviewers, Challenges, ChallengePlay, Leaderboards, Analytics, Planner, Notifications, SettingsPage, Moderation, Logs } from './pages.jsx';
import { useNotes } from './data.js';
import { authPage } from './auth.jsx';
import { Knowl, KnowlAvatar } from './knowl.jsx';
import { ThemeToggle } from './theme.jsx';
import { useAuth, accessFor, normalizePath, safeRedirect } from './session.js';
import { useProfile, profileByUsername, useAccounts, buildProfile } from './accounts.js';
import { UserAvatar, ProfileHeader, ProfileDetails } from './profile.jsx';
import { Button, usePending, PageSkeleton, SectionTitle, ConfirmDialog } from './ui.jsx';
import MaterialLibrary from './library.jsx';
import CreateReviewer from './reviewer.jsx';
import ReviewerLibrary from './reviewers.jsx';
import { FlashcardLibrary, DeckEditor, FlashStudy } from './flashcards.jsx';
import { QuizCreate, QuizEditor, QuizTake } from './quizzes.jsx';
import AIQuizzes from './aiQuizzes.jsx';
import AIStudyCompanion from './aiStudyCompanion.jsx';
import { QuizResults, QuizHistory, QuizMissed } from './quizResults.jsx';
import StudyProgress from './progress.jsx';
import { useStudyProgress, track } from './progressStore.js';
import { dayKey } from './progressCalc.js';
import { fmtTime } from './progressCalc.js';
import { Friends, FriendAction, SuggestedPeople } from './friends.jsx';
import Feed from './feed.jsx';
import { LiveStudyRooms, LiveRoomDetail, LiveChallenges, LiveChallengePlay, ChallengeLeaderboard } from './liveSocial.jsx';
import { Achievements } from './gamification.jsx';
import { Planner as ProductivityPlanner, StudyCalendar, Notifications as ProductivityNotifications, SettingsPage as ProductivitySettings, DashboardExtras } from './productivity.jsx';
import { AdminDashboardV7, AdminUsersV7, AdminModerationV7, AdminLogsV7, AdminAnalyticsV7, AdminAccessDenied } from './adminPhase7.jsx';
import { isDemoAdmin } from './adminPhase7Store.js';
import './productivity.css';
import { LeaderboardsV2, Missions, StreakPage } from './gamificationPhase5.jsx';
import './gamificationPhase5.css';
import { useGamificationSync } from './gamificationStore.js';
import { GroupQuizPlay } from './activities.jsx';
import { ProfileSocial } from './profileSocial.jsx';
import { useIncomingCount } from './friendsStore.js';
import { samplePersonByUsername } from './friendsCalc.js';

// In-app navigation helper. Always goes through the router (no full page reloads).
function useGo() {
  const navigate = useNavigate();
  return useCallback((to, opts) => navigate(to, { viewTransition: true, ...opts }), [navigate]);
}
import {
  LayoutDashboard, FolderOpen, Upload, Sparkles, BookOpen, Layers, BrainCircuit,
  Users, UserRound, MessageSquare, Trophy, Swords, Medal, ChartNoAxesCombined,
  CalendarDays, Settings, Bell, ShieldCheck, ClipboardList, Search, Plus, Menu,
  X, ChevronDown, ChevronRight, FileText, File, MoreHorizontal, ArrowUpRight,
  Clock3, Flame, Target, CheckCircle2, CircleHelp, LogOut, Moon, Sun, Send,
  Paperclip, Play, Bookmark, Download, Filter, SlidersHorizontal, Zap, Star,
  LockKeyhole, Mail, Eye, EyeOff, Home, GraduationCap, Activity, Trash2,
  Pencil, UsersRound, Crown, CalendarCheck, CircleUserRound, AlertCircle, TrendingUp
} from 'lucide-react';

const navGroups = [
  { label: 'Overview', items: [
    ['Dashboard','/dashboard',LayoutDashboard],
    ['My Materials','/materials',FolderOpen],
  ]},
  { label: 'AI learning tools', items: [
    ['AI Reviewer','/reviewers/create',Sparkles],
    ['My Reviewers','/reviewers',Bookmark,['/reviewers'],['/reviewers/create']],
    ['Study Companion','/study-companion',BrainCircuit],
    ['Flashcards','/flashcards',Layers],
    ['Quizzes','/quizzes/ai',BookOpen,['/quizzes']],
  ]},
  { label: 'Social learning', items: [
    ['Learning Feed','/feed',MessageSquare],
    ['Friends','/friends',Users],
    ['Study Rooms','/study-rooms',UserRound],
    ['Challenges','/challenges',Swords],
    ['Missions','/missions',Target],
  ]},
  { label: 'Your progress', items: [
    ['Study Progress','/progress',TrendingUp],
    ['Study Calendar','/study-calendar',CalendarDays],
    ['Leaderboards','/leaderboards',Trophy],
    ['Study Streaks','/streaks',Flame],
    ['Achievements','/achievements',Medal],
    ['Analytics','/analytics',ChartNoAxesCombined],
    ['Study Planner','/study-planner',CalendarDays],
  ]},
];
const adminNav = [
  ['Admin Dashboard','/admin/dashboard',LayoutDashboard],
  ['User Management','/admin/users',Users],
  ['Content Moderation','/admin/moderation',ShieldCheck],
  ['Activity Logs','/admin/logs',ClipboardList],
  ['Platform Analytics','/admin/analytics',ChartNoAxesCombined],
];
const titleMap = {
  '/dashboard':'Dashboard','/materials':'My Materials','/materials/upload':'Upload Materials',
  '/reviewers':'My Reviewers','/reviewers/create':'Create AI Reviewer','/study-companion':'Knowl · Study Companion',
  '/flashcards':'Flashcard Library','/quizzes/create':'Create Quiz','/quizzes/attempts':'Quiz History','/feed':'Learning Feed',
  '/friends':'Friends','/study-rooms':'Study Rooms','/challenges':'Quiz Challenges',
  '/progress':'Study Progress','/leaderboards':'Leaderboards','/achievements':'Achievements & Badges','/analytics':'Learning Analytics',
  '/missions':'Challenges & Missions','/streaks':'Study Streaks',
  '/study-planner':'Study Planner','/study-calendar':'Study Calendar','/settings':'Settings','/notifications':'Notifications',
  '/admin/dashboard':'Admin Dashboard','/admin/users':'User Management','/admin/moderation':'Content Moderation',
  '/admin/logs':'Activity Logs','/admin/analytics':'Platform Analytics'
};
function Logo({small=false}) { return <div className="brand"><img className={`brand-logo${small?' small':''}`} src="/logo.png" alt={small?'KNOXIA':''} width={small?28:36} height={small?28:36}/>{!small && <span>KNOXIA</span>}</div>; }
function Avatar({initials='KP',size='md',online=false,src=''}) { return <div className={`avatar ${size}`}>{src?<img src={src} alt=""/>:initials}{online&&<i/>}</div>; }
function Toaster() { const [t,setT]=useState(null); useEffect(()=>{let id; const h=e=>{setT({m:e.detail,k:Date.now()});clearTimeout(id);id=setTimeout(()=>setT(null),2600)}; window.addEventListener('knoxia-toast',h); return()=>{window.removeEventListener('knoxia-toast',h);clearTimeout(id)}},[]); return t?<div className="toast" role="status" key={t.k}><CheckCircle2 size={18}/>{t.m}</div>:null; }
function StatCard({label,value,change,icon:Icon,tone='blue'}) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={18}/></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small className="positive">{change}</small></div></div>; }
// A sidebar link stays active for its whole section (e.g. Materials stays lit on /materials/upload and /materials/:id).
function SideLink({to,match,not,Icon,name,close,badge=0}) {
  // `not` lists paths that belong to a sibling link, so two links never light up together (e.g. /reviewers/create).
  const {pathname}=useLocation(); const at=m=>pathname===m||pathname.startsWith(m+'/'); const on=(match||[to]).some(at)&&!(not||[]).some(at);
  return <Link viewTransition to={to} onClick={close} aria-current={on?'page':undefined} className={`nav-link${on?' active':''}`}><Icon size={18}/><span>{name}</span>{badge>0&&<em aria-label={`${badge} pending`}>{badge>99?'99+':badge}</em>}</Link>;
}
function Sidebar({admin=false,close}) {
  const [confirming,setConfirming]=useState(false); const nav=useNavigate(); const {logout,role}=useAuth(); const me=useProfile(); const requests=useIncomingCount();
  // Navigate and clear the session in the same event so the login page shows the "logged out" notice, not a redirect.
  const signOut=()=>{close&&close(); nav('/login',{replace:true,state:{notice:'logged-out'}}); logout()};
  return <aside className="sidebar">
    <div className="sidebar-top"><Logo/><button className="mobile-close" onClick={close}><X size={18}/></button></div>
    
    <nav className="side-nav">
      {!admin ? navGroups.map(group=><div className="nav-group" key={group.label}><label>{group.label}</label>{group.items.map(([name,path,Icon,match,not])=><SideLink key={path} to={path} match={match} not={not} Icon={Icon} name={name} close={close} badge={path==='/friends'?requests:0}/>)}</div>) :
      <div className="nav-group"><label>Administration</label>{adminNav.map(([name,path,Icon])=><SideLink key={path} to={path} Icon={Icon} name={name} close={close}/>)}</div>}
    </nav>
    <div className="sidebar-bottom">
      
      {!admin && role === 'admin' && <SideLink to="/admin/dashboard" Icon={ShieldCheck} name="Admin Dashboard" close={close}/>}
      {admin && <SideLink to="/dashboard" Icon={LayoutDashboard} name="Student View" close={close}/>}
      <SideLink to="/settings" Icon={Settings} name="Settings" close={close}/>
      <button type="button" className="nav-link logout" onClick={()=>setConfirming(true)}><LogOut size={18}/><span>Log out</span></button>
      {confirming&&<ConfirmDialog title="Log out of KNOXIA?" body="You will need to sign in again to continue studying." confirmLabel="Log out" onConfirm={()=>{setConfirming(false);signOut()}} onCancel={()=>setConfirming(false)}/>}
      {admin?<div className="side-user"><Avatar initials="AD" online/><div><b>Admin User</b><small>Administrator</small></div><MoreHorizontal size={18}/></div>
      :<NavLink viewTransition to="/profile" onClick={close} className={({isActive})=>`side-user${isActive?' active':''}`} aria-label="View your profile"><UserAvatar online/><div><b>{me.displayName}</b><small>{me.academic||`@${me.username}`}</small></div><MoreHorizontal size={18}/></NavLink>}
    </div>
  </aside>;
}
function Clock() {
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const id=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(id)},[]);
  const time=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  const date=now.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
  return <time className="top-clock" dateTime={now.toISOString()}><b>{time}</b><small>{date}</small></time>;
}
function NotificationBell() {
  const nav=useNavigate(); const {pathname}=useLocation();
  const [items,setItems]=useNotes();
  const [open,setOpen]=useState(false); const box=useRef(null); const btn=useRef(null);
  const unread=items.filter(x=>!x.read).length;
  useEffect(()=>{setOpen(false)},[pathname]);
  useEffect(()=>{
    if(!open) return;
    const down=e=>{ if(box.current&&!box.current.contains(e.target)) setOpen(false); };
    const key=e=>{ if(e.key==='Escape'){ setOpen(false); btn.current&&btn.current.focus(); } };
    document.addEventListener('mousedown',down); document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('mousedown',down); document.removeEventListener('keydown',key)};
  },[open]);
  const markRead=id=>setItems(a=>a.map(x=>x.id===id?{...x,read:true}:x));
  const markAll=()=>setItems(a=>a.map(x=>({...x,read:true})));
  return <div className="notif-wrap" ref={box}>
    <button ref={btn} type="button" className="icon-btn notification" aria-label={`Notifications${unread?`, ${unread} unread`:''}`} aria-haspopup="true" aria-expanded={open} onClick={()=>setOpen(o=>!o)}>
      <Bell size={18}/>{unread>0&&<span className="notif-badge">{unread}</span>}
    </button>
    {open&&<div className="notif-menu" role="region" aria-label="Notifications">
      <div className="notif-head"><b>Notifications</b>{unread>0?<button type="button" className="link-btn" onClick={markAll}>Mark all as read</button>:<span className="muted-sm">All caught up</span>}</div>
      <ul className="notif-list">
        {items.length===0&&<li className="notif-empty">No notifications yet.</li>}
        {items.map(x=><li key={x.id} className={`notif-item${x.read?'':' unread'}`}>
          <button type="button" className="notif-main" onClick={()=>markRead(x.id)} title={x.read?'':'Mark as read'}>
            <span className="notif-dot" aria-hidden="true"/>
            <span className="notif-text"><b>{x.t}</b><small>{x.s}</small></span>
          </button>
          <button type="button" className="notif-open" aria-label={`Open: ${x.t}`} onClick={()=>{markRead(x.id); setOpen(false); nav(x.to);}}><ChevronRight size={16}/></button>
        </li>)}
      </ul>
      <div className="notif-foot"><button type="button" className="link-btn" onClick={()=>{setOpen(false); nav('/notifications');}}>View all notifications</button></div>
    </div>}
  </div>;
}
function Topbar({title,admin=false,onMenu}) {
  const [search,setSearch]=useState('');
  return <header className="topbar"><div className="top-left"><button className="menu-btn" onClick={onMenu}><Menu size={20}/></button><div className="crumb"><b>{title}</b></div></div><div className="top-actions"><Clock/><div className="top-search"><Search size={16}/><input placeholder="Search anything..." value={search} onChange={e=>setSearch(e.target.value)}/></div><ThemeToggle/><NotificationBell/><div className="top-divider"/>{admin?<Avatar initials="AD" size="sm"/>:<NavLink viewTransition to="/profile" className="top-avatar" aria-label="View your profile"><UserAvatar size="sm"/></NavLink>}</div></header>;
}
function Shell({children,admin=false,title}) {
  useGamificationSync(); // announces new badges and level-ups (Patches 23 and 24)
  const [open,setOpen]=useState(false); const {pathname}=useLocation();
  useEffect(()=>{setOpen(false)},[pathname]);
  useEffect(()=>{ if(!open)return; const k=e=>{if(e.key==='Escape')setOpen(false)}; document.addEventListener('keydown',k); return()=>document.removeEventListener('keydown',k); },[open]);
  return <div className="app-shell"><Sidebar admin={admin} close={()=>setOpen(false)}/>{open&&<div className="mobile-shade" onClick={()=>setOpen(false)}/>}<div className={`mobile-sidebar ${open?'show':''}`}><Sidebar admin={admin} close={()=>setOpen(false)}/></div><main className="main-area"><Topbar title={title} admin={admin} onMenu={()=>setOpen(true)}/><div className="page-content" tabIndex={-1}>{children}</div><Toaster/></main></div>;
}

const TIPS=[
  'Quiz yourself before rereading. Recalling beats reviewing.',
  'Study in 25-minute blocks, then take a 5-minute break.',
  'Explain a topic out loud as if teaching it. Gaps show up fast.',
  'Review tonight what you learned today. It sticks longer.',
];
const greetingFor=h=>h<5?'Still up':h<12?'Good morning':h<18?'Good afternoon':'Good evening';
function Dashboard() { const go=useGo();
  const {items}=useMaterials(); const loading=usePending(); const {firstName}=useProfile(); const pr=useStudyProgress();
  const [said,setSaid]=useState(null); const [clicks,setClicks]=useState(0); const [focusing,setFocusing]=useState(false);
  const [focusRunning,setFocusRunning]=useState(false); const [focusSecs,setFocusSecs]=useState(0); const focusStart=useRef(null); const focusSaved=useRef(0);
  useEffect(()=>{if(!focusRunning)return;const id=setInterval(()=>setFocusSecs(Math.floor((Date.now()-focusStart.current)/1000)),1000);return()=>clearInterval(id)},[focusRunning]);
  const finishFocus=()=>{if(!focusRunning)return;const elapsed=Math.max(0,Math.floor((Date.now()-focusStart.current)/1000));const delta=Math.max(0,elapsed-focusSaved.current);if(delta)track.focus(delta);focusSaved.current=0;focusStart.current=null;setFocusRunning(false);setFocusSecs(0);};
  useEffect(()=>()=>{if(focusStart.current){const delta=Math.max(0,Math.floor((Date.now()-focusStart.current)/1000)-focusSaved.current);if(delta)track.focus(delta);}},[]);
  const startFocus=()=>{focusStart.current=Date.now();focusSaved.current=0;setFocusSecs(0);setFocusRunning(true);};
  const hour=new Date().getHours(); const night=hour>=22||hour<5;
  const today=dayKey(new Date()); const loggedToday=pr.events.filter(e=>dayKey(e.date)===today).reduce((n,e)=>n+(e.secs||0),0); const goal={done:Math.floor((loggedToday+(focusRunning?focusSecs:0))/60),total:60}; const left=Math.max(0,goal.total-goal.done); const pct=Math.min(100,Math.round(goal.done/goal.total*100));
  // Real numbers from Study Progress (Patch 15) once there is activity; sample values until then.
  const live=pr.hasActivity; const streak=live?pr.streak.current:0; const first=items[0];
  const resting=night?{pose:'sleepy',text:`It's late, ${firstName}. Review something short, then get some sleep.`}
    :left===0?{pose:'happy',text:"Goal reached! Great work today."}
    :items.length===0?{pose:'think',text:"Upload a file and I'll help you turn it into a reviewer."}
    :{pose:'default',text:`Hoot! ${left} more minutes and today's goal is done.`};
  // Clicking Knowl cycles through a few reactions.
  const poke=()=>{
    const tip=TIPS[Math.floor(clicks/4)%TIPS.length];
    const reactions=[
      {pose:'happy',text:streak>0?`${streak}-day streak. Keep it going!`:'Study something today to start a streak.'},
      {pose:'think',text:tip},
      {pose:'study',text:first?`Want to review "${first.name}"?`:'Upload a file and we can study it together.'},
      {pose:'default',text:"Hoot! I'm here when you need me."},
    ];
    setSaid(reactions[clicks%4]); setClicks(c=>c+1);
  };
  const shown=focusing?{pose:'study',text:"Let's focus. I'll keep you company."}:(said||resting);
  if(loading) return <PageSkeleton/>;
  return <>
    <section className="kn-hero">
      <div className="kn-hero-copy">
        <h1>{greetingFor(hour)}, {firstName}</h1>
        <p className="kn-sub">{items.length} {items.length===1?'material is':'materials are'} ready to study.</p>
        <div className="kn-goal"><div className="kn-goal-top"><b>Today's goal</b><span>{goal.done} of {goal.total} min</span></div><div className="goal-progress" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label="Daily goal"><span style={{width:pct+'%'}}/></div></div>
        <div className="kn-actions">
          <button type="button" className="btn primary" onClick={()=>focusRunning?finishFocus():startFocus()} onMouseEnter={()=>setFocusing(true)} onMouseLeave={()=>setFocusing(false)} onFocus={()=>setFocusing(true)} onBlur={()=>setFocusing(false)}><Zap size={16}/><span>{focusRunning?`Finish focus (${Math.floor(focusSecs/60)}:${String(focusSecs%60).padStart(2,'0')})`:'Start a focus session'}</span></button>
          <button type="button" className="btn outline" onClick={()=>go('/materials/upload')}><Plus size={16}/><span>Add materials</span></button>
        </div>
      </div>
      <div className="kn-hero-knowl">
        <p className="kn-bubble" key={shown.text} role="status">{shown.text}</p>
        <Knowl pose={shown.pose} onClick={poke} label="Knowl the owl. Click for a tip."/>
      </div>
    </section>
    <div className="kn-grid">
      <section className="panel"><SectionTitle title="Continue studying" subtitle="Your latest uploads." action={<NavLink viewTransition to="/materials">View all</NavLink>}/>
        {items.slice(0,3).map(m=><div className="continue-item" key={m.id}><div className={`file-tile ${m.color||colorOf(m.type)}`}><FileText size={20}/></div><div className="continue-info"><b>{m.name}</b><small>{m.subject} · Uploaded {fmtDate(m.uploaded)}</small></div><button className="round-arrow" aria-label={`Open ${m.name}`} onClick={()=>go('/materials/'+m.id)}><ArrowUpRight size={18}/></button></div>)}
        {items.length===0&&<div className="empty-state"><FolderOpen size={32}/><b>No materials yet</b><p>Upload your first file to get started.</p></div>}
      </section>
      <section className="panel"><SectionTitle title="This week" action={<NavLink viewTransition to="/progress">Details</NavLink>}/>
        {[[Flame,'orange',`${streak} ${streak===1?'day':'days'}`,live?`Study streak. Best is ${pr.streak.best}.`:'Start studying to build your streak.'],[Target,'green',pr.quizzes.avg===null?'—':pr.quizzes.avg+'%',pr.quizzes.avg===null?'No quiz attempts yet.':`Quiz average over ${pr.quizzes.taken} ${pr.quizzes.taken===1?'attempt':'attempts'}.`],[Clock3,'blue',live?fmtTime(pr.week.reduce((t,d)=>t+d.secs,0))||'0m':'0m',live?'Studied in the last 7 days.':'No study sessions yet.']].map(([I,tone,v,l])=><div className="kn-stat" key={l}><div className={`activity-dot ${tone}`}><I size={18}/></div><div><b>{v}</b><small>{l}</small></div></div>)}
      </section>
    </div>
  </>;
}
function UploadPage() { const go=useGo();
  const {items,add}=useMaterials(); const alive=useRef(true);
  const [queue,setQueue]=useState([]); const [drag,setDrag]=useState(false); const [busy,setBusy]=useState(false);
  const [subject,setSubject]=useState(SUBJECTS[0]); const [tags,setTags]=useState(''); const [desc,setDesc]=useState('');
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  const patch=(key,p)=>{ if(alive.current) setQueue(q=>q.map(x=>x.key===key?{...x,...p}:x)); };
  const addFiles=async list=>{
    const files=[...list]; if(!files.length)return;
    const room=Math.max(MAX_BATCH-queue.length,0); if(files.length>room) toast(`You can add up to ${MAX_BATCH} files at a time`);
    const rows=files.slice(0,room).map(f=>({key:newId(),file:f,title:f.name.replace(/\.[^.]+$/,''),state:'checking',include:false}));
    setQueue(q=>[...q,...rows]);
    const seen=new Map(queue.filter(x=>x.hash).map(x=>[x.hash,x.title]));
    for(const r of rows){
      const v=await validateFile(r.file); if(!v.ok){patch(r.key,{state:'invalid',error:v.error});continue}
      const hash=await hashFile(r.file); const dup=items.find(m=>m.hash===hash); const twin=seen.get(hash); seen.set(hash,r.title);
      patch(r.key,{hash,state:dup||twin?'duplicate':'ready',dupOf:dup?dup.name:twin||''});
    }
  };
  const ready=queue.filter(x=>x.state==='ready'||(x.state==='duplicate'&&x.include));
  const start=async()=>{ if(!ready.length||busy)return; setBusy(true); let ok=0,failed=0,last=null;
    for(const r of ready){ patch(r.key,{state:'uploading',progress:25});
      try{ const uploaded=await uploadMaterial(r.file,{title:(r.title.trim()||r.file.name).slice(0,120),description:desc.trim()}); patch(r.key,{progress:80});
        last=add({id:uploaded.id,name:uploaded.title,fileName:r.file.name,type:fileExt(r.file.name).toUpperCase(),size:fmtSize(r.file.size),bytes:r.file.size,subject,tags:parseTags(tags),desc:desc.trim(),hash:r.hash,storagePath:uploaded.storage_path,uploaded:uploaded.created_at});
        patch(r.key,{state:'done',progress:100}); ok++;
      }catch(e){ failed++; patch(r.key,{state:'failed',error:e?.message||'Upload failed. Please try again.'}); } }
    if(alive.current) setBusy(false);
    if(ok) toast(ok===1?'Material uploaded':`${ok} materials uploaded`);
    if(ok&&!failed&&alive.current) go(ok===1&&queue.length===1?'/materials/'+last.id:'/materials');
  };
  const label={checking:'Checking…',ready:'Ready',uploading:'Uploading…',done:'Uploaded',invalid:'',failed:'',duplicate:''};
  return <><SectionTitle title="Upload Materials" subtitle="Add your files and let KNOXIA turn them into useful study resources."/><div className="upload-layout"><div className="upload-main">
    <div className={`drop-zone ${drag?'drag':''}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);addFiles(e.dataTransfer.files)}}>
      <div className="upload-icon"><Upload size={24}/></div><h2>Drag and drop your files here</h2><p>or choose files from your device</p>
      <label className="btn primary">Browse files<input type="file" hidden multiple accept=".pdf,.docx,.pptx" onChange={e=>{addFiles(e.target.files);e.target.value=''}}/></label>
      <small>PDF, DOCX or PPTX · up to {MAX_MB} MB each · {MAX_BATCH} files at a time</small></div>
    {queue.length>0&&<ul className="file-queue" aria-label="Files to upload">{queue.map(r=><li className={`file-row ${r.state}`} key={r.key}>
      <FileText size={20}/><div className="file-row-main">
        {r.state==='ready'||r.state==='duplicate'?<input aria-label="Material title" value={r.title} maxLength={120} onChange={e=>patch(r.key,{title:e.target.value})}/>:<b>{r.title}</b>}
        <small>{fmtSize(r.file.size)} · {fileExt(r.file.name).toUpperCase()}{label[r.state]&&<> · {label[r.state]}</>}</small>
        {(r.state==='invalid'||r.state==='failed')&&<small className="row-error" role="alert"><AlertCircle size={14}/> {r.error}</small>}
        {r.state==='duplicate'&&<label className="row-dup"><input type="checkbox" checked={r.include} onChange={e=>patch(r.key,{include:e.target.checked})}/> Already in your library{r.dupOf?` as “${r.dupOf}”`:''}. Upload anyway</label>}
        {r.state==='uploading'&&<div className="progress-track"><span style={{width:r.progress+'%'}}/></div>}
      </div>{r.state==='done'?<CheckCircle2 size={20} className="row-ok"/>:<button type="button" className="plain-icon" aria-label={`Remove ${r.title}`} disabled={r.state==='uploading'} onClick={()=>setQueue(q=>q.filter(x=>x.key!==r.key))}><X size={18}/></button>}
    </li>)}</ul>}
    <div className="panel upload-form"><h3>Details for this upload</h3><p className="muted">Applies to every file in the list above.</p>
      <label className="ufield"><span>Subject</span><select value={subject} onChange={e=>setSubject(e.target.value)}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="ufield"><span>Tags (optional, separated by commas)</span><input value={tags} onChange={e=>setTags(e.target.value)} placeholder="midterm, chapter 3"/></label>
      <label className="ufield"><span>Description (optional)</span><textarea rows="2" maxLength={300} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What are these materials about?"/></label>
      <div className="form-actions"><Button variant="outline" onClick={()=>go('/materials')}>Cancel</Button><Button icon={Upload} loading={busy} onClick={start}>{busy?'Uploading…':ready.length>1?`Upload ${ready.length} files`:'Upload material'}</Button></div></div></div>
    <div className="panel upload-tips"><h3><Sparkles size={18}/> What happens next?</h3><ol><li><b>Upload your material</b><span>Choose lecture files or class notes.</span></li><li><b>AI processes the content</b><span>KNOXIA extracts and organizes the key information.</span></li><li><b>Start learning</b><span>Generate reviewers, flashcards, and practice quizzes.</span></li></ol><div className="privacy-note"><LockKeyhole size={16}/> Your learning materials are private by default.</div></div></div></>;
}
function Companion() { const go=useGo();
 const [messages,setMessages]=useState([{role:'assistant',text:'Hoot! I’m Knowl, your KNOXIA Study Companion. 🦉 Ask me anything about your uploaded materials, or tell me what topic you want to understand better.'}]); const [text,setText]=useState(''); const [pose,setPose]=useState('happy'); const [thinking,setThinking]=useState(false);
 const timer=useRef(null); useEffect(()=>()=>clearTimeout(timer.current),[]);
 const send=()=>{if(!text.trim()||thinking)return;setMessages(m=>[...m,{role:'user',text}]);setText('');setThinking(true);setPose('think');
  timer.current=setTimeout(()=>{setMessages(m=>[...m,{role:'assistant',text:'That’s a great question! This is a preview of Knowl. Connect an AI API and your uploaded study materials to receive grounded explanations and source references.'}]);setThinking(false);setPose('happy');},900);};
 return <><SectionTitle title="Knowl, your Study Companion" subtitle="Your personal learning assistant, ready when you are."/><div className="chat-layout"><div className="chat-main panel"><div className="chat-header"><KnowlAvatar pose={pose} size={40}/><div><b>Knowl · KNOXIA Companion</b><small><i/> {thinking?'Thinking…':'Ready to help'}</small></div><button className="plain-icon" aria-label="More options"><MoreHorizontal/></button></div><div className="chat-messages" aria-live="polite">{messages.map((m,i)=><div className={`message ${m.role}`} key={i}>{m.role==='assistant'&&<KnowlAvatar pose="default" size={30} className="mini"/>}<div className="bubble">{m.text}</div></div>)}{thinking&&<div className="message assistant"><KnowlAvatar pose="think" size={30} className="mini"/><div className="bubble typing" aria-label="Knowl is thinking"><i/><i/><i/></div></div>}</div><div className="suggestions"><button onClick={()=>setText('Explain supervised learning in simple terms')}>Explain a concept</button><button onClick={()=>setText('Give me an example of a finite automaton')}>Give me an example</button><button onClick={()=>setText('Create a quick practice question')}>Test my knowledge</button></div><div className="chat-input"><button className="plain-icon" aria-label="Attach file"><Paperclip size={18}/></button><input placeholder="Ask Knowl anything about your lessons..." value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}/><button className="send-btn" onClick={send} aria-label="Send"><Send size={18}/></button></div></div><div className="panel chat-context"><div className="companion-knowl"><Knowl pose={pose} label="Knowl the owl. Click to make Knowl hop."/></div><h3>Study context</h3><p>Choose the materials Knowl should use.</p><div className="context-file"><FileText size={18}/><span>Introduction to Machine Learning</span><CheckCircle2 size={16}/></div><div className="context-file"><FileText size={18}/><span>Automata Theory — Module 03</span><CheckCircle2 size={16}/></div><Button variant="soft" icon={Plus} onClick={()=>go('/materials')}>Manage materials</Button><div className="grounding-note"><ShieldCheck size={16}/><span>Answers can be grounded in selected materials when AI integration is enabled.</span></div></div></div></>; }
function GenericPage({title}) { const data={
 'Study Rooms':['Study together, stay focused.','Create a virtual space for focused study sessions.','Create a room','Machine Learning Review','Automata Theory Study Group','Finals Preparation Room'],
 'Quiz Challenges':['A little friendly competition goes a long way.','Challenge friends and test your knowledge.','Create challenge','Machine Learning Face-off','Automata Speed Round','Cybersecurity Challenge'],
 'Leaderboards':['Celebrate progress, not just scores.','See how your learning journey compares with others.','This week','Kenneth Punla','Mika Santos','Alex Rivera'],
 'Achievements & Badges':['Every milestone deserves recognition.','Collect badges as you build better learning habits.','Your collection','7-Day Streak','Quiz Master','Early Bird'],
 'Learning Analytics':['Understand your progress at a glance.','Use your learning data to make your next study session count.','Export report','Quiz performance','Study activity','Topic mastery'],
 'Study Planner':['Make time for what matters.','Plan your sessions and keep your goals within reach.','Add study session','Machine Learning review','Automata Theory practice','Computer Architecture'],
 'Notifications':['Stay updated with your learning activity.','Your latest reminders, updates, and interactions.','Mark all as read','Your quiz result is ready','Mika sent you a friend request','You earned a new achievement'],
 'Settings':['Manage your account and preferences.','Customize your KNOXIA experience.','Save changes','Profile information','Account security','Notifications & privacy'],
 'Content Moderation':['Keep the KNOXIA community safe and respectful.','Review reported content and community concerns.','Review queue','Reported post','Reported profile','Pending review'],
 'Activity Logs':['Monitor important actions across the platform.','A record of recent administrative activity.','Download logs','User login','Material uploaded','Report resolved']
 }; const d=data[title]||['Explore your learning space.','Your KNOXIA workspace.','Get started','Recent activity','Your progress','Quick links'];
 return <><SectionTitle title={title} subtitle={d[1]} action={<Button icon={Plus} onClick={()=>alert('This action is a frontend demo.')}>{d[2]}</Button>}/>{title==='Settings'?<div className="settings-layout"><div className="panel settings-menu">{['Profile information','Account security','Notifications','Privacy','Appearance'].map((x,i)=><button className={i===0?'active':''} key={x}>{x}<ChevronRight size={16}/></button>)}</div><div className="panel settings-form"><h3>Profile information</h3><p>Update the details associated with your account.</p><div className="profile-edit"><Avatar initials="KP" size="lg"/><div><b>Kenneth Punla</b><small>JPG or PNG · Max 2 MB</small></div><Button variant="outline">Change photo</Button></div><label className="field-label">Full name</label><input className="field" defaultValue="Kenneth Punla"/><label className="field-label">Username</label><input className="field" defaultValue="kennethpunla"/><label className="field-label">Email address</label><input className="field" defaultValue="kenneth@example.com"/><Button onClick={()=>alert('Demo: settings saved locally only.')}>Save changes</Button></div></div>:<><div className="stats-grid compact"><StatCard label="Total" value={title==='Notifications'?'4':title==='Activity Logs'?'128':'12'} change="Updated just now" icon={Activity}/><StatCard label="This month" value="08" change="Across your workspace" icon={CalendarCheck} tone="purple"/><StatCard label="Completed" value="06" change="Keep it up" icon={CheckCircle2} tone="green"/></div><div className="panel list-panel"><div className="list-head"><h3>{d[3]}</h3><button className="filter-btn"><Filter size={16}/> Filter</button></div>{d.slice(3).map((x,i)=><div className="generic-row" key={i}><div className={`activity-dot ${['blue','purple','green'][i%3]}`}>{title.includes('Achievement')?<Trophy size={16}/>:title.includes('Analytics')?<ChartNoAxesCombined size={16}/>:title.includes('Moderation')?<ShieldCheck size={16}/>:<Activity size={16}/>}</div><div><b>{x}</b><small>{title==='Notifications'?'A few moments ago':title==='Activity Logs'?'System event · Today':`Updated ${i+1} hour${i?'s':''} ago`}</small></div><span className="row-status">{i===0?'Active':i===1?'In progress':'View details'}</span><button className="plain-icon"><ChevronRight size={18}/></button></div>)}</div></>}</>;
}
const MaterialViewer = lazy(() => import('./viewer.jsx')); // pdf.js, mammoth and jszip load only when a file is opened
function MaterialDetail() { const go=useGo();
  const {id}=useParams(); const {items,update,remove}=useMaterials(); const m=items.find(x=>x.id===id); const kind=m&&m.type;
  const [editing,setEditing]=useState(false); const [form,setForm]=useState(null); const [err,setErr]=useState(''); const [del,setDel]=useState(false);
  const [file,setFile]=useState(undefined); const saveInfo=useCallback(info=>{ if(id) update(id,{info}); },[id,update]);
  useEffect(()=>{ let live=true; setFile(undefined); setErr(''); if(id) getFile(id).then(b=>{ if(live) setFile(b||null); }).catch(e=>{ if(live){setFile(null);setErr(e?.message||'Could not retrieve the original file.');} }); return()=>{live=false}; },[id]);
  if(!m) return <div className="empty-state"><FolderOpen size={32}/><b>Material not found</b><p>It may have been deleted.</p><Button onClick={()=>go('/materials')}>Back to My Materials</Button></div>;
  const edit=()=>{setForm({name:m.name,subject:m.subject,tags:(m.tags||[]).join(', '),desc:m.desc||''});setErr('');setEditing(true)};
  const save=e=>{e.preventDefault(); const name=form.name.trim();
    if(!name){setErr('Give this material a title.');return}
    update(m.id,{name:name.slice(0,120),subject:form.subject,tags:parseTags(form.tags),desc:form.desc.trim()}); setEditing(false); toast('Details saved'); };
  const download=()=>{ const u=URL.createObjectURL(file); const a=document.createElement('a'); a.href=u; a.download=m.fileName||m.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),1000); };
  const inf=m.info||{};
  const rows=[['File name',m.fileName||m.name],['Type',m.type],['Size',m.size],['Uploaded',fmtDate(m.uploaded)],['Subject',m.subject],
    ...(inf.title?[['Document title',inf.title]]:[]),...(inf.author?[['Author',inf.author]]:[]),
    ...(inf.pages?[['Pages',inf.pages]]:[]),...(inf.slides?[['Slides',inf.slides]]:[]),...(inf.words!=null?[['Words',inf.words.toLocaleString()]]:[]),...(inf.minutes?[['Reading time',inf.minutes+' min']]:[]),
    ['Stored',file?'In this browser':'Sample material (no file)']];
  return <><SectionTitle title="Material Details" subtitle="Review and manage your uploaded learning material." action={<div className="head-actions">{!editing&&<Button variant="outline" icon={Pencil} onClick={edit}>Edit details</Button>}{file&&<Button variant="outline" icon={Download} onClick={download}>Download</Button>}<Button variant="outline" icon={Trash2} onClick={()=>setDel(true)}>Delete</Button></div>}/>
    <div className="panel detail-panel"><div className={`file-tile ${m.color||colorOf(m.type)}`}><FileText size={26}/></div><div>
      <h2>{m.name}</h2><p>{m.type} · {m.size} · Uploaded {fmtDate(m.uploaded)}</p>{m.desc&&<p>{m.desc}</p>}
      <div className="post-tags"><span>{m.subject}</span>{(m.tags||[]).map(t=><span key={t}>{t}</span>)}</div></div></div>
    {editing&&<form className="panel upload-form" onSubmit={save} noValidate><h3>Edit details</h3>
      <label className="ufield"><span>Title</span><input autoFocus value={form.name} maxLength={120} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label className="ufield"><span>Subject</span><select value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}>{[...new Set([...SUBJECTS,form.subject])].map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="ufield"><span>Tags (separated by commas)</span><input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})}/></label>
      <label className="ufield"><span>Description</span><textarea rows="2" maxLength={300} value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})}/></label>
      {err&&<div className="notice error" role="alert"><AlertCircle size={16}/>{err}</div>}
      <div className="form-actions"><Button variant="outline" onClick={()=>setEditing(false)}>Cancel</Button><Button type="submit">Save changes</Button></div></form>}
    <div className="detail-grid viewer-grid"><div className="panel"><h3>Viewer</h3>{file?<Suspense fallback={<div className="viewer-loading" role="status"><i className="spin" aria-hidden="true"/> Loading viewer…</div>}><MaterialViewer file={file} kind={m.type} onInfo={saveInfo}/></Suspense>:<div className="empty-state"><FileText size={32}/><b>{file===undefined?'Loading file…':'No original file stored'}</b><p>{file===undefined?'':err||'The original file is not available in storage. Please upload the file again.'}</p></div>}</div>
    <div className="panel"><h3>File details</h3><dl className="info-list">{rows.map(([k,v])=><React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl></div></div>
    <div className="quick-tools"><div className="panel quick-tool"><Sparkles/><h3>Generate reviewer</h3><p>Create organized notes from this material.</p><Button variant="soft" onClick={()=>go('/reviewers/create?material='+encodeURIComponent(m.id))}>Create reviewer</Button></div><div className="panel quick-tool"><BookOpen/><h3>Generate quiz</h3><p>Test your knowledge with practice questions.</p><Button variant="soft" onClick={()=>go('/quizzes/create')}>Create quiz</Button></div><div className="panel quick-tool"><BrainCircuit/><h3>Ask AI</h3><p>Get help understanding difficult concepts.</p><Button variant="soft" onClick={()=>go('/study-companion')}>Ask companion</Button></div></div>
    {del&&<ConfirmDialog icon={Trash2} title={`Delete "${m.name}"?`} body="This removes the file and its details from your library. This can't be undone." confirmLabel="Delete" onCancel={()=>setDel(false)} onConfirm={()=>{remove(m.id);toast('Material deleted');go('/materials')}}/>}</>;
}
function StudyMode({type}) { const go=useGo(); const [revealed,setRevealed]=useState(false); return <><SectionTitle title={type==='flash'?'Flashcard Study Session':type==='quiz'?'Take Quiz':type==='result'?'Quiz Results':'Study Session'} subtitle="Focus on understanding, one question at a time."/><div className="study-center"><div className="study-progress"><span>Question 1 of 10</span><span>10% complete</span></div><div className="progress-track"><span style={{width:'10%'}}/></div><div className="panel study-card">{type==='flash'?<><small>FLASHCARD · MACHINE LEARNING</small><h2>What is supervised learning?</h2>{revealed&&<p className="answer-reveal">A type of machine learning where a model learns from labeled training data.</p>}<Button onClick={()=>setRevealed(!revealed)}>{revealed?'Hide answer':'Reveal answer'}</Button></>:<><small>QUESTION 01 · MULTIPLE CHOICE</small><h2>Which of the following best describes supervised learning?</h2>{['Learning from labeled data','Learning without any data','Learning through rewards only','Learning by random guessing'].map((x,i)=><button className="answer-option" key={x} onClick={e=>e.currentTarget.classList.toggle('picked')}><span>{String.fromCharCode(65+i)}</span>{x}</button>)}<Button onClick={()=>alert('Demo: answer submission is not connected.')}>Submit answer</Button></>}</div><div className="study-footer"><span>Take your time. Learning is a process.</span><Button variant="outline" onClick={()=>go('/dashboard')}>Exit session</Button></div></div></>; }
function Profile() {
  const {username}=useParams(); const me=useProfile();
  if(!username) return <Navigate to={`/profile/${me.username}`} replace/>;
  const mine=username.toLowerCase()===me.username.toLowerCase();
  // Someone else who registered in this browser shows their real profile; seeded demo users keep the placeholder profile.
  const other=mine?null:profileByUsername(username);
  const p=mine?me:other||{...buildProfile(null,''),displayName:username,username,initials:username.slice(0,2).toUpperCase(),academic:'3rd Year • BSCS',bio:'Learning every day, one concept at a time.',createdAt:0};
  // Friend button: real accounts and the sample people only. A made-up username in the address bar has no one to add.
  const person=other||samplePersonByUsername(username);
  return <><ProfileHeader p={p} mine={mine} action={person?<FriendAction person={person}/>:null}/><ProfileSocial p={p} person={mine?me:person} mine={mine}/>{(mine||other)&&<ProfileDetails p={p} mine={mine}/>}</>;
}
function AdminUsers() {
  // People who registered in this browser come first (see src/accounts.js), followed by the sample users.
  const accs=useAccounts();
  const real=accs.map(a=>{const p=buildProfile(a,a.email); return [p.displayName,a.email,'Student',a.verified?'Active':'Pending',fmtDate(a.createdAt),p.initials,p.avatar];});
  const rows=[...real,...[['Kenneth Punla','kenneth@example.com','Student','Active','Nov 01, 2026'],['Mika Santos','mika@example.com','Student','Active','Oct 28, 2026'],['Alex Rivera','alex@example.com','Student','Active','Oct 21, 2026'],['Jordan Lee','jordan@example.com','Moderator','Pending','Oct 19, 2026']].filter(u=>!accs.some(a=>a.email===u[1]))];
  return <><SectionTitle title="User Management" subtitle="View and manage registered KNOXIA accounts." action={<Button icon={Plus}>Add user</Button>}/><div className="toolbar"><div className="search-field"><Search size={16}/><input placeholder="Search users..."/></div><button className="filter-btn"><Filter size={16}/> All roles</button></div><div className="panel table-panel"><table><thead><tr><th>USER</th><th>ROLE</th><th>STATUS</th><th>JOINED</th><th>ACTION</th></tr></thead><tbody>{rows.map(u=><tr key={u[1]}><td><div className="table-user"><Avatar initials={u[5]||u[0].split(' ').map(x=>x[0]).join('')} src={u[6]}/><div><b>{u[0]}</b><small>{u[1]}</small></div></div></td><td>{u[2]}</td><td><span className={`status-pill ${u[3].toLowerCase()}`}>{u[3]}</span></td><td>{u[4]}</td><td><button className="plain-icon"><MoreHorizontal/></button></td></tr>)}</tbody></table></div></>; }
function AdminDashboard() { return <><div className="welcome-row"><div><h1>Platform overview</h1><p>Monitor KNOXIA activity and keep the community healthy.</p></div><Button variant="outline" icon={Download}>Export report</Button></div><div className="stats-grid"><StatCard label="Registered users" value="1,284" change="↑ 8.2% this month" icon={Users}/><StatCard label="Active today" value="326" change="↑ 12.4% today" icon={Activity} tone="green"/><StatCard label="Materials uploaded" value="4,892" change="+184 this week" icon={FolderOpen} tone="purple"/><StatCard label="Reports pending" value="07" change="Requires attention" icon={AlertCircle} tone="orange"/></div><div className="dashboard-grid"><section className="panel activity-panel"><SectionTitle title="Recent platform activity" subtitle="Latest system events."/><div className="activity-row"><div className="activity-dot blue"><UserRound size={16}/></div><div><b>New user registered</b><small>Mika Santos joined KNOXIA</small></div><time>5 min ago</time></div><div className="activity-row"><div className="activity-dot green"><Upload size={16}/></div><div><b>Materials uploaded</b><small>3 new learning resources</small></div><time>22 min ago</time></div><div className="activity-row"><div className="activity-dot orange"><ShieldCheck size={16}/></div><div><b>Content reported</b><small>A post needs moderator review</small></div><time>1 hour ago</time></div></section><section className="panel weekly-panel"><SectionTitle title="Platform growth" subtitle="New registrations this week."/><div className="weekly-total"><b>+126</b><span className="positive">↑ 8.2%</span></div><div className="bar-chart">{[['M',35],['T',52],['W',68],['T',48],['F',82],['S',100],['S',73]].map(([d,v],i)=><div className="bar-column" key={i}><div className="bar-bg"><span style={{height:v+'%'}}/></div><small>{d}</small></div>)}</div></section></div></>; }
function AuthPage({mode}) { const [show,setShow]=useState(false); const [sent,setSent]=useState(false); const [busy,setBusy]=useState(false); const nav=useNavigate(); const isRegister=mode==='register'; return <div className="auth-screen"><div className="auth-brand"><Logo/></div><ThemeToggle className="auth-theme"/><div className="auth-card"><div className="auth-icon"><BrainCircuit size={24}/></div><h1>{isRegister?'Create your account':mode==='forgot'?'Reset your password':'Welcome back'}</h1><p>{isRegister?'Start your smarter learning journey with KNOXIA.':mode==='forgot'?'Enter your email and we’ll send you a reset link.':'Sign in to continue learning and growing.'}</p><form onSubmit={e=>{e.preventDefault();if(busy)return;setBusy(true);setTimeout(()=>{setBusy(false);if(mode==='forgot')setSent(true);else nav(mode==='register'?'/onboarding':'/dashboard');},700);}}>{isRegister&&<><label className="field-label">Full name</label><input className="field" required placeholder="Your full name"/></>}<label className="field-label">Email address</label><input className="field" type="email" required placeholder="you@example.com"/>{mode!=='forgot'&&<><label className="field-label">Password</label><div className="password-field"><input className="field" type={show?'text':'password'} required placeholder="Enter your password"/><button type="button" onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></>}{mode==='login'&&<div className="forgot-line"><a href="/forgot-password">Forgot password?</a></div>}<Button type="submit" loading={busy}>{isRegister?'Create account':mode==='forgot'?'Send reset link':'Sign in'}</Button>{sent&&<p className="auth-sent">If an account exists for that email, a reset link is on its way.</p>}</form><div className="auth-switch">{isRegister?'Already have an account?':"Don't have an account?"} <a href={isRegister?'/login':'/register'}>{isRegister?'Sign in':'Create account'}</a></div></div><div className="auth-footer">© 2026 KNOXIA. Learn smarter. Grow together.</div></div>; }
function Landing() { const go=useGo(); return <div className="landing"><header className="landing-nav"><Logo/><div><a href="#features">Features</a><a href="#how">How it works</a><Link to="/login">Sign in</Link><ThemeToggle/><Button variant="outline" onClick={()=>go('/register')}>Create account</Button></div></header>
<section className="hero"><div className="hero-copy"><h1>Turn your lecture notes into reviewers, quizzes and flashcards</h1><p>Upload a PDF, DOCX or PPTX. KNOXIA builds study tools from your own material, then shows which topics to review next.</p><div className="hero-buttons"><Button onClick={()=>go('/register')}>Upload your first file <ArrowUpRight size={18}/></Button><a href="#features">See what you get <ChevronRight size={16}/></a></div></div>
<div className="hero-visual"><div className="shot" aria-label="KNOXIA dashboard preview"><div className="shot-top"><Logo small/><b>Welcome back, Kenneth</b></div><div className="shot-stats"><div><small>Study time</small><b>8h 35m</b></div><div><small>Quiz average</small><b>86.5%</b></div><div className="accent"><small>Streak</small><b>7 days</b></div></div><h3>Recent materials</h3>{[['Introduction to Machine Learning','PDF · 2.4 MB','blue'],['Automata Theory — Module 03','PDF · 1.8 MB','blue'],['Computer Architecture Notes','PPTX · 5.1 MB','orange']].map(([n,m,c])=><div className="shot-row" key={n}><div className={`file-tile ${c}`}><FileText size={18}/></div><span><b>{n}</b><small>{m}</small></span><ArrowUpRight size={16}/></div>)}</div></div></section>
<section className="landing-features" id="features"><h2>Study from your own files, not generic notes</h2><p>Three tools, all built on the material you upload.</p><div className="feature-cards"><div><div className="feature-icon"><Sparkles size={20}/></div><h3>AI study tools</h3><p>Generate a reviewer, flashcard deck or quiz from any file you upload.</p></div><div><div className="feature-icon"><Users size={20}/></div><h3>Learn together</h3><p>Share reviewers with friends and compete on the same quiz.</p></div><div><div className="feature-icon"><ChartNoAxesCombined size={20}/></div><h3>Track your growth</h3><p>See quiz scores by topic and get a list of what to review.</p></div></div></section>
<section className="landing-cta" id="how"><div><h2>Get your first reviewer in minutes</h2><p>Create an account, upload one file, then generate a reviewer, quiz or flashcard deck.</p></div><Button onClick={()=>go('/register')}>Create free account <ArrowUpRight size={18}/></Button></section><footer><Logo/><span>© 2026 KNOXIA. Learn smarter. Grow together.</span><Link to="/login">Sign in</Link></footer></div>; }
function Onboarding() { const go=useGo(); return <div className="auth-screen"><div className="auth-brand"><Logo/></div><ThemeToggle className="auth-theme"/><div className="auth-card"><div className="auth-icon"><GraduationCap size={24}/></div><h1>Let's set up your space</h1><p>Tell us a little about your learning journey.</p><form onSubmit={e=>{e.preventDefault();go('/dashboard');}}><label className="field-label">Year level</label><select className="field"><option>3rd Year</option><option>1st Year</option><option>2nd Year</option><option>4th Year</option></select><label className="field-label">Course / program</label><input className="field" defaultValue="BS Computer Science"/><label className="field-label">Subjects you're studying</label><div className="subject-chips">{['Machine Learning','Automata Theory','Computer Architecture','Cybersecurity','Networks','Software Engineering'].map(x=><label key={x}><input type="checkbox"/>{x}</label>)}</div><Button type="submit">Finish setup <ArrowUpRight size={16}/></Button></form></div><div className="auth-footer">You can update these details anytime in Settings.</div></div>; }
function NotFound() { const go=useGo(); return <div className="not-found"><Logo/><h1>404</h1><h2>Looks like this page got lost.</h2><p>The page you're looking for doesn't exist or may have moved.</p><Button onClick={()=>go('/dashboard')}>Back to dashboard</Button></div>; }

const publicTitles = {'/':'Learn smarter. Grow together.','/login':'Log in','/register':'Create account','/forgot-password':'Forgot password','/reset-password':'Reset password','/verify-email':'Verify your email','/welcome':'Welcome','/terms':'Terms and Conditions','/privacy':'Privacy Policy','/onboarding':'Set up your space'};
function pageTitle(path) {
  if (titleMap[path]) return titleMap[path];
  if (path.startsWith('/materials/')) return 'Material Details';
  if (path.startsWith('/profile')) return 'Profile';
  if (path.startsWith('/reviewers/')) return 'Reviewer Details / Editor';
  if (path.startsWith('/flashcards/')) return path.endsWith('/study') ? 'Flashcard Study Session' : 'Edit Deck';
  if (path.startsWith('/quizzes/')) return path.endsWith('/missed') ? 'Retake Missed Questions' : path.includes('/attempts/') ? 'Quiz Results / Review' : path.endsWith('/edit') ? 'Edit Quiz' : 'Take Quiz';
  if (path.startsWith('/study-rooms/')) return path.includes('/quiz/') ? 'Group Quiz' : 'Study Room Details';
  if (path.startsWith('/challenges/')) return 'Challenge Game / Quiz Battle';
  return 'KNOXIA';
}

// Browser tab title, scroll position and keyboard focus on every navigation.
const scrollStore = new Map(); // history entry key -> scrollY, so Back/Forward land where you left
function RouteEffects() {
  const {pathname,hash,key}=useLocation(); const type=useNavigationType(); const keyRef=useRef(key); const first=useRef(true);
  useEffect(()=>{ if('scrollRestoration' in history) history.scrollRestoration='manual';
    const onScroll=()=>scrollStore.set(keyRef.current,window.scrollY);
    window.addEventListener('scroll',onScroll,{passive:true}); return()=>window.removeEventListener('scroll',onScroll); },[]);
  useLayoutEffect(()=>{
    keyRef.current=key; const p=normalizePath(pathname); const saved=scrollStore.get(key);
    const t=publicTitles[p]||pageTitle(p); document.title=p==='/'?'KNOXIA · '+t:t+' · KNOXIA';
    if(type==='POP'&&saved!=null){ window.scrollTo(0,saved); if(saved>0)setTimeout(()=>{ if(window.scrollY===0)window.scrollTo(0,saved); },500); }
    else if(hash&&document.getElementById(decodeURIComponent(hash.slice(1)))) document.getElementById(decodeURIComponent(hash.slice(1))).scrollIntoView();
    else window.scrollTo(0,0);
    if(!first.current){ const el=document.querySelector('.page-content'); if(el)el.focus({preventScroll:true}); }
    first.current=false;
  },[key]);
  return null;
}
export default function App() { return <><RouteEffects/><AppRoutes/></>; }

function AppRoutes() {
 const loc=useLocation(); const path=loc.pathname; const {isAuthenticated,ready}=useAuth(); const useProfileForAdmin=useProfile(); const role=isDemoAdmin(useProfileForAdmin) ? 'admin' : 'student';
 // Route protection (demo): see src/session.js for which paths are public, guest-only or private.
 if(normalizePath(path)!==path) return <Navigate to={normalizePath(path)+loc.search+loc.hash} replace/>;
 const access=accessFor(path);
 if(!ready) return <div className="auth-screen" role="status">Loading KNOXIA session…</div>;
 if(access==='guest'&&isAuthenticated) return <Navigate to={safeRedirect(loc.state&&loc.state.from, role === 'admin' ? '/admin/dashboard' : '/dashboard')} replace/>;
 if(access==='private'&&!isAuthenticated) return <Navigate to="/login" replace state={{from:{pathname:path,search:loc.search,hash:loc.hash}}}/>;
 const ap=authPage(path); if(ap) return ap;
 if(path==='/') return <Landing/>;
 if(['/login','/register','/forgot-password'].includes(path)) return <AuthPage mode={path==='/register'?'register':path==='/forgot-password'?'forgot':'login'}/>;
 if(path==='/onboarding') return <Onboarding/>;
 if(!isAuthenticated) return <Navigate to="/login" replace/>; // safety net: never render the app shell without a session
 const admin=path.startsWith('/admin');
 const title=pageTitle(path);
 return <Shell admin={admin} title={title}><div className="page-fade" key={path}><Routes>
   <Route path="/dashboard" element={<><Dashboard/><DashboardExtras/></>}/><Route path="/materials" element={<MaterialLibrary/>}/><Route path="/materials/upload" element={<UploadPage/>}/><Route path="/materials/:id" element={<MaterialDetail/>}/>
   <Route path="/reviewers" element={<ReviewerLibrary/>}/><Route path="/reviewers/create" element={<CreateReviewer/>}/><Route path="/reviewers/:id" element={<ReviewerEditor/>}/><Route path="/study-companion" element={<AIStudyCompanion/>}/><Route path="/flashcards" element={<FlashcardLibrary/>}/><Route path="/flashcards/:id" element={<DeckEditor/>}/><Route path="/flashcards/:id/study" element={<FlashStudy/>}/><Route path="/quizzes/create" element={<QuizCreate/>}/><Route path="/quizzes/ai" element={<AIQuizzes/>}/><Route path="/quizzes/ai/:id" element={<AIQuizzes/>}/><Route path="/quizzes/ai/:id/results/:attemptId" element={<AIQuizzes/>}/><Route path="/quizzes/ai/:id/retake/:attemptId" element={<AIQuizzes/>}/><Route path="/quizzes/:id/edit" element={<QuizEditor/>}/><Route path="/quizzes/:id/take" element={<QuizTake/>}/><Route path="/quizzes/attempts" element={<QuizHistory/>}/><Route path="/quizzes/attempts/:id" element={<QuizResults/>}/><Route path="/quizzes/attempts/:id/missed" element={<QuizMissed/>}/>
   <Route path="/feed" element={<Feed/>}/><Route path="/friends" element={<Friends/>}/><Route path="/profile" element={<Profile/>}/><Route path="/profile/:username" element={<Profile/>}/><Route path="/study-rooms" element={<LiveStudyRooms/>}/><Route path="/study-rooms/:id" element={<LiveRoomDetail/>}/><Route path="/study-rooms/:id/quiz/:activityId" element={<GroupQuizPlay/>}/><Route path="/challenges" element={<LiveChallenges/>}/><Route path="/challenges/leaderboard" element={<ChallengeLeaderboard/>}/><Route path="/challenges/:id/play" element={<LiveChallengePlay/>}/>
   <Route path="/progress" element={<StudyProgress/>}/><Route path="/leaderboards" element={<LeaderboardsV2/>}/><Route path="/achievements" element={<Achievements/>}/><Route path="/analytics" element={<Analytics/>}/><Route path="/study-planner" element={<ProductivityPlanner/>}/><Route path="/study-calendar" element={<StudyCalendar/>}/><Route path="/missions" element={<Missions/>}/><Route path="/streaks" element={<StreakPage/>}/>
   <Route path="/settings" element={<ProductivitySettings/>}/><Route path="/notifications" element={<ProductivityNotifications/>}/>
   <Route path="/admin/dashboard" element={role === 'admin' ? <AdminDashboardV7/> : <AdminAccessDenied/>}/><Route path="/admin/users" element={role === 'admin' ? <AdminUsersV7/> : <AdminAccessDenied/>}/><Route path="/admin/moderation" element={role === 'admin' ? <AdminModerationV7/> : <AdminAccessDenied/>}/><Route path="/admin/logs" element={role === 'admin' ? <AdminLogsV7/> : <AdminAccessDenied/>}/><Route path="/admin/analytics" element={role === 'admin' ? <AdminAnalyticsV7/> : <AdminAccessDenied/>}/>
   <Route path="*" element={<NotFound/>}/>
 </Routes></div></Shell>;
}
