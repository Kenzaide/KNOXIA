import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderInput, LogOut } from 'lucide-react';

/* Shared UI pieces used across pages. */
export function Button({children,variant='primary',icon:Icon,onClick,type='button',loading=false}) { return <button type={type} onClick={onClick} disabled={loading} className={`btn ${variant}`}>{loading?<i className="spin" aria-hidden="true"/>:Icon&&<Icon size={16}/>}<span>{children}</span></button>; }

// Stand-in for data fetching: shows skeletons briefly until a real API is connected.
export function usePending(ms=450) { const [p,setP]=useState(true); useEffect(()=>{const t=setTimeout(()=>setP(false),ms);return()=>clearTimeout(t)},[ms]); return p; }

export function Skeleton({width='100%',height=16,radius=10,style={}}) {
  return <span className="skel kn-skeleton" aria-hidden="true" style={{display:'block',width,height,borderRadius:radius,flexShrink:0,...style}}/>;
}
export function PageSkeleton({cards=false}) {
  return <div className="kn-loading-page" role="status" aria-label="Loading page" aria-busy="true">
    <Skeleton width="min(240px,55%)" height={28}/>
    <Skeleton width="min(360px,75%)" height={16} style={{marginTop:12,marginBottom:24}}/>
    <div className={cards?'material-grid':'stats-grid'}>{Array.from({length:cards?6:4}).map((_,i)=><div className="kn-skeleton-surface" key={i}><Skeleton width="42%" height={16}/><Skeleton width="72%" height={12}/><Skeleton width="55%" height={12}/></div>)}</div>
  </div>;
}
export function DashboardSkeleton() {
  return <div className="kn-dashboard-skeleton" role="status" aria-label="Loading dashboard" aria-busy="true">
    <div className="kn-skeleton-hero">
      <div className="kn-skeleton-hero-copy">
        <Skeleton width="min(390px,90%)" height={42} radius={14}/>
        <Skeleton width="min(260px,75%)" height={18}/>
        <div style={{marginTop:24,maxWidth:450,width:'100%'}}><Skeleton width="100%" height={14}/><Skeleton width="100%" height={9} radius={20} style={{marginTop:12}}/></div>
        <div style={{display:'flex',gap:12,marginTop:22}}><Skeleton width={190} height={46}/><Skeleton width={145} height={46}/></div>
      </div>
      <div className="kn-skeleton-hero-owl"><Skeleton width={240} height={210} radius={35}/></div>
    </div>
    <div className="kn-skeleton-dashboard-grid">
      {[0,1].map(k=><div className="kn-skeleton-surface" key={k}>
        <Skeleton width="45%" height={26}/><Skeleton width="65%" height={15} style={{marginBottom:20}}/>
        {[0,1,2].map(i=><div className="kn-skeleton-list-row" key={i}><Skeleton width={42} height={42} radius={12}/><div style={{flex:1}}><Skeleton width="60%" height={15}/><Skeleton width="42%" height={12} style={{marginTop:10}}/></div></div>)}
      </div>)}
    </div>
  </div>;
}

export function SectionTitle({title,subtitle,action}) { return <div className="section-title"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>; }

export function ConfirmDialog({title,body,confirmLabel,onConfirm,onCancel,icon:Icon=LogOut}) {
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
      <div className="dialog-icon"><Icon size={20}/></div><h3 id="dlg-title">{title}</h3><p id="dlg-body">{body}</p>
      <div className="dialog-actions"><button type="button" ref={cancelRef} className="btn outline" onClick={onCancel}>Cancel</button><button type="button" className="btn primary danger" onClick={onConfirm}>{confirmLabel}</button></div>
    </div></div>,document.body);
}

/** A dialog that asks for one line of text (e.g. a folder name). `onSubmit` gets the raw text; the caller cleans it. */
export function PromptDialog({title,body,label,value='',placeholder,maxLength=40,suggestions=[],confirmLabel='Save',allowEmpty=false,icon:Icon=FolderInput,onSubmit,onCancel}) {
  const [v,setV]=useState(value); const inputRef=useRef(null); const cancelFn=useRef(onCancel); cancelFn.current=onCancel;
  useEffect(()=>{
    const prev=document.activeElement; if(inputRef.current){inputRef.current.focus();inputRef.current.select()}
    const key=e=>{
      if(e.key==='Escape')cancelFn.current();
      if(e.key==='Tab'){ const f=[...document.querySelectorAll('.dialog button, .dialog input')].filter(x=>!x.disabled); if(!f.length)return;
        const first=f[0],last=f[f.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()} }
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key); prev&&prev.focus&&prev.focus()};
  },[]);
  const ok=allowEmpty||v.trim().length>0;
  const submit=e=>{e.preventDefault(); if(ok)onSubmit(v)};
  return createPortal(<div className="dialog-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onCancel()}}>
    <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="pd-title">
      <div className="dialog-icon info"><Icon size={20}/></div><h3 id="pd-title">{title}</h3>{body&&<p>{body}</p>}
      <form onSubmit={submit}>
        <label className="field-label" htmlFor="pd-input">{label}</label>
        <input id="pd-input" ref={inputRef} className="field" maxLength={maxLength} value={v} placeholder={placeholder} onChange={e=>setV(e.target.value)}/>
        {suggestions.length>0&&<div className="lib-tags wrap" style={{marginTop:10}}>{suggestions.map(x=><button type="button" key={x} className={x===v?'on':''} onClick={()=>setV(x)}>{x}</button>)}</div>}
        <div className="dialog-actions" style={{marginTop:20}}><button type="button" className="btn outline" onClick={onCancel}>Cancel</button><button type="submit" className="btn primary" disabled={!ok}>{confirmLabel}</button></div>
      </form>
    </div></div>,document.body);
}
