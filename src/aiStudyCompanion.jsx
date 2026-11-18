import React, { useEffect, useRef, useState } from 'react';
import { Plus, Send, Trash2, BookOpen, MessageSquare, Loader2 } from 'lucide-react';
import { useMaterials } from './materials.jsx';
import { getFile } from './files.js';
import { supabase } from './lib/supabase.js';
import { KnowlAvatar } from './knowl.jsx';

const panel = { background: 'var(--surface, #fff)', border: '1px solid #dce5f4', borderRadius: 18, padding: 18 };
const btn = { border: '1px solid #dce5f4', borderRadius: 10, padding: '10px 14px', background: 'var(--surface, #fff)', color: 'inherit', cursor: 'pointer', font: 'inherit' };
const blue = { ...btn, background: '#2563eb', color: 'white', borderColor: '#2563eb' };
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
    <h3 style={{marginTop:22}}>Conversation history</h3>
    <button type="button" className="btn primary" onClick={newChat} disabled={busy}><Plus size={16}/> New conversation</button>
    {loading && <p className="muted">Loading conversations…</p>}
    {!loading && !chats.length && <p className="muted">Saved conversations will appear here.</p>}
    <div style={{maxHeight:300,overflowY:'auto',marginTop:12}}>
     {chats.map(c=><div key={c.id} style={{display:'flex',alignItems:'center',gap:4,marginBottom:5}}>
      <button type="button" className="context-file" disabled={busy} onClick={()=>open(c)} style={{flex:1,minWidth:0,textAlign:'left',cursor:'pointer',background:c.id===id?'#e9f0ff':undefined}} title={c.title}><MessageSquare size={16}/><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.title}</span></button>
      <button type="button" className="plain-icon" disabled={busy} onClick={()=>remove(c)} title="Delete conversation" aria-label={'Delete '+c.title}><Trash2 size={16}/></button>
     </div>)}
    </div>
   </div>
  </div>
 </>;
}
