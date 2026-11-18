import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useProfile } from './accounts.js';
import { useAuth } from './session.js';
import { usePeople } from './friendsStore.js';
import { supabase } from './lib/supabase.js';
import { sortPosts } from './feedCalc.js';
import { fetchFeed,createFeedPost,deleteFeedPost,setFeedReaction,addFeedComment,editFeedComment,deleteFeedComment } from './lib/feedApi.js';
let posts=[],loaded=false,loadError='',activeUser=null;
const listeners=new Set(),notify=()=>listeners.forEach(fn=>fn());
const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
const snapshot=()=>posts;
const status=()=>({loaded,error:loadError});
const statusListeners=new Set();
const notifyStatus=()=>statusListeners.forEach(fn=>fn());
let statusSnapshot=status();
const subscribeStatus=fn=>{statusListeners.add(fn);return()=>statusListeners.delete(fn);};
const getStatus=()=>statusSnapshot;
function setStatus(){statusSnapshot=status();notifyStatus();}
export async function refreshFeed(){
 const uid=activeUser;if(!uid)return;
 try{const next=await fetchFeed();if(activeUser!==uid)return;posts=sortPosts(next);loadError='';notify();}
 catch(e){if(activeUser!==uid)return;loadError=e.message||'Could not load feed.';}
 finally{if(activeUser===uid){loaded=true;setStatus();}}
}
export function useFeed(){
 const {user}=useAuth(),me=useProfile(),people=usePeople();
 const rows=useSyncExternalStore(subscribe,snapshot,()=>[]);
 const state=useSyncExternalStore(subscribeStatus,getStatus,getStatus);
 useEffect(()=>{
  const uid=user?.id||null;
  if(activeUser!==uid){activeUser=uid;posts=[];loaded=!uid;loadError=uid?'':'Sign in to view the feed.';notify();setStatus();}
  if(!uid)return;
  refreshFeed();
  const interval=setInterval(refreshFeed,12000);
  return()=>clearInterval(interval);
 },[user?.id]);
 return useMemo(()=>{
  const byId=new Map(people.map(p=>[p.id,p]));
  const self={...me,id:user?.id,displayName:me.displayName||user?.user_metadata?.username||user?.email?.split('@')[0]||'You',username:me.username||user?.user_metadata?.username||''};
  byId.set(user?.id,self);
  return {me:self,meId:user?.id,ready:!!user?.id&&state.loaded,error:state.error,people,posts:rows,authorOf:id=>byId.get(id)||null};
 },[me,user,people,rows,state]);
}
async function act(fn){try{await fn();await refreshFeed();return {ok:true};}catch(e){return {error:e.message||'Feed action failed.'};}}
export const publishPost=(_me,text,tags)=>act(()=>createFeedPost(text,tags));
export const removePost=(_me,id)=>act(()=>deleteFeedPost(id));
export const reactToPost=(_me,id,kind)=>act(()=>{const post=posts.find(p=>p.id===id);return setFeedReaction(id,kind,post?.reactions?.[activeUser]);});
export const commentOn=(_me,id,text,parentId='')=>act(()=>addFeedComment(id,text,parentId));
export const changeComment=(_me,_postId,id,text)=>act(()=>editFeedComment(id,text));
export const removeComment=(_me,_postId,id)=>act(()=>deleteFeedComment(id));
