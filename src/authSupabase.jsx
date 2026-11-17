import './authSupabase.css';
import React, {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {supabase} from './lib/supabase.js';
import {useAuth} from './session.js';
import {ThemeToggle} from './theme.jsx';
const PASSWORD_RULES = [
 ['At least 8 characters', p => p.length >= 8],
 ['One uppercase letter (A–Z)', p => /[A-Z]/.test(p)],
 ['One lowercase letter (a–z)', p => /[a-z]/.test(p)],
 ['One number (0–9)', p => /[0-9]/.test(p)],
 ['One symbol (recommended)', p => /[^A-Za-z0-9]/.test(p)]
];
const passwordValid = p => PASSWORD_RULES.slice(0,4).every(([, test]) => test(p));
function PasswordChecklist({password}) {
 const passed=PASSWORD_RULES.filter(([,test])=>test(password)).length;
 return <div className="pw-rules" aria-live="polite"><div className="pw-head"><b>Password requirements</b><small>{!password?'':passed<4?'Weak':passed===4?'Good':'Strong'}</small></div><div className="pw-meter"><span style={{width:(password?passed/5*100:0)+'%',background:passed<4?'#E0455A':passed===4?'#F5B942':'#16A37F'}}/></div><ul>{PASSWORD_RULES.map(([label,test])=><li key={label} className={test(password)?'ok':''}>{test(password)?'✓':'○'} {label}</li>)}</ul></div>;
}
function Wrap({title,subtitle,children,wide=false}) { return <div className={`auth-screen knoxia-auth-screen${wide ? " auth-screen-register" : ""}`}><header className="knoxia-auth-header"><Link to="/" className="brand knoxia-auth-brand"><img src="/logo.png" alt="KNOXIA mascot" width="40" height="40" /><span>KNOXIA</span></Link><ThemeToggle className="knoxia-auth-theme"/></header><main className="knoxia-auth-main"><div className={`auth-card knoxia-auth-card${wide ? " auth-card-register" : ""}`}><h1>{title}</h1><p>{subtitle}</p>{children}</div></main><footer className="knoxia-auth-footer">© 2026 KNOXIA · Learn smarter. Grow together.</footer></div>; }
function ErrorText({value}) { return value ? <div className="notice error" role="alert">{value}</div> : null; }
export function LoginSupabase() {
 const {login} = useAuth(); const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{await login({email,password});}catch(err){setError(err.message||'Unable to sign in.')}finally{setBusy(false)}};
 return <Wrap title="Welcome back!" subtitle="Sign in to continue learning and growing."><form onSubmit={submit}><label className="afield"><span className="field-label">Email address</span><input className="field" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Enter your email address"/></label><label className="afield"><span className="field-label">Password</span><input className="field" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/></label><ErrorText value={error}/><button className="btn primary" disabled={busy}>{busy?'Signing in…':'Log in'}</button></form><div className="auth-switch">New to KNOXIA? <Link to="/register">Sign up</Link></div><div className="auth-switch"><Link to="/forgot-password">Forgot password?</Link></div></Wrap>;
}
export function RegisterSupabase() {
 const [f,setF]=useState({first:'',last:'',username:'',email:'',password:'',confirm:''});const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const update=k=>e=>setF(p=>({...p,[k]:e.target.value}));
 const submit=async e=>{e.preventDefault();setError('');setMessage('');if(f.password!==f.confirm)return setError('Passwords do not match.');if(!passwordValid(f.password))return setError('Your password must have at least 8 characters, uppercase and lowercase letters, and a number.');if(!/^[A-Za-z0-9_.]{3,20}$/.test(f.username))return setError('Username must be 3–20 letters, numbers, dots or underscores.');if(!supabase)return setError('Supabase is not configured.');setBusy(true);
 try{const {data,error:authError}=await supabase.auth.signUp({email:f.email,password:f.password,options:{emailRedirectTo:window.location.origin+'/login',data:{full_name:`${f.first.trim()} ${f.last.trim()}`,username:f.username.trim()}}});if(authError)throw authError;setMessage(data.session?'Account created! You can now continue.':'Check your inbox for the Supabase confirmation email, then log in.');}catch(err){setError(err.message||'Registration failed.')}finally{setBusy(false)}};
 return <Wrap wide title="Create your account" subtitle="Join the KNOXIA learning community."><form className="register-grid" onSubmit={submit}>{[['First name','first','text'],['Last name','last','text'],['Username','username','text'],['Email address','email','email'],['Password','password','password'],['Confirm password','confirm','password']].map(([label,key,type])=><label key={key} className="afield"><span className="field-label">{label}</span><input className="field" type={type} required autoComplete={key==='email'?'email':key==='password'?'new-password':undefined} value={f[key]} onChange={update(key)} placeholder={label}/></label>)}<PasswordChecklist password={f.password}/>{f.confirm&&<small className={f.password===f.confirm?'pw-match ok':'pw-match'}>{f.password===f.confirm?'Passwords match':'Passwords do not match yet'}</small>}<ErrorText value={error}/>{message&&<div className="notice" role="status">{message}</div>}<button className="btn primary" disabled={busy}>{busy?'Creating account…':'Create account'}</button></form><div className="auth-switch">Already registered? <Link to="/login">Log in</Link></div></Wrap>;
}
export function ForgotSupabase() {
 const [email,setEmail]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const submit=async e=>{e.preventDefault();setBusy(true);const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/reset-password'});setMessage(error?error.message:'If an account exists, a reset link has been sent.');setBusy(false)};
 return <Wrap title="Reset your password" subtitle="Request a password reset link."><form onSubmit={submit}><input className="field" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address"/><button className="btn primary" disabled={busy}>Send reset link</button></form>{message&&<p role="status">{message}</p>}</Wrap>;
}
export function ResetSupabase() {
 const [password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const nav=useNavigate();
 const submit=async e=>{e.preventDefault();setBusy(true);const {error}=await supabase.auth.updateUser({password});setMessage(error?error.message:'Password updated. You can sign in.');setBusy(false);if(!error)setTimeout(()=>nav('/login'),1200)};
 return <Wrap title="Choose a new password" subtitle="Use the link from your password reset email."><form onSubmit={submit}><input className="field" type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="New password"/><button className="btn primary" disabled={busy}>Update password</button></form>{message&&<p role="status">{message}</p>}</Wrap>;
}
