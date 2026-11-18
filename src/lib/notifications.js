import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../session.js';
import { supabase } from './supabase.js';
import { useUserData } from '../storage.js';
const convert=r=>({id:r.id,t:r.title,s:r.description,to:r.target_path,read:r.read,remote:true});
export function useNotifications(){
 const {user}=useAuth();
 const [local,setLocal]=useUserData('knoxia-notes',[]);
 const [remote,setRemote]=useState([]);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{
  if(!supabase||!user?.id){setRemote([]);return;}
  const {data,error}=await supabase.from('notifications').select('id,title,description,target_path,read,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
  if(error){setError(error.message);return;}
  setError('');setRemote((data||[]).map(convert));
 },[user?.id]);
 useEffect(()=>{
  setRemote([]);load();
  if(!user?.id)return;
  const timer=setInterval(load,10000);
  const channel=supabase?.channel('knoxia-notifications-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'user_id=eq.'+user.id},load).subscribe();
  return()=>{clearInterval(timer);if(channel)supabase.removeChannel(channel);};
 },[load,user?.id]);
 const setItems=useCallback(updater=>{
  const current=[...remote,...local];
  const next=typeof updater==='function'?updater(current):updater;
  const nextById=new Map(next.map(n=>[n.id,n]));
  const changes=remote.filter(n=>nextById.has(n.id)&&nextById.get(n.id).read!==n.read);
  setRemote(prev=>prev.map(n=>nextById.has(n.id)?{...n,read:nextById.get(n.id).read}:n));
  setLocal(prev=>prev.map(n=>nextById.has(n.id)?{...n,read:nextById.get(n.id).read}:n));
  if(supabase&&user?.id)changes.forEach(n=>{
   supabase.from('notifications').update({read:nextById.get(n.id).read}).eq('id',n.id).eq('user_id',user.id).then(({error})=>{if(error){console.error('Notification update failed',error);load();}});
  });
 },[remote,local,setLocal,user?.id,load]);
 return [[...remote,...local.filter(n=>!remote.some(r=>r.id===n.id))],setItems,error];
}
