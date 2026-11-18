import React, { useEffect, useRef, useState } from 'react';
import { Plus, Send, Trash2, BookOpen, MessageSquare, Loader2 } from 'lucide-react';
import { useMaterials } from './materials.jsx';
import { getFile } from './files.js';
import { supabase } from './lib/supabase.js';
import { KnowlAvatar } from './knowl.jsx';

const panel = { background: 'var(--surface, #fff)', border: '1px solid #dce5f4', borderRadius: 18, padding: 18 };
const btn = { border: '1px solid #dce5f4', borderRadius: 10, padding: '10px 14px', background: 'var(--surface, #fff)', color: 'inherit', cursor: 'pointer', font: 'inherit' };
const blue = { ...btn, background: '#2563eb', color: 'white', borderColor: '#2563eb' };
const historyDate = (value) => {
 if (!value) return '';
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return '';
 return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const getData = async (query) => { const { data, error } = await query; if (error) throw error; return data; };

export default function AIStudyCompanion() {
 const { items: materials } = useMaterials();
 const [chats, setChats] = useState([]);
 const [id, setId] = useState(null);
 const [materialId, setMaterialId] = useState('');
 const [messages, setMessages] = useState([]);
 const [draft, setDraft] = useState('');
 const [busy, setBusy] = useState(false);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');
 const [refresh, setRefresh] = useState(0);
 const scroll = useRef(null);
 const current = chats.find((c) => c.id === id);
 useEffect(() => { scroll.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
 useEffect(() => {
  let live = true;
  (async () => {
   if (!supabase) throw new Error('Supabase is not configured.');
   const { data: { user }, error: authError } = await supabase.auth.getUser();
   if (authError || !user) throw new Error('Please sign in.');
   const list = await getData(supabase.from('companion_conversations').select('id,title,material_id,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(100));
   if (live) setChats(list || []);
  })().catch((e) => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
  return () => { live = false; };
 }, [refresh]);
 useEffect(() => {
  let live = true;
  if (!id) { setMessages([]); return; }
  setMessages([]);
  (async () => {
   const data = await getData(supabase.from('companion_messages').select('id,role,content,created_at').eq('conversation_id', id).order('created_at', { ascending: true }).limit(200));
   if (live) setMessages(data || []);
  })().catch((e) => { if (live) setError(e.message); });
  return () => { live = false; };
 }, [id]);
 const newChat = () => { if (busy) return; setId(null); setMaterialId(''); setMessages([]); setError(''); };
 const open = (c) => { if (busy) return; setId(c.id); setMaterialId(c.material_id || ''); setError(''); };
 const remove = async (c) => {
  if (busy || !window.confirm('Delete this conversation permanently?')) return;
  setBusy(true); setError('');
  try {
   const { data: { user } } = await supabase.auth.getUser();
   if (!user) throw new Error('Please sign in.');
   await getData(supabase.from('companion_conversations').delete().eq('id', c.id).eq('user_id', user.id));
   if (id === c.id) { setId(null); setMessages([]); setMaterialId(''); }
   setRefresh((n) => n + 1);
  } catch (e) { setError(e.message); } finally { setBusy(false); }
 };
 const send = async (event) => {
  event?.preventDefault();
  const question = draft.trim();
  if (!question || busy) return;
  setBusy(true); setError('');
  setDraft('');
  const old = messages;
  setMessages([...old, { id: 'pending', role: 'user', content: question }]);
  try {
   let sourceText = '';
   if (materialId) {
    const m = materials.find((item) => item.id === materialId);
    if (!m) throw new Error('Selected material is unavailable.');
    const blob = await getFile(m.id);
    if (!blob) throw new Error('The original file is unavailable. Re-upload it before chatting.');
    const extracted = await (await import('./extract.js')).extractMaterial(blob, m.type);
    sourceText = extracted.text || '';
    if (extracted.pdfDoc?.destroy) await extracted.pdfDoc.destroy();
    if (extracted.scanned || !sourceText.trim()) throw new Error('No readable text in the selected material.');
   }
   const { data, error: invokeError } = await supabase.functions.invoke('study-companion', {
    body: { conversationId: id, materialId: materialId || null, sourceText: sourceText.slice(0, 28000), message: question },
   });
   if (invokeError) {
    let detail = invokeError.message;
    try { if (invokeError.context?.json) detail = (await invokeError.context.json()).error || detail; } catch { /* network error */ }
    throw new Error(detail);
   }
   if (!data?.answer || !data?.conversationId) throw new Error(data?.error || 'No answer returned.');
   setMessages([...old, { id: 'sent-' + Date.now(), role: 'user', content: question }, { id: 'answer-' + Date.now(), role: 'assistant', content: data.answer }]);
   if (!id) setId(data.conversationId);
   setRefresh((n) => n + 1);
  } catch (e) { setMessages(old); setDraft(question); setError(e.message || 'Could not send message.'); }
  finally { setBusy(false); }
 };
 return <>
  <h2 style={{marginBottom:4}}>Knowl, your Study Companion</h2>
  <p className="muted" style={{marginBottom:20}}>Your personal learning assistant, ready when you are.</p>
  {error && <div className="notice error" role="alert">{error}</div>}
  <div className="chat-layout">
   <div className="chat-main panel">
    <div className="chat-header">
     <KnowlAvatar pose={busy ? 'think' : 'happy'} size={40}/>
     <div><b>Knowl · KNOXIA Companion</b><small><i/> {busy ? 'Thinking…' : 'Ready to help'}</small></div>
     <button className="plain-icon" type="button" title="New conversation" aria-label="New conversation" onClick={newChat} disabled={busy}><Plus size={19}/></button>
    </div>
    <div className="chat-messages" aria-live="polite" style={{minHeight:340, maxHeight:520, overflowY:'auto'}}>
     {!messages.length && <div className="message assistant"><KnowlAvatar pose="default" size={30} className="mini"/><div className="bubble">Hoot! I'm Knowl, your KNOXIA Study Companion. Ask me about your uploaded materials or a topic you'd like to understand!</div></div>}
     {messages.map((m) => <div className={`message ${m.role}`} key={m.id}>
      {m.role === 'assistant' && <KnowlAvatar pose="default" size={30} className="mini"/>}
      <div className="bubble" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.content}</div>
     </div>)}
     {busy && <div className="message assistant"><KnowlAvatar pose="think" size={30} className="mini"/><div className="bubble typing" aria-label="Knowl is thinking"><i/><i/><i/></div></div>}
     <div ref={scroll}/>
    </div>
    <div className="suggestions">
     <button type="button" onClick={()=>setDraft('Explain this concept in simple terms')}>Explain a concept</button>
     <button type="button" onClick={()=>setDraft('Give me a practical example')}>Give me an example</button>
     <button type="button" onClick={()=>setDraft('Create a quick practice question')}>Test my knowledge</button>
    </div>
    <form className="chat-input" onSubmit={send}>
     <input aria-label="Message Knowl" placeholder="Ask Knowl anything about your lessons..." maxLength={2000} value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy}/>
     <button type="submit" className="send-btn" aria-label="Send" disabled={busy || !draft.trim()}><Send size={18}/></button>
    </form>
   </div>
   <div className="panel chat-context">
    <h3>Study context</h3><p>Choose the materials Knowl should use.</p>
    <label className="ufield"><span>Selected material</span>
     <select value={materialId} disabled={busy || !!id} onChange={e=>setMaterialId(e.target.value)}>
      <option value="">No material — general study help</option>
      {materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
     </select>
    </label>
    {materialId && <div className="context-file"><BookOpen size={18}/><span>{materials.find(m=>m.id===materialId)?.name || 'Selected material'}</span></div>}
    <p className="muted" style={{fontSize:12}}>Start a new conversation to change the selected material.</p>
    <div className="grounding-note"><BookOpen size={16}/><span>Knowl uses your selected study material to ground its answers.</span></div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:24,marginBottom:12}}>
     <h3 style={{margin:0}}>Conversation history</h3>
     {!!chats.length && <span className="muted" style={{fontSize:12,whiteSpace:'nowrap'}}>{chats.length} saved</span>}
    </div>
    <button type="button" className="btn primary" onClick={newChat} disabled={busy} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,borderRadius:12,minHeight:44,marginBottom:14}}><Plus size={17}/> New conversation</button>
    {loading && <p className="muted" style={{fontSize:13}}>Loading conversations…</p>}
    {!loading && !chats.length && <div style={{border:'1px dashed #dce5f4',borderRadius:12,padding:'22px 14px',textAlign:'center',display:'grid',justifyItems:'center',gap:8}}>
     <MessageSquare size={22} style={{opacity:.45}}/>
     <span className="muted" style={{fontSize:13}}>Your conversations will appear here.</span>
    </div>}
    <div role="list" aria-label="Saved conversations" style={{display:'grid',gap:8,maxHeight:320,overflowY:'auto',paddingRight:3}}>
     {chats.map(c=><div role="listitem" key={c.id} style={{display:'flex',alignItems:'center',gap:6,minWidth:0,border:'1px solid '+(c.id===id?'#8fb4ff':'#dce5f4'),borderRadius:12,background:c.id===id?'rgba(37,99,235,.09)':'var(--surface, #fff)',padding:'5px 6px 5px 10px',transition:'border-color .15s ease'}}>
      <button type="button" disabled={busy} onClick={()=>open(c)} aria-current={c.id===id?'true':undefined} title={c.title} style={{display:'flex',alignItems:'center',gap:10,flex:1,minWidth:0,border:0,background:'transparent',color:'inherit',font:'inherit',textAlign:'left',cursor:busy?'not-allowed':'pointer',padding:'7px 2px'}}>
       <MessageSquare size={17} style={{flexShrink:0,color:c.id===id?'#2563eb':'#7185a4'}}/>
       <span style={{display:'flex',flexDirection:'column',gap:4,minWidth:0,flex:1}}>
        <span style={{fontSize:13,fontWeight:c.id===id?700:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.4}}>{c.title || 'Untitled conversation'}</span>
        <span className="muted" style={{fontSize:11,lineHeight:1.3}}>{historyDate(c.updated_at)}{c.id===id?' · Current chat':''}</span>
       </span>
      </button>
      <button type="button" disabled={busy} onClick={()=>remove(c)} title={'Delete '+(c.title||'conversation')} aria-label={'Delete '+(c.title||'conversation')} style={{flexShrink:0,display:'grid',placeItems:'center',width:32,height:32,border:0,borderRadius:8,background:'transparent',color:'#7185a4',cursor:busy?'not-allowed':'pointer'}}><Trash2 size={16}/></button>
     </div>)}
    </div>
   </div>
  </div>
 </>;
}
