import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut } from 'lucide-react';

/* Shared UI pieces used across pages. */
export function Button({children,variant='primary',icon:Icon,onClick,type='button',loading=false}) { return <button type={type} onClick={onClick} disabled={loading} className={`btn ${variant}`}>{loading?<i className="spin" aria-hidden="true"/>:Icon&&<Icon size={16}/>}<span>{children}</span></button>; }

// Stand-in for data fetching: shows skeletons briefly until a real API is connected.
export function usePending(ms=450) { const [p,setP]=useState(true); useEffect(()=>{const t=setTimeout(()=>setP(false),ms);return()=>clearTimeout(t)},[ms]); return p; }

export function PageSkeleton({cards=false}) { return <div aria-busy="true" aria-label="Loading"><div className="skel" style={{height:28,width:240,marginBottom:12}}/><div className="skel" style={{height:16,width:340,marginBottom:24}}/><div className={cards?'material-grid':'stats-grid'}>{Array.from({length:cards?6:4}).map((_,i)=><div className="skel skel-card" key={i} style={{height:cards?176:88}}/>)}</div></div>; }

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
