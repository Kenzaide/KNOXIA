import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMaterials, toast, previews, colorOf, fmtSize, fmtDate, SUBJECTS } from './materials.jsx';
import { ReviewerEditor, SavedReviewers, RecentAttempts, FlashStudy, QuizTake, QuizResults, StudyRooms, RoomDetail, Challenges, ChallengePlay, Leaderboards, Achievements, Analytics, Planner, Notifications, SettingsPage, Moderation, Logs } from './pages.jsx';
import { saveReviewer, useLocal, NOTES } from './data.js';
import { authPage } from './auth.jsx';
import { Knowl, KnowlAvatar } from './knowl.jsx';
import { ThemeToggle } from './theme.jsx';

let navTo = (p) => { location.href = p; };
const go = (p) => navTo(p);
import {
  LayoutDashboard, FolderOpen, Upload, Sparkles, BookOpen, Layers, BrainCircuit,
  Users, UserRound, MessageSquare, Trophy, Swords, Medal, ChartNoAxesCombined,
  CalendarDays, Settings, Bell, ShieldCheck, ClipboardList, Search, Plus, Menu,
  X, ChevronDown, ChevronRight, FileText, File, MoreHorizontal, ArrowUpRight,
  Clock3, Flame, Target, CheckCircle2, CircleHelp, LogOut, Moon, Sun, Send,
  Paperclip, Play, Bookmark, Download, Filter, SlidersHorizontal, Zap, Star,
  LockKeyhole, Mail, Eye, EyeOff, Home, GraduationCap, Activity, Trash2,
  Pencil, UsersRound, Crown, CalendarCheck, CircleUserRound, AlertCircle
} from 'lucide-react';

const navGroups = [
  { label: 'Overview', items: [
    ['Dashboard','/dashboard',LayoutDashboard],
    ['My Materials','/materials',FolderOpen],
  ]},
  { label: 'AI learning tools', items: [
    ['AI Reviewer','/reviewers/create',Sparkles],
    ['Study Companion','/study-companion',BrainCircuit],
    ['Flashcards','/flashcards',Layers],
    ['Quizzes','/quizzes/create',BookOpen],
  ]},
  { label: 'Social learning', items: [
    ['Learning Feed','/feed',MessageSquare],
    ['Friends','/friends',Users],
    ['Study Rooms','/study-rooms',UserRound],
    ['Challenges','/challenges',Swords],
  ]},
  { label: 'Your progress', items: [
    ['Leaderboards','/leaderboards',Trophy],
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
];
const friends = [
  {name:'Alex Rivera',handle:'@alexrivera',initials:'AR',status:'Studying now',xp:'2,840 XP'},
  {name:'Mika Santos',handle:'@mikas',initials:'MS',status:'Online',xp:'2,510 XP'},
  {name:'Jordan Lee',handle:'@jordanlee',initials:'JL',status:'Last active 2h ago',xp:'1,960 XP'},
];
const titleMap = {
  '/dashboard':'Dashboard','/materials':'My Materials','/materials/upload':'Upload Materials',
  '/reviewers/create':'Create AI Reviewer','/study-companion':'Knowl · Study Companion',
  '/flashcards':'Flashcard Library','/quizzes/create':'Create AI Quiz','/feed':'Learning Feed',
  '/friends':'Friends','/study-rooms':'Study Rooms','/challenges':'Quiz Challenges',
  '/leaderboards':'Leaderboards','/achievements':'Achievements & Badges','/analytics':'Learning Analytics',
  '/study-planner':'Study Planner','/settings':'Settings','/notifications':'Notifications',
  '/admin/dashboard':'Admin Dashboard','/admin/users':'User Management','/admin/moderation':'Content Moderation',
  '/admin/logs':'Activity Logs'
};
function Logo({small=false}) { return <div className="brand"><img className={`brand-logo${small?' small':''}`} src="/logo.png" alt={small?'KNOXIA':''} width={small?28:36} height={small?28:36}/>{!small && <span>KNOXIA</span>}</div>; }
function Avatar({initials='KP',size='md',online=false}) { return <div className={`avatar ${size}`}>{initials}{online&&<i/>}</div>; }
function Button({children,variant='primary',icon:Icon,onClick,type='button',loading=false}) { return <button type={type} onClick={onClick} disabled={loading} className={`btn ${variant}`}>{loading?<i className="spin" aria-hidden="true"/>:Icon&&<Icon size={16}/>}<span>{children}</span></button>; }
// Stand-in for data fetching: shows skeletons briefly until a real API is connected.
function usePending(ms=450) { const [p,setP]=useState(true); useEffect(()=>{const t=setTimeout(()=>setP(false),ms);return()=>clearTimeout(t)},[ms]); return p; }
function PageSkeleton({cards=false}) { return <div aria-busy="true" aria-label="Loading"><div className="skel" style={{height:28,width:240,marginBottom:12}}/><div className="skel" style={{height:16,width:340,marginBottom:24}}/><div className={cards?'material-grid':'stats-grid'}>{Array.from({length:cards?6:4}).map((_,i)=><div className="skel skel-card" key={i} style={{height:cards?176:88}}/>)}</div></div>; }
function Toaster() { const [t,setT]=useState(null); useEffect(()=>{let id; const h=e=>{setT({m:e.detail,k:Date.now()});clearTimeout(id);id=setTimeout(()=>setT(null),2600)}; window.addEventListener('knoxia-toast',h); return()=>{window.removeEventListener('knoxia-toast',h);clearTimeout(id)}},[]); return t?<div className="toast" role="status" key={t.k}><CheckCircle2 size={18}/>{t.m}</div>:null; }
function StatCard({label,value,change,icon:Icon,tone='blue'}) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={18}/></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small className="positive">{change}</small></div></div>; }
function SectionTitle({title,subtitle,action}) { return <div className="section-title"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>; }

function ConfirmDialog({title,body,confirmLabel,onConfirm,onCancel}) {
  const cancelRef=useRef(null); const cancelFn=useRef(onCancel); cancelFn.current=onCancel;
  useEffect(()=>{
    const prev=document.activeElement; cancelRef.current&&cancelRef.current.focus();
    const key=e=>{
      if(e.key==='Escape')cancelFn.current();
      if(e.key==='Tab'){ const f=[...document.querySelectorAll('.dialog button')]; if(!f.length)return;
        const first=f[0],last=f[f.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()} }
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key); prev&&prev.focus&&prev.focus()};
  },[]);
  return createPortal(<div className="dialog-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onCancel()}}>
    <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-body">
      <div className="dialog-icon"><LogOut size={20}/></div><h3 id="dlg-title">{title}</h3><p id="dlg-body">{body}</p>
      <div className="dialog-actions"><button type="button" ref={cancelRef} className="btn outline" onClick={onCancel}>Cancel</button><button type="button" className="btn primary danger" onClick={onConfirm}>{confirmLabel}</button></div>
    </div></div>,document.body);
}
function Sidebar({admin=false,close}) {
  const [confirming,setConfirming]=useState(false); const nav=useNavigate(); const logout=()=>{try{localStorage.removeItem('knoxia-remember')}catch{} close&&close(); nav('/login')};
  return <aside className="sidebar">
    <div className="sidebar-top"><Logo/><button className="mobile-close" onClick={close}><X size={18}/></button></div>
    
    <nav className="side-nav">
      {!admin ? navGroups.map(group=><div className="nav-group" key={group.label}><label>{group.label}</label>{group.items.map(([name,path,Icon])=><NavLink viewTransition key={path} to={path} onClick={close} className={({isActive})=>`nav-link ${isActive?'active':''}`}><Icon size={18}/><span>{name}</span></NavLink>)}</div>) :
      <div className="nav-group"><label>Administration</label>{adminNav.map(([name,path,Icon])=><NavLink viewTransition key={path} to={path} onClick={close} className={({isActive})=>`nav-link ${isActive?'active':''}`}><Icon size={18}/><span>{name}</span></NavLink>)}</div>}
    </nav>
    <div className="sidebar-bottom">
      
      <NavLink viewTransition to="/settings" className="nav-link"><Settings size={18}/><span>Settings</span></NavLink>
      <button type="button" className="nav-link logout" onClick={()=>setConfirming(true)}><LogOut size={18}/><span>Log out</span></button>
      {confirming&&<ConfirmDialog title="Log out of KNOXIA?" body="You will need to sign in again to continue studying." confirmLabel="Log out" onConfirm={()=>{setConfirming(false);logout()}} onCancel={()=>setConfirming(false)}/>}
      <div className="side-user"><Avatar initials={admin?'AD':'KP'} online/><div><b>{admin?'Admin User':'Kenneth Punla'}</b><small>{admin?'Administrator':'3rd Year • BSCS'}</small></div><MoreHorizontal size={18}/></div>
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
  const [items,setItems]=useLocal('knoxia-notes',NOTES);
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
  return <header className="topbar"><div className="top-left"><button className="menu-btn" onClick={onMenu}><Menu size={20}/></button><div className="crumb"><b>{title}</b></div></div><div className="top-actions"><Clock/><div className="top-search"><Search size={16}/><input placeholder="Search anything..." value={search} onChange={e=>setSearch(e.target.value)}/></div><ThemeToggle/><NotificationBell/><div className="top-divider"/><Avatar initials={admin?'AD':'KP'} size="sm"/></div></header>;
}
function Shell({children,admin=false,title}) {
  const [open,setOpen]=useState(false);
  return <div className="app-shell"><Sidebar admin={admin} close={()=>setOpen(false)}/>{open&&<div className="mobile-shade" onClick={()=>setOpen(false)}/>}<div className={`mobile-sidebar ${open?'show':''}`}><Sidebar admin={admin} close={()=>setOpen(false)}/></div><main className="main-area"><Topbar title={title} admin={admin} onMenu={()=>setOpen(true)}/><div className="page-content">{children}</div><Toaster/></main></div>;
}

