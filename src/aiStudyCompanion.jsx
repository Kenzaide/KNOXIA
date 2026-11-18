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
 return <div style={{ maxWidth: 1300, margin: '0 auto' }}>
  <h2 style={{ marginBottom: 4 }}>Knowl, your AI Study Companion</h2>
  <p style={{ color: '#64748b', marginBottom: 20 }}>Ask questions, explore concepts, and continue saved conversations with Gemini.</p>
  {error && <div role="alert" style={{ ...panel, color: '#c42648', marginBottom: 14 }}>{error}</div>}
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 280px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
   <aside style={panel}>
    <button type="button" style={{ ...blue, width: '100%' }} disabled={busy} onClick={newChat}><Plus size={16} style={{ verticalAlign: 'middle' }} /> New conversation</button>
    <h3 style={{ marginTop: 22, fontSize: 15 }}>Conversation history</h3>
    {loading && <p>Loading conversations…</p>}
    {!loading && !chats.length && <p style={{ color: '#64748b' }}>Your conversations will appear here after you send a message.</p>}
    {chats.map((c) => <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
     <button type="button" disabled={busy} onClick={() => open(c)} style={{ ...btn, flex: 1, minWidth: 0, textAlign: 'left', background: c.id === id ? '#e9f0ff' : 'transparent', color: c.id === id ? '#1d4ed8' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.title}><MessageSquare size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />{c.title}</button>
     <button type="button" style={btn} disabled={busy} onClick={() => remove(c)} aria-label={'Delete ' + c.title}><Trash2 size={15}/></button>
    </div>)}
   </aside>
   <main style={panel}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 14, marginBottom: 14 }}>
     <KnowlAvatar pose={busy ? 'think' : 'happy'} size={42}/>
     <div><b>Knowl · KNOXIA</b><div style={{ color: '#64748b', fontSize: 13 }}>{busy ? 'Thinking with Gemini…' : current?.title || 'New study session'}</div></div>
    </div>
    <label style={{ display: 'block', marginBottom: 12, fontSize: 14 }}><BookOpen size={16} style={{ verticalAlign: 'middle', marginRight: 7 }}/>Study material (optional)
     <select value={materialId} disabled={busy || !!id} onChange={(e) => setMaterialId(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 8, padding: 11, borderRadius: 10, border: '1px solid #dce5f4', background: 'var(--surface, #fff)', color: 'inherit', font: 'inherit' }}>
      <option value="">No material — general study help</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
     </select>
    </label>
    <p style={{ color: '#64748b', fontSize: 12 }}>Material-based answers use your selected file as the source. Start a new conversation to change materials.</p>
    <div style={{ minHeight: 340, maxHeight: 520, overflowY: 'auto', padding: '12px 4px' }} aria-live="polite">
     {!messages.length && <div style={{ textAlign: 'center', color: '#64748b', padding: 45 }}><KnowlAvatar pose="happy" size={64}/><p>Hi! I'm Knowl. What would you like to understand today?</p></div>}
     {messages.map((m) => <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', margin: '12px 0' }}>
      <div style={{ maxWidth: '85%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.7, background: m.role === 'user' ? '#2563eb' : '#edf3ff', color: m.role === 'user' ? '#fff' : '#172554', padding: '12px 16px', borderRadius: 15 }}>{m.content}</div>
     </div>)}
     {busy && <p style={{ color: '#64748b' }}><Loader2 size={16} style={{ verticalAlign: 'middle' }}/> Knowl is thinking…</p>}
     <div ref={scroll}/>
    </div>
    <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
     <input aria-label="Message Knowl" placeholder="Ask about a concept, request an example, or ask for practice…" maxLength={2000} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} style={{ flex: 1, minWidth: 0, border: '1px solid #dce5f4', borderRadius: 10, padding: '12px 14px', font: 'inherit', color: 'inherit', background: 'var(--surface, #fff)' }}/>
     <button type="submit" style={blue} disabled={busy || !draft.trim()}><Send size={17} style={{ verticalAlign: 'middle', marginRight: 5 }}/> Send</button>
    </form>
   </main>
  </div>
 </div>;
}
