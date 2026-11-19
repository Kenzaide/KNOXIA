import React,{useEffect,useState,useCallback,useRef} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {supabase} from './lib/supabase.js';
import {useAuth} from './session.js';
import {useFriends} from './friendsStore.js';
import {QuizRunner} from './quizRunner.jsx';
const Btn=({children,...props})=><button type="button" className="btn primary" {...props}>{children}</button>;
function useRows(table,query){
 const {user}=useAuth();const [rows,setRows]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 const refresh=useCallback(async()=>{if(!supabase||!user?.id){setBusy(false);return;}const {data,error}=await query(supabase.from(table).select('*'));if(error)setError(error.message);else{setRows(data||[]);setError('');}setBusy(false);},[table,user?.id,query]);
 useEffect(()=>{refresh();const t=setInterval(refresh,5000);return()=>clearInterval(t)},[refresh]);
 return {rows,error,busy,refresh};
}
const time=s=>new Date(s).toLocaleString();
function FocusTimer(){
 const [seconds,setSeconds]=useState(25*60),[running,setRunning]=useState(false);
 useEffect(()=>{if(!running)return;const id=setInterval(()=>setSeconds(n=>{if(n<=1){setRunning(false);return 0;}return n-1;}),1000);return()=>clearInterval(id)},[running]);
 return <div style={{paddingTop:14,borderTop:'1px solid var(--border,#e4e8f0)',marginTop:16}}>
 <h3>Focus timer</h3><p style={{fontSize:36,fontWeight:750,fontVariantNumeric:'tabular-nums',margin:'10px 0'}}>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</p>
 <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Btn onClick={()=>setRunning(v=>!v)}>{running?'Pause':'Start'}</Btn><button type="button" className="btn outline" onClick={()=>{setRunning(false);setSeconds(25*60)}}>Reset</button></div>
 <small>This timer is personal to your browser.</small></div>;
}
export function LiveStudyRooms(){
 const {user}=useAuth(),nav=useNavigate();const [name,setName]=useState(''),[topic,setTopic]=useState(''),[error,setError]=useState('');
 const query=useCallback(q=>q.order('created_at',{ascending:false}),[]);
 const {rows,busy,error:loadError,refresh}=useRows('study_rooms_live',query);
 const [members,setMembers]=useState([]);
 useEffect(()=>{if(!supabase||!user)return;const load=()=>supabase.from('study_room_members_live').select('room_id,user_id').then(({data})=>setMembers(data||[]));load();const t=setInterval(load,5000);return()=>clearInterval(t)},[user?.id,rows.length]);
 async function create(e){e.preventDefault();const {data,error}=await supabase.from('study_rooms_live').insert({name:name.trim(),topic:topic.trim(),owner_id:user.id}).select('id').single();if(error)setError(error.message);else nav('/study-rooms/'+data.id);}
 async function join(id){const {error}=await supabase.from('study_room_members_live').insert({room_id:id,user_id:user.id});if(error&&error.code!=='23505')setError(error.message);else nav('/study-rooms/'+id);}
 return <><div className="section-title"><div><h2>Study Rooms</h2><p>Shared rooms and conversations across KNOXIA accounts.</p></div></div>
 <form className="panel" onSubmit={create} style={{padding:20,display:'grid',gap:12,marginBottom:20}}>
 <h3>Create a study room</h3><input className="field" placeholder="Room name" required minLength={3} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/>
 <input className="field" placeholder="Study topic (optional)" maxLength={120} value={topic} onChange={e=>setTopic(e.target.value)}/>
 <button className="btn primary" type="submit">Create room</button></form>
 {(error||loadError)&&<p className="notice error" role="alert">{error||loadError}</p>}
 {busy?<p>Loading rooms…</p>:rows.length===0?<div className="panel" style={{padding:24}}>No rooms yet. Create the first one!</div>:
 <div className="friend-grid">{rows.map(r=>{const count=members.filter(m=>m.room_id===r.id).length;const mine=members.some(m=>m.room_id===r.id&&m.user_id===user.id);
 return <div className="panel friend-card" key={r.id}><h3>{r.name}</h3><p>{r.topic||'Open study discussion'}</p><small>{count} member{count===1?'':'s'}</small><div style={{marginTop:12}}><Btn onClick={()=>mine?nav('/study-rooms/'+r.id):join(r.id)}>{mine?'Open room':'Join room'}</Btn></div></div>})}</div>}</>;
}
export function LiveRoomDetail(){
 const {id}=useParams(),{user}=useAuth(),nav=useNavigate();const [room,setRoom]=useState(null),[members,setMembers]=useState([]),[messages,setMessages]=useState([]),[text,setText]=useState(''),[error,setError]=useState('');const [names,setNames]=useState({});const bottom=useRef(null);
 const load=useCallback(async()=>{if(!supabase||!user)return;
 const [r,m,c]=await Promise.all([supabase.from('study_rooms_live').select('*').eq('id',id).maybeSingle(),supabase.from('study_room_members_live').select('*').eq('room_id',id),supabase.from('study_room_messages_live').select('*').eq('room_id',id).order('created_at',{ascending:true}).limit(200)]);
 if(r.error)setError(r.error.message);else setRoom(r.data);setMembers(m.data||[]);if(!c.error)setMessages(c.data||[]);
 },[id,user?.id]);
 useEffect(()=>{load();const t=setInterval(load,2500);return()=>clearInterval(t)},[load]);
 useEffect(()=>{const ids=[...new Set([...members.map(m=>m.user_id),...messages.map(m=>m.author_id)])];if(!ids.length||!supabase)return;
 let active=true;supabase.from('profiles').select('id,display_name,username').in('id',ids).then(({data})=>{if(active&&data)setNames(Object.fromEntries(data.map(p=>[p.id,p.display_name||p.username||'Student'])))});return()=>{active=false}},[members,messages]);
 useEffect(()=>{bottom.current?.scrollIntoView?.({block:'nearest',behavior:'smooth'})},[messages.length]);
 const member=members.some(m=>m.user_id===user?.id);
 async function send(e){e.preventDefault();if(!text.trim())return;const {error}=await supabase.from('study_room_messages_live').insert({room_id:id,author_id:user.id,body:text.trim()});if(error)setError(error.message);else{setText('');load();}}
 async function join(){const {error}=await supabase.from('study_room_members_live').insert({room_id:id,user_id:user.id});if(error&&error.code!=='23505')setError(error.message);else load();}
 async function leave(){const {error}=await supabase.from('study_room_members_live').delete().eq('room_id',id).eq('user_id',user.id);if(error)setError(error.message);else nav('/study-rooms');}
 async function del(){if(!window.confirm('Delete this room and all messages?'))return;const {error}=await supabase.from('study_rooms_live').delete().eq('id',id).eq('owner_id',user.id);if(error)setError(error.message);else nav('/study-rooms');}
 if(!room)return <div className="panel" style={{padding:24}}>Loading room… {error}</div>;
 return <><div className="section-title"><div><h2>{room.name}</h2><p>{room.topic||'Study together'} · {members.length} members</p></div><Link to="/study-rooms">All rooms</Link></div>
 {error&&<p className="notice error" role="alert">{error}</p>}
 {!member?<div className="panel" style={{padding:24}}><p>Join to see the conversation and send messages.</p><Btn onClick={join}>Join room</Btn></div>:
 <div className="chat-layout"><div className="panel" style={{padding:20,minHeight:460,display:'flex',flexDirection:'column',gap:12}}>
 <div style={{flex:1,maxHeight:480,overflowY:'auto'}} role="log" aria-label="Room messages">{messages.length===0?<p>No messages yet. Say hello!</p>:messages.map(m=><div key={m.id} style={{marginBottom:12,textAlign:m.author_id===user.id?'right':'left'}}><small>{m.author_id===user.id?'You':names[m.author_id]||'Student'} · {time(m.created_at)}</small><p style={{padding:12,background:'var(--surface-2,#eef3ff)',borderRadius:12,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.body}</p></div>)}<div ref={bottom}/></div>
 <form onSubmit={send} style={{display:'flex',gap:8}}><input className="field" style={{flex:1}} placeholder="Message your study group…" maxLength={1000} value={text} onChange={e=>setText(e.target.value)}/><button className="btn primary" type="submit">Send</button></form></div>
 <div className="panel" style={{padding:20,alignSelf:'start'}}><h3>Members ({members.length})</h3><div style={{display:'grid',gap:8,margin:'12px 0'}}>{members.map(m=><div key={m.user_id} style={{display:'flex',alignItems:'center',gap:8}}><span className="avatar sm">{(names[m.user_id]||'S').slice(0,2).toUpperCase()}</span><span>{m.user_id===user.id?'You':names[m.user_id]||'Student'}{m.user_id===room.owner_id?' · Host':''}</span></div>)}</div><p>Messages update automatically.</p><FocusTimer/>
 {room.owner_id===user.id?<Btn onClick={del}>Delete room</Btn>:<Btn onClick={leave}>Leave room</Btn>}</div></div>}</>;
}
export function LiveChallenges(){
 const {user}=useAuth();const friends=useFriends();const [opponent,setOpponent]=useState(''),[title,setTitle]=useState('Study quiz battle'),[error,setError]=useState(''),[materials,setMaterials]=useState([]),[materialId,setMaterialId]=useState(''),[generating,setGenerating]=useState(false),[difficulty,setDifficulty]=useState('medium'),[count,setCount]=useState(5),[limit,setLimit]=useState(0),[tab,setTab]=useState('active');
 const query=useCallback(q=>q.or('creator_id.eq.'+user.id+',opponent_id.eq.'+user.id).order('created_at',{ascending:false}),[user?.id]);
 const {rows,error:loadError,refresh}=useRows('study_challenges_live',query);
 const people=friends.friends.map(x=>x.person).filter(p=>p.id&&p.id!==user?.id&&!String(p.id).startsWith('sample:'));
 useEffect(()=>{if(!supabase||!user?.id)return;let active=true;supabase.from('materials').select('*').eq('owner_id',user.id).then(({data,error})=>{if(!active)return;if(error)setError(error.message);else setMaterials(data||[])});return()=>{active=false}},[user?.id]);
 async function create(e){e.preventDefault();if(!materialId||!opponent||generating)return;setGenerating(true);setError('');
 try{
  const {data:generated,error:aiError}=await supabase.functions.invoke('generate-challenge',{body:{materialId,difficulty,questionCount:count}});
  if(aiError)throw new Error(generated?.error||aiError.message||'Could not generate questions');
  if(generated?.error)throw new Error(generated.error);
  if(!Array.isArray(generated?.questions)||generated.questions.length!==count)throw new Error('AI returned an invalid quiz.');
  const {error:saveError}=await supabase.from('study_challenges_live').insert({creator_id:user.id,opponent_id:opponent,title:title.trim(),question_set:generated.questions,difficulty,time_limit_minutes:limit});
  if(saveError)throw saveError;refresh();
 }catch(err){setError(err.message||'Challenge creation failed.')}finally{setGenerating(false)}}
 return <><div className="section-title"><div><h2>Friend Challenges</h2><p>Challenge a friend using AI questions generated from your uploaded study material.</p></div></div>
 <form className="panel" style={{padding:20,display:'grid',gap:12,marginBottom:20}} onSubmit={create}><h3>Challenge a friend</h3>
 <input className="field" value={title} maxLength={100} minLength={3} onChange={e=>setTitle(e.target.value)} required/>
 <label className="field-label" htmlFor="challenge-material">Study material</label><select id="challenge-material" className="field" value={materialId} onChange={e=>setMaterialId(e.target.value)} required><option value="">Choose an uploaded material</option>{materials.map(m=><option key={m.id} value={m.id}>{m.title||m.name||'Untitled material'}</option>)}</select>
 {materials.length===0&&<p>No uploaded materials found. <Link to="/materials/upload">Upload a material</Link> first.</p>}
 <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><label>Difficulty <select className="field" value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><label>Questions <select className="field" value={count} onChange={e=>setCount(Number(e.target.value))}>{[5,10,15,20].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Time limit <select className="field" value={limit} onChange={e=>setLimit(Number(e.target.value))}>{[0,5,10,15,20,30,45,60].map(n=><option key={n} value={n}>{n?n+' minutes':'No limit'}</option>)}</select></label></div>
 <label className="field-label" htmlFor="challenge-friend">Opponent</label><select id="challenge-friend" className="field" value={opponent} onChange={e=>setOpponent(e.target.value)} required><option value="">Choose a friend</option>{people.map(p=><option value={p.id} key={p.id}>{p.displayName||p.username}</option>)}</select>
 {people.length===0&&<p>No connected friends yet. <Link to="/friends">Find friends</Link> first.</p>}
 <button type="submit" className="btn primary" disabled={!opponent||!materialId||generating}>{generating?'Generating questions…':'Generate & send challenge' }</button></form>
 {(error||loadError)&&<p className="notice error" role="alert">{error||loadError}</p>}
 <div style={{display:'flex',gap:8,margin:'16px 0'}}><Btn onClick={()=>setTab('active')}>Active</Btn><Btn onClick={()=>setTab('history')}>History</Btn><Link className="btn outline" to="/challenges/leaderboard">Challenge leaderboard</Link></div>
 <div className="panel list-panel">{rows.filter(c=>tab==='history'?(c.creator_score!=null&&c.opponent_score!=null):(c.creator_score==null||c.opponent_score==null)).length===0?<p style={{padding:20}}>No challenges yet.</p>:rows.filter(c=>tab==='history'?(c.creator_score!=null&&c.opponent_score!=null):(c.creator_score==null||c.opponent_score==null)).map(c=><div className="generic-row" key={c.id}><div><b>{c.title}</b><small>{c.creator_id===user.id?'You challenged a friend':'A friend challenged you'} · {time(c.created_at)}</small><p><small>{c.difficulty||'medium'} · {c.question_set.length} questions · {c.time_limit_minutes?c.time_limit_minutes+' min':'Untimed'}</small></p><p>{c.creator_score==null?'Creator pending':'Creator: '+c.creator_score+'/'+c.question_set.length} · {c.opponent_score==null?'Opponent pending':'Opponent: '+c.opponent_score+'/'+c.question_set.length}</p></div><Link className="btn primary" to={'/challenges/'+c.id+'/play'}>Play</Link></div>)}</div></>;
}
export function LiveChallengePlay(){
 const {id}=useParams(),{user}=useAuth();const [challenge,setChallenge]=useState(null),[error,setError]=useState(''),[result,setResult]=useState(null);
 useEffect(()=>{let active=true;const refresh=()=>supabase.from('study_challenges_live').select('*').eq('id',id).maybeSingle().then(({data,error})=>{if(!active)return;if(error)setError(error.message);else if(data)setChallenge(data);});refresh();const timer=setInterval(refresh,4000);return()=>{active=false;clearInterval(timer)}},[id]);
 if(error)return <p className="notice error">{error}</p>;
 if(!challenge)return <p>Loading challenge…</p>;
 const mine=challenge.creator_id===user.id?'creator_score':'opponent_score';
 async function finish(answers){const {data,error}=await supabase.rpc('submit_study_challenge',{p_challenge_id:id,p_answers:answers});if(error)setError(error.message);else{setResult(data.score);setChallenge(c=>({...c,[mine]:data.score}));}}
 return <><div className="section-title"><div><h2>{challenge.title}</h2><p>{challenge.question_set.length} questions · {challenge.difficulty||'medium'} · {challenge.time_limit_minutes?challenge.time_limit_minutes+' minute limit':'Untimed'}</p></div><Link to="/challenges">Back to challenges</Link></div>
 {result!==null||challenge[mine]!==null?<div className="panel" style={{padding:24}}><h3>Your score: {result??challenge[mine]} / {challenge.question_set.length}</h3><p>{challenge.creator_score!=null&&challenge.opponent_score!=null?('Final result: '+challenge.creator_score+'–'+challenge.opponent_score+' · '+(challenge.creator_score===challenge.opponent_score?'Draw':(challenge.creator_score>challenge.opponent_score?challenge.creator_id:challenge.opponent_id)===user.id?'You won!':'Your friend won.')):'Waiting for the other participant. This page updates automatically.'}</p><Link to="/challenges">See all challenges</Link></div>:<ChallengeTimedQuiz key={challenge.id} challenge={challenge} onFinish={finish}/>}</>;
}

function ChallengeTimedQuiz({challenge,onFinish}){
 const [remaining,setRemaining]=useState(challenge.time_limit_minutes*60);

 useEffect(()=>{if(!challenge.time_limit_minutes)return;const start=Date.now();const timer=setInterval(()=>{const left=Math.max(0,challenge.time_limit_minutes*60-Math.floor((Date.now()-start)/1000));setRemaining(left);if(left===0)clearInterval(timer)},1000);return()=>clearInterval(timer)},[challenge.id,challenge.time_limit_minutes]);
 return <>{challenge.time_limit_minutes>0&&<p role="timer" style={{fontWeight:700}}>Time remaining: {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</p>}<QuizRunner qs={challenge.question_set} label="FRIEND CHALLENGE" exitTo="/challenges" timeLimitSeconds={challenge.time_limit_minutes*60} onFinish={onFinish}/></>;
}
export function ChallengeLeaderboard(){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;supabase.rpc('knoxia_challenge_leaderboard').then(({data,error})=>{if(!active)return;if(error)setError(error.message);else setRows(data||[]);setLoading(false)});return()=>{active=false}},[]);
 return <><div className="section-title"><div><h2>Challenge leaderboard</h2><p>XP from completed challenges, wins and draws. Real accounts only.</p></div><Link to="/challenges">Back to challenges</Link></div>
 {error&&<p className="notice error" role="alert">{error}</p>}
 {loading?<p>Loading rankings…</p>:<div className="panel" style={{padding:20}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Rank</th><th>Student</th><th>Played</th><th>Wins</th><th>Draws</th><th>Accuracy</th><th>Challenge XP</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.user_id}><td>#{i+1}</td><td>{r.display_name}</td><td>{r.played}</td><td>{r.wins}</td><td>{r.draws}</td><td>{r.accuracy??0}%</td><td>{r.challenge_xp}</td></tr>)}</tbody></table>{!rows.length&&<p>No challenge attempts yet.</p>}</div>}</>;
}