const TIPS=[
  'Quiz yourself before rereading. Recalling beats reviewing.',
  'Study in 25-minute blocks, then take a 5-minute break.',
  'Explain a topic out loud as if teaching it. Gaps show up fast.',
  'Review tonight what you learned today. It sticks longer.',
];
const greetingFor=h=>h<5?'Still up':h<12?'Good morning':h<18?'Good afternoon':'Good evening';
function Dashboard() {
  const {items}=useMaterials(); const loading=usePending();
  const [said,setSaid]=useState(null); const [clicks,setClicks]=useState(0); const [focusing,setFocusing]=useState(false);
  const hour=new Date().getHours(); const night=hour>=22||hour<5;
  const goal={done:45,total:60}; const left=Math.max(0,goal.total-goal.done); const pct=Math.round(goal.done/goal.total*100);
  const streak=7; const first=items[0];
  const resting=night?{pose:'sleepy',text:"It's late, Kenneth. Review something short, then get some sleep."}
    :left===0?{pose:'happy',text:"Goal reached! Great work today."}
    :items.length===0?{pose:'think',text:"Upload a file and I'll help you turn it into a reviewer."}
    :{pose:'default',text:`Hoot! ${left} more minutes and today's goal is done.`};
  // Clicking Knowl cycles through a few reactions.
  const poke=()=>{
    const tip=TIPS[Math.floor(clicks/4)%TIPS.length];
    const reactions=[
      {pose:'happy',text:`${streak}-day streak. Keep it going!`},
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
        <h1>{greetingFor(hour)}, Kenneth</h1>
        <p className="kn-sub">{items.length} {items.length===1?'material is':'materials are'} ready to study.</p>
        <div className="kn-goal"><div className="kn-goal-top"><b>Today's goal</b><span>{goal.done} of {goal.total} min</span></div><div className="goal-progress" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label="Daily goal"><span style={{width:pct+'%'}}/></div></div>
        <div className="kn-actions">
          <button type="button" className="btn primary" onClick={()=>go('/study-companion')} onMouseEnter={()=>setFocusing(true)} onMouseLeave={()=>setFocusing(false)} onFocus={()=>setFocusing(true)} onBlur={()=>setFocusing(false)}><Zap size={16}/><span>Start a focus session</span></button>
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
      <section className="panel"><SectionTitle title="This week" action={<NavLink viewTransition to="/analytics">Details</NavLink>}/>
        {[[Flame,'orange',`${streak} days`,'Study streak. Best is 12.'],[Target,'green','86.5%','Quiz average, up 4.2%.'],[Clock3,'blue','8h 35m','Studied, up 18% on last week.']].map(([I,tone,v,l])=><div className="kn-stat" key={l}><div className={`activity-dot ${tone}`}><I size={18}/></div><div><b>{v}</b><small>{l}</small></div></div>)}
      </section>
    </div>
  </>;
}
function Materials() {
  const {items,remove}=useMaterials(); const loading=usePending();
  const [q,setQ]=useState(''); const [subject,setSubject]=useState('All'); const [sort,setSort]=useState('newest');
  const subjects=['All',...new Set(items.map(m=>m.subject))];
  const list=items.filter(m=>(subject==='All'||m.subject===subject)&&(m.name+' '+m.subject+' '+(m.desc||'')).toLowerCase().includes(q.toLowerCase()))
    .sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='subject'?a.subject.localeCompare(b.subject):new Date(b.uploaded)-new Date(a.uploaded));
  if(loading) return <PageSkeleton cards/>;
  return <><SectionTitle title="My Materials" subtitle={`${items.length} ${items.length===1?'file':'files'} in your library.`} action={<Button icon={Upload} onClick={()=>go('/materials/upload')}>Upload material</Button>}/>
    <div className="toolbar"><div className="search-field"><Search size={16}/><input placeholder="Search your materials..." value={q} onChange={e=>setQ(e.target.value)}/></div>
      <select className="filter-btn" aria-label="Filter by subject" value={subject} onChange={e=>setSubject(e.target.value)}>{subjects.map(x=><option key={x}>{x}</option>)}</select>
      <select className="filter-btn" aria-label="Sort materials" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="name">Name</option><option value="subject">Subject</option></select></div>
    <div className="material-grid">{list.map(m=><div className="material-card" key={m.id}><div className="material-card-top"><div className={`file-tile ${m.color||colorOf(m.type)}`}><FileText size={20}/></div><button className="plain-icon" aria-label={`Delete ${m.name}`} onClick={()=>{if(confirm(`Delete "${m.name}"?`)){remove(m.id);toast('Material deleted')}}}><Trash2 size={18}/></button></div>
      <h3>{m.name}</h3><p>{m.subject}</p><div className="material-meta"><span>{m.type} · {m.size}</span><span>{fmtDate(m.uploaded)}</span></div>
      <div className="material-actions"><button onClick={()=>go('/materials/'+m.id)}>Open material <ArrowUpRight size={16}/></button></div></div>)}</div>
    {list.length===0&&<div className="empty-state"><FolderOpen size={32}/><b>{items.length?'No materials found':'No materials yet'}</b><p>{items.length?'Try another search or filter.':'Upload your first file to get started.'}</p>{!items.length&&<Button icon={Upload} onClick={()=>go('/materials/upload')}>Upload material</Button>}</div>}</>;
}
function UploadPage() {
  const {items,add}=useMaterials(); const timer=useRef(null);
  const [file,setFile]=useState(null); const [drag,setDrag]=useState(false); const [title,setTitle]=useState('');
  const [subject,setSubject]=useState(SUBJECTS[0]); const [desc,setDesc]=useState(''); const [error,setError]=useState(''); const [notice,setNotice]=useState(''); const [progress,setProgress]=useState(null);
  useEffect(()=>()=>clearInterval(timer.current),[]);
  const pick=f=>{ if(!f)return; const ext=f.name.split('.').pop().toUpperCase(); setNotice('');
    if(!['PDF','DOCX','PPTX'].includes(ext)){setError('Unsupported file type. Please choose a PDF, DOCX or PPTX file.');return}
    if(f.size>25*1048576){setError('This file is larger than 25 MB.');return}
    setError(''); setFile(f); setTitle(f.name.replace(/\.[^.]+$/,''));
    if(items.some(m=>m.fileName===f.name&&m.size===fmtSize(f.size)))setNotice('This looks like a file you already uploaded. You can still continue.'); };
  const start=()=>{ if(!file||progress!==null)return; let p=0; setProgress(0);
    timer.current=setInterval(()=>{ p+=14; if(p>=100){ clearInterval(timer.current); const type=file.name.split('.').pop().toUpperCase();
      const item=add({name:title.trim()||file.name,fileName:file.name,type,size:fmtSize(file.size),subject,desc:desc.trim(),color:colorOf(type)});
      previews.set(item.id,URL.createObjectURL(file)); toast('Material uploaded'); go('/materials/'+item.id); } else setProgress(p); },150); };
  return <><SectionTitle title="Upload Materials" subtitle="Add your files and let KNOXIA turn them into useful study resources."/><div className="upload-layout"><div className="upload-main">
    <div className={`drop-zone ${drag?'drag':''}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);pick(e.dataTransfer.files[0])}}>
      <div className="upload-icon"><Upload size={24}/></div><h2>Drag and drop your files here</h2><p>or choose a file from your device</p>
      <label className="btn primary">Browse files<input type="file" hidden accept=".pdf,.docx,.pptx" onChange={e=>pick(e.target.files[0])}/></label>
      <small>Supported formats: PDF, DOCX, PPTX · Maximum 25 MB</small>
      {file&&<div className="selected-file"><FileText size={18}/><span>{file.name} · {fmtSize(file.size)}</span><button aria-label="Remove file" onClick={()=>{setFile(null);setNotice('')}}><X size={16}/></button></div>}
      {error&&<div className="notice error"><AlertCircle size={16}/>{error}</div>}{notice&&<div className="notice"><AlertCircle size={16}/>{notice}</div>}</div>
    <div className="panel upload-form"><h3>Material details</h3>
      <label className="ufield"><span>Title</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Choose a file first" disabled={!file}/></label>
      <label className="ufield"><span>Subject</span><select value={subject} onChange={e=>setSubject(e.target.value)}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="ufield"><span>Description (optional)</span><textarea rows="2" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What is this material about?"/></label>
      {progress!==null&&<div><div className="progress-track"><span style={{width:progress+'%'}}/></div><small className="muted">Uploading and processing… {progress}%</small></div>}
      <div className="form-actions"><Button variant="outline" onClick={()=>go('/materials')}>Cancel</Button><Button icon={Upload} loading={progress!==null} onClick={start}>{progress!==null?'Uploading…':'Upload material'}</Button></div></div></div>
    <div className="panel upload-tips"><h3><Sparkles size={18}/> What happens next?</h3><ol><li><b>Upload your material</b><span>Choose a lecture file or class notes.</span></li><li><b>AI processes the content</b><span>KNOXIA extracts and organizes the key information.</span></li><li><b>Start learning</b><span>Generate reviewers, flashcards, and practice quizzes.</span></li></ol><div className="privacy-note"><LockKeyhole size={16}/> Your learning materials are private by default.</div></div></div></>;
}

function CreateReviewer() {
 const [style,setStyle]=useState('Detailed reviewer'); const [topic,setTopic]=useState(''); const [rt,setRt]=useState('My study reviewer'); const [file,setFile]=useState('Introduction to Machine Learning');
 return <><SectionTitle title="Create AI Reviewer" subtitle="Turn your learning materials into a reviewer that works for you."/><div className="builder-layout"><div className="panel builder-form"><label className="field-label">Reviewer title</label><input className="field" value={rt} onChange={e=>setRt(e.target.value)}/><label className="field-label">Choose a source material</label><select className="field" value={file} onChange={e=>setFile(e.target.value)}><option>Introduction to Machine Learning</option><option>Automata Theory — Module 03</option><option>Computer Architecture Notes</option></select><label className="field-label">Reviewer format</label><div className="choice-grid">{['Quick summary','Detailed reviewer','Exam cram','Topic-by-topic'].map(x=><button className={`choice ${style===x?'chosen':''}`} onClick={()=>setStyle(x)} key={x}><BookOpen size={18}/><b>{x}</b><small>{x==='Quick summary'?'Key ideas at a glance':x==='Detailed reviewer'?'Comprehensive notes and examples':x==='Exam cram'?'Important points before exams':'Organized by lesson topic'}</small></button>)}</div><label className="field-label">Additional instructions <span>Optional</span></label><textarea className="field textarea" placeholder="e.g. Focus on definitions and real-world examples..." value={topic} onChange={e=>setTopic(e.target.value)}/><Button icon={Sparkles} onClick={()=>go('/reviewers/'+saveReviewer({title:rt.trim()||'My study reviewer',file,style,notes:topic}))}>Generate reviewer</Button></div><div className="panel preview-panel"><div className="preview-icon"><Sparkles size={20}/></div><h3>Your reviewer preview</h3><p>Your generated reviewer will appear here, organized into clear sections with key terms, explanations, and examples.</p><div className="preview-lines"><i/><i/><i/><i/><i/></div><div className="preview-badges"><span>Key concepts</span><span>Definitions</span><span>Examples</span></div></div></div><SavedReviewers/></>;
}
function Companion() {
 const [messages,setMessages]=useState([{role:'assistant',text:'Hoot! I’m Knowl, your KNOXIA Study Companion. 🦉 Ask me anything about your uploaded materials, or tell me what topic you want to understand better.'}]); const [text,setText]=useState(''); const [pose,setPose]=useState('happy'); const [thinking,setThinking]=useState(false);
 const timer=useRef(null); useEffect(()=>()=>clearTimeout(timer.current),[]);
 const send=()=>{if(!text.trim()||thinking)return;setMessages(m=>[...m,{role:'user',text}]);setText('');setThinking(true);setPose('think');
  timer.current=setTimeout(()=>{setMessages(m=>[...m,{role:'assistant',text:'That’s a great question! This is a preview of Knowl. Connect an AI API and your uploaded study materials to receive grounded explanations and source references.'}]);setThinking(false);setPose('happy');},900);};
 return <><SectionTitle title="Knowl, your Study Companion" subtitle="Your personal learning assistant, ready when you are."/><div className="chat-layout"><div className="chat-main panel"><div className="chat-header"><KnowlAvatar pose={pose} size={40}/><div><b>Knowl · KNOXIA Companion</b><small><i/> {thinking?'Thinking…':'Ready to help'}</small></div><button className="plain-icon" aria-label="More options"><MoreHorizontal/></button></div><div className="chat-messages" aria-live="polite">{messages.map((m,i)=><div className={`message ${m.role}`} key={i}>{m.role==='assistant'&&<KnowlAvatar pose="default" size={30} className="mini"/>}<div className="bubble">{m.text}</div></div>)}{thinking&&<div className="message assistant"><KnowlAvatar pose="think" size={30} className="mini"/><div className="bubble typing" aria-label="Knowl is thinking"><i/><i/><i/></div></div>}</div><div className="suggestions"><button onClick={()=>setText('Explain supervised learning in simple terms')}>Explain a concept</button><button onClick={()=>setText('Give me an example of a finite automaton')}>Give me an example</button><button onClick={()=>setText('Create a quick practice question')}>Test my knowledge</button></div><div className="chat-input"><button className="plain-icon" aria-label="Attach file"><Paperclip size={18}/></button><input placeholder="Ask Knowl anything about your lessons..." value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}/><button className="send-btn" onClick={send} aria-label="Send"><Send size={18}/></button></div></div><div className="panel chat-context"><div className="companion-knowl"><Knowl pose={pose} label="Knowl the owl. Click to make Knowl hop."/></div><h3>Study context</h3><p>Choose the materials Knowl should use.</p><div className="context-file"><FileText size={18}/><span>Introduction to Machine Learning</span><CheckCircle2 size={16}/></div><div className="context-file"><FileText size={18}/><span>Automata Theory — Module 03</span><CheckCircle2 size={16}/></div><Button variant="soft" icon={Plus} onClick={()=>go('/materials')}>Manage materials</Button><div className="grounding-note"><ShieldCheck size={16}/><span>Answers can be grounded in selected materials when AI integration is enabled.</span></div></div></div></>; }
function Flashcards() { return <><SectionTitle title="Flashcard Library" subtitle="Practice active recall and make knowledge stick." action={<Button icon={Plus} onClick={()=>alert('Demo: flashcard deck creation will be connected to the backend.')}>Create deck</Button>}/><div className="stats-grid compact"><StatCard label="Total decks" value="8" change="Across 4 subjects" icon={Layers}/><StatCard label="Cards mastered" value="126" change="+18 this week" icon={CheckCircle2} tone="green"/><StatCard label="Due for review" value="24" change="Keep your streak!" icon={Clock3} tone="orange"/></div><div className="deck-grid">{[['Machine Learning Fundamentals','32 cards','AI & Data Science','blue','68%'],['Automata Theory','24 cards','Computer Science','purple','42%'],['Cybersecurity Essentials','40 cards','Information Security','green','82%'],['Computer Architecture','30 cards','Computer Systems','orange','25%']].map((d,i)=><div className="deck-card panel" key={d[0]}><div className={`deck-art ${d[3]}`}><Layers size={24}/><span>{d[1]}</span></div><div className="deck-info"><small>{d[2]}</small><h3>{d[0]}</h3><div className="progress-track"><span style={{width:d[4]}}/></div><div className="deck-bottom"><span>{d[4]} mastered</span><button onClick={()=>go('/flashcards/'+(i+1)+'/study')}>Study deck <ArrowUpRight size={16}/></button></div></div></div>)}</div></>; }
function QuizCreate() { const [count,setCount]=useState('10'); const [difficulty,setDifficulty]=useState('Mixed'); return <><SectionTitle title="Create AI Quiz" subtitle="Check your understanding with a personalized practice quiz."/><div className="builder-layout"><div className="panel builder-form"><label className="field-label">Quiz title</label><input className="field" defaultValue="Practice Quiz — Machine Learning"/><label className="field-label">Source material</label><select className="field"><option>Introduction to Machine Learning</option><option>Automata Theory — Module 03</option></select><label className="field-label">Number of questions</label><div className="segmented">{['5','10','15','20','30'].map(n=><button className={count===n?'selected':''} onClick={()=>setCount(n)} key={n}>{n}</button>)}</div><label className="field-label">Difficulty</label><div className="segmented">{['Easy','Mixed','Hard'].map(n=><button className={difficulty===n?'selected':''} onClick={()=>setDifficulty(n)} key={n}>{n}</button>)}</div><label className="field-label">Question types</label><div className="check-list"><label><input type="checkbox" defaultChecked/> Multiple choice</label><label><input type="checkbox" defaultChecked/> True or false</label><label><input type="checkbox"/> Identification</label><label><input type="checkbox"/> Situational</label></div><Button icon={Sparkles} onClick={()=>go('/quizzes/ml-'+count+'/take')}>Generate quiz</Button></div><div className="panel preview-panel"><div className="preview-icon"><BrainCircuit size={20}/></div><h3>Quiz settings</h3><p>Your quiz will be generated from your selected material.</p><div className="setting-line"><span>Questions</span><b>{count}</b></div><div className="setting-line"><span>Difficulty</span><b>{difficulty}</b></div><div className="setting-line"><span>Estimated time</span><b>{Number(count)*1.2|0} min</b></div><div className="privacy-note"><CheckCircle2 size={16}/> Answers include explanations after submission.</div></div></div><RecentAttempts/></>; }
function Feed() { const posts=[['MS','Mika Santos','2 hours ago','Finally understood the difference between DFA and NFA after making my own visual notes. Sharing this in case anyone needs it!',['Automata Theory','Study tips'],'18'],['AR','Alex Rivera','Yesterday','Small progress today: finished my Machine Learning reviewer and scored 9/10 on my practice quiz. Keep going, everyone!',['Machine Learning','Progress'],'24'],['JL','Jordan Lee','2 days ago','Looking for study buddies for our Computer Architecture exam next week. Anyone interested?',['Study group'],'12']]; return <><SectionTitle title="Learning Feed" subtitle="See what your learning community is up to." action={<Button icon={Plus} onClick={()=>alert('Demo: post composer coming soon.')}>Create post</Button>}/><div className="social-layout"><div className="feed-column">{posts.map((p,i)=><div className="panel post-card" key={i}><div className="post-head"><Avatar initials={p[0]}/><div><b>{p[1]}</b><small>{p[2]}</small></div><button className="plain-icon"><MoreHorizontal/></button></div><p>{p[3]}</p><div className="post-tags">{p[4].map(t=><span key={t}>{t}</span>)}</div><div className="post-actions"><button><Star size={16}/> {p[5]} Likes</button><button><MessageSquare size={16}/> Comment</button><button><Bookmark size={16}/> Save</button></div></div>)}</div><div className="panel community-card"><h3>People to connect with</h3>{friends.map(f=><div className="friend-row" key={f.handle}><Avatar initials={f.initials}/><div><b>{f.name}</b><small>{f.handle}</small></div><button className="small-outline">Add</button></div>)}<a href="/friends">Find more friends <ArrowUpRight size={16}/></a></div></div></>; }
function Friends() { const [tab,setTab]=useState('All friends'); return <><SectionTitle title="Friends" subtitle="Build your learning circle and grow together." action={<Button icon={Plus} onClick={()=>alert('Demo: search users to send a friend request.')}>Find friends</Button>}/><div className="tabs">{['All friends','Requests','Sent'].map(t=><button className={tab===t?'active':''} onClick={()=>setTab(t)} key={t}>{t}</button>)}</div><div className="friend-grid">{friends.map(f=><div className="panel friend-card" key={f.handle}><Avatar initials={f.initials} size="lg" online/><h3>{f.name}</h3><p>{f.handle}</p><span className="friend-status">{f.status}</span><div className="friend-xp"><Zap size={16}/> {f.xp}</div><div className="friend-buttons"><Button variant="soft" onClick={()=>go('/profile/'+f.handle.slice(1))}>View profile</Button><Button variant="outline" onClick={()=>alert('Demo: message feature coming soon.')}>Message</Button></div></div>)}</div></>; }
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
function MaterialDetail() {
  const {id}=useParams(); const {items,update,remove}=useMaterials(); const m=items.find(x=>x.id===id);
  const [editing,setEditing]=useState(false); const [name,setName]=useState('');
  if(!m) return <div className="empty-state"><FolderOpen size={32}/><b>Material not found</b><p>It may have been deleted.</p><Button onClick={()=>go('/materials')}>Back to My Materials</Button></div>;
  const url=previews.get(m.id);
  const save=e=>{e.preventDefault(); if(name.trim()){update(m.id,{name:name.trim()});toast('Title updated')} setEditing(false);};
  return <><SectionTitle title="Material Details" subtitle="Review your uploaded learning material." action={<div className="head-actions"><Button variant="outline" icon={Pencil} onClick={()=>{setName(m.name);setEditing(true)}}>Rename</Button><Button variant="outline" icon={Trash2} onClick={()=>{if(confirm(`Delete "${m.name}"?`)){remove(m.id);toast('Material deleted');go('/materials')}}}>Delete</Button></div>}/>
    <div className="panel detail-panel"><div className={`file-tile ${m.color||colorOf(m.type)}`}><FileText size={24}/></div><div>
      {editing?<form className="rename-form" onSubmit={save}><input autoFocus aria-label="Material title" value={name} onChange={e=>setName(e.target.value)}/><Button type="submit">Save</Button><Button variant="outline" onClick={()=>setEditing(false)}>Cancel</Button></form>:<h2>{m.name}</h2>}
      <p>{m.type} · {m.size} · Uploaded {fmtDate(m.uploaded)}</p>{m.desc&&<p>{m.desc}</p>}
      <div className="post-tags"><span>{m.subject}</span></div></div></div>
    <div className="detail-grid"><div className="panel"><h3>Document preview</h3>{url&&m.type==='PDF'?<iframe className="doc-frame" title="Document preview" src={url}/>:<div className="empty-state"><FileText size={32}/><b>{url?'Preview is available for PDF files':'Preview not available'}</b><p>{url?'Your file is saved in this session.':'Original files are not stored yet. Re-upload to preview in this session.'}</p></div>}</div>
    <div className="panel"><h3>Extracted text</h3><p className="muted">Sample text. Real extraction will appear here once the backend is connected.</p><pre className="extract">{`${m.name}\n\n${m.subject}\n\nKey topics, definitions and examples from this material will be listed here so KNOXIA can build reviewers, flashcards and quizzes from them.`}</pre></div></div>
    <div className="quick-tools"><div className="panel quick-tool"><Sparkles/><h3>Generate reviewer</h3><p>Create organized notes from this material.</p><Button variant="soft" onClick={()=>go('/reviewers/create')}>Create reviewer</Button></div><div className="panel quick-tool"><BookOpen/><h3>Generate quiz</h3><p>Test your knowledge with practice questions.</p><Button variant="soft" onClick={()=>go('/quizzes/create')}>Create quiz</Button></div><div className="panel quick-tool"><BrainCircuit/><h3>Ask AI</h3><p>Get help understanding difficult concepts.</p><Button variant="soft" onClick={()=>go('/study-companion')}>Ask companion</Button></div></div></>;
}
function StudyMode({type}) { const [revealed,setRevealed]=useState(false); return <><SectionTitle title={type==='flash'?'Flashcard Study Session':type==='quiz'?'Take Quiz':type==='result'?'Quiz Results':'Study Session'} subtitle="Focus on understanding, one question at a time."/><div className="study-center"><div className="study-progress"><span>Question 1 of 10</span><span>10% complete</span></div><div className="progress-track"><span style={{width:'10%'}}/></div><div className="panel study-card">{type==='flash'?<><small>FLASHCARD · MACHINE LEARNING</small><h2>What is supervised learning?</h2>{revealed&&<p className="answer-reveal">A type of machine learning where a model learns from labeled training data.</p>}<Button onClick={()=>setRevealed(!revealed)}>{revealed?'Hide answer':'Reveal answer'}</Button></>:<><small>QUESTION 01 · MULTIPLE CHOICE</small><h2>Which of the following best describes supervised learning?</h2>{['Learning from labeled data','Learning without any data','Learning through rewards only','Learning by random guessing'].map((x,i)=><button className="answer-option" key={x} onClick={e=>e.currentTarget.classList.toggle('picked')}><span>{String.fromCharCode(65+i)}</span>{x}</button>)}<Button onClick={()=>alert('Demo: answer submission is not connected.')}>Submit answer</Button></>}</div><div className="study-footer"><span>Take your time. Learning is a process.</span><Button variant="outline" onClick={()=>go('/dashboard')}>Exit session</Button></div></div></>; }
function Profile() { const {username}=useParams(); return <><div className="panel profile-cover"><div className="profile-avatar"><Avatar initials={(username||'KP').slice(0,2).toUpperCase()} size="xl"/></div><div className="profile-info"><h1>{username||'kennethpunla'}</h1><p>@{username||'kennethpunla'} · 3rd Year BSCS</p><span>Learning every day, one concept at a time.</span></div><Button variant="outline">Add friend</Button></div><div className="stats-grid compact"><StatCard label="Total XP" value="3,240" change="Level 8" icon={Zap}/><StatCard label="Achievements" value="12" change="Collected badges" icon={Medal} tone="orange"/><StatCard label="Study streak" value="7 days" change="Current streak" icon={Flame} tone="green"/></div></>; }
function AdminUsers() { return <><SectionTitle title="User Management" subtitle="View and manage registered KNOXIA accounts." action={<Button icon={Plus}>Add user</Button>}/><div className="toolbar"><div className="search-field"><Search size={16}/><input placeholder="Search users..."/></div><button className="filter-btn"><Filter size={16}/> All roles</button></div><div className="panel table-panel"><table><thead><tr><th>USER</th><th>ROLE</th><th>STATUS</th><th>JOINED</th><th>ACTION</th></tr></thead><tbody>{[['Kenneth Punla','kenneth@example.com','Student','Active','Nov 01, 2026'],['Mika Santos','mika@example.com','Student','Active','Oct 28, 2026'],['Alex Rivera','alex@example.com','Student','Active','Oct 21, 2026'],['Jordan Lee','jordan@example.com','Moderator','Pending','Oct 19, 2026']].map((u,i)=><tr key={u[0]}><td><div className="table-user"><Avatar initials={u[0].split(' ').map(x=>x[0]).join('')}/><div><b>{u[0]}</b><small>{u[1]}</small></div></div></td><td>{u[2]}</td><td><span className={`status-pill ${u[3].toLowerCase()}`}>{u[3]}</span></td><td>{u[4]}</td><td><button className="plain-icon"><MoreHorizontal/></button></td></tr>)}</tbody></table></div></>; }
function AdminDashboard() { return <><div className="welcome-row"><div><h1>Platform overview</h1><p>Monitor KNOXIA activity and keep the community healthy.</p></div><Button variant="outline" icon={Download}>Export report</Button></div><div className="stats-grid"><StatCard label="Registered users" value="1,284" change="↑ 8.2% this month" icon={Users}/><StatCard label="Active today" value="326" change="↑ 12.4% today" icon={Activity} tone="green"/><StatCard label="Materials uploaded" value="4,892" change="+184 this week" icon={FolderOpen} tone="purple"/><StatCard label="Reports pending" value="07" change="Requires attention" icon={AlertCircle} tone="orange"/></div><div className="dashboard-grid"><section className="panel activity-panel"><SectionTitle title="Recent platform activity" subtitle="Latest system events."/><div className="activity-row"><div className="activity-dot blue"><UserRound size={16}/></div><div><b>New user registered</b><small>Mika Santos joined KNOXIA</small></div><time>5 min ago</time></div><div className="activity-row"><div className="activity-dot green"><Upload size={16}/></div><div><b>Materials uploaded</b><small>3 new learning resources</small></div><time>22 min ago</time></div><div className="activity-row"><div className="activity-dot orange"><ShieldCheck size={16}/></div><div><b>Content reported</b><small>A post needs moderator review</small></div><time>1 hour ago</time></div></section><section className="panel weekly-panel"><SectionTitle title="Platform growth" subtitle="New registrations this week."/><div className="weekly-total"><b>+126</b><span className="positive">↑ 8.2%</span></div><div className="bar-chart">{[['M',35],['T',52],['W',68],['T',48],['F',82],['S',100],['S',73]].map(([d,v],i)=><div className="bar-column" key={i}><div className="bar-bg"><span style={{height:v+'%'}}/></div><small>{d}</small></div>)}</div></section></div></>; }
function AuthPage({mode}) { const [show,setShow]=useState(false); const [sent,setSent]=useState(false); const [busy,setBusy]=useState(false); const nav=useNavigate(); const isRegister=mode==='register'; return <div className="auth-screen"><div className="auth-brand"><Logo/></div><ThemeToggle className="auth-theme"/><div className="auth-card"><div className="auth-icon"><BrainCircuit size={24}/></div><h1>{isRegister?'Create your account':mode==='forgot'?'Reset your password':'Welcome back'}</h1><p>{isRegister?'Start your smarter learning journey with KNOXIA.':mode==='forgot'?'Enter your email and we’ll send you a reset link.':'Sign in to continue learning and growing.'}</p><form onSubmit={e=>{e.preventDefault();if(busy)return;setBusy(true);setTimeout(()=>{setBusy(false);if(mode==='forgot')setSent(true);else nav(mode==='register'?'/onboarding':'/dashboard');},700);}}>{isRegister&&<><label className="field-label">Full name</label><input className="field" required placeholder="Your full name"/></>}<label className="field-label">Email address</label><input className="field" type="email" required placeholder="you@example.com"/>{mode!=='forgot'&&<><label className="field-label">Password</label><div className="password-field"><input className="field" type={show?'text':'password'} required placeholder="Enter your password"/><button type="button" onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></>}{mode==='login'&&<div className="forgot-line"><a href="/forgot-password">Forgot password?</a></div>}<Button type="submit" loading={busy}>{isRegister?'Create account':mode==='forgot'?'Send reset link':'Sign in'}</Button>{sent&&<p className="auth-sent">If an account exists for that email, a reset link is on its way.</p>}</form><div className="auth-switch">{isRegister?'Already have an account?':"Don't have an account?"} <a href={isRegister?'/login':'/register'}>{isRegister?'Sign in':'Create account'}</a></div></div><div className="auth-footer">© 2026 KNOXIA. Learn smarter. Grow together.</div></div>; }
function Landing() { return <div className="landing"><header className="landing-nav"><Logo/><div><a href="#features">Features</a><a href="#how">How it works</a><a href="/login">Sign in</a><ThemeToggle/><Button variant="outline" onClick={()=>go('/register')}>Create account</Button></div></header>
<section className="hero"><div className="hero-copy"><h1>Turn your lecture notes into reviewers, quizzes and flashcards</h1><p>Upload a PDF, DOCX or PPTX. KNOXIA builds study tools from your own material, then shows which topics to review next.</p><div className="hero-buttons"><Button onClick={()=>go('/register')}>Upload your first file <ArrowUpRight size={18}/></Button><a href="#features">See what you get <ChevronRight size={16}/></a></div></div>
<div className="hero-visual"><div className="shot" aria-label="KNOXIA dashboard preview"><div className="shot-top"><Logo small/><b>Welcome back, Kenneth</b></div><div className="shot-stats"><div><small>Study time</small><b>8h 35m</b></div><div><small>Quiz average</small><b>86.5%</b></div><div className="accent"><small>Streak</small><b>7 days</b></div></div><h3>Recent materials</h3>{[['Introduction to Machine Learning','PDF · 2.4 MB','blue'],['Automata Theory — Module 03','PDF · 1.8 MB','blue'],['Computer Architecture Notes','PPTX · 5.1 MB','orange']].map(([n,m,c])=><div className="shot-row" key={n}><div className={`file-tile ${c}`}><FileText size={18}/></div><span><b>{n}</b><small>{m}</small></span><ArrowUpRight size={16}/></div>)}</div></div></section>
<section className="landing-features" id="features"><h2>Study from your own files, not generic notes</h2><p>Three tools, all built on the material you upload.</p><div className="feature-cards"><div><div className="feature-icon"><Sparkles size={20}/></div><h3>AI study tools</h3><p>Generate a reviewer, flashcard deck or quiz from any file you upload.</p></div><div><div className="feature-icon"><Users size={20}/></div><h3>Learn together</h3><p>Share reviewers with friends and compete on the same quiz.</p></div><div><div className="feature-icon"><ChartNoAxesCombined size={20}/></div><h3>Track your growth</h3><p>See quiz scores by topic and get a list of what to review.</p></div></div></section>
<section className="landing-cta" id="how"><div><h2>Get your first reviewer in minutes</h2><p>Create an account, upload one file, then generate a reviewer, quiz or flashcard deck.</p></div><Button onClick={()=>go('/register')}>Create free account <ArrowUpRight size={18}/></Button></section><footer><Logo/><span>© 2026 KNOXIA. Learn smarter. Grow together.</span><a href="/login">Sign in</a></footer></div>; }
function Onboarding() { return <div className="auth-screen"><div className="auth-brand"><Logo/></div><ThemeToggle className="auth-theme"/><div className="auth-card"><div className="auth-icon"><GraduationCap size={24}/></div><h1>Let's set up your space</h1><p>Tell us a little about your learning journey.</p><form onSubmit={e=>{e.preventDefault();go('/dashboard');}}><label className="field-label">Year level</label><select className="field"><option>3rd Year</option><option>1st Year</option><option>2nd Year</option><option>4th Year</option></select><label className="field-label">Course / program</label><input className="field" defaultValue="BS Computer Science"/><label className="field-label">Subjects you're studying</label><div className="subject-chips">{['Machine Learning','Automata Theory','Computer Architecture','Cybersecurity','Networks','Software Engineering'].map(x=><label key={x}><input type="checkbox"/>{x}</label>)}</div><Button type="submit">Finish setup <ArrowUpRight size={16}/></Button></form></div><div className="auth-footer">You can update these details anytime in Settings.</div></div>; }
function NotFound() { return <div className="not-found"><Logo/><h1>404</h1><h2>Looks like this page got lost.</h2><p>The page you're looking for doesn't exist or may have moved.</p><Button onClick={()=>go('/dashboard')}>Back to dashboard</Button></div>; }

export default function App() {
 const navigate=useNavigate(); navTo=(p)=>navigate(p,{viewTransition:true}); const loc=useLocation(); const path=loc.pathname;
 const ap=authPage(path); if(ap) return ap;
 if(path==='/') return <Landing/>;
 if(['/login','/register','/forgot-password'].includes(path)) return <AuthPage mode={path==='/register'?'register':path==='/forgot-password'?'forgot':'login'}/>;
 if(path==='/onboarding') return <Onboarding/>;
 const admin=path.startsWith('/admin');
 let title=titleMap[path]||'KNOXIA';
 if(path.startsWith('/materials/')&&path!=='/materials/upload') title='Material Details';
 if(path.startsWith('/reviewers/')) title='Reviewer Details / Editor';
 if(path.startsWith('/flashcards/')&&path!=='/flashcards') title='Flashcard Study Session';
 if(path.startsWith('/quizzes/')) title=path.includes('/attempts/')?'Quiz Results / Review':'Take Quiz';
 if(path.startsWith('/study-rooms/')) title='Study Room Details';
 if(path.startsWith('/challenges/')) title='Challenge Game / Quiz Battle';
 return <Shell admin={admin} title={title}><div className="page-fade" key={path}><Routes>
   <Route path="/dashboard" element={<Dashboard/>}/><Route path="/materials" element={<Materials/>}/><Route path="/materials/upload" element={<UploadPage/>}/><Route path="/materials/:id" element={<MaterialDetail/>}/>
   <Route path="/reviewers/create" element={<CreateReviewer/>}/><Route path="/reviewers/:id" element={<ReviewerEditor/>}/><Route path="/study-companion" element={<Companion/>}/><Route path="/flashcards" element={<Flashcards/>}/><Route path="/flashcards/:id/study" element={<FlashStudy/>}/><Route path="/quizzes/create" element={<QuizCreate/>}/><Route path="/quizzes/:id/take" element={<QuizTake/>}/><Route path="/quizzes/attempts/:id" element={<QuizResults/>}/>
   <Route path="/feed" element={<Feed/>}/><Route path="/friends" element={<Friends/>}/><Route path="/profile/:username" element={<Profile/>}/><Route path="/study-rooms" element={<StudyRooms/>}/><Route path="/study-rooms/:id" element={<RoomDetail/>}/><Route path="/challenges" element={<Challenges/>}/><Route path="/challenges/:id/play" element={<ChallengePlay/>}/>
   <Route path="/leaderboards" element={<Leaderboards/>}/><Route path="/achievements" element={<Achievements/>}/><Route path="/analytics" element={<Analytics/>}/><Route path="/study-planner" element={<Planner/>}/>
   <Route path="/settings" element={<SettingsPage/>}/><Route path="/notifications" element={<Notifications/>}/>
   <Route path="/admin/dashboard" element={<AdminDashboard/>}/><Route path="/admin/users" element={<AdminUsers/>}/><Route path="/admin/moderation" element={<Moderation/>}/><Route path="/admin/logs" element={<Logs/>}/>
   <Route path="*" element={<NotFound/>}/>
 </Routes></div></Shell>;
}
