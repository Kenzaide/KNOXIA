import React, { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from './theme.jsx';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { tab } from './storage.js';
import { Eye, EyeOff, BrainCircuit, GraduationCap, MailCheck, KeyRound, PartyPopper, AlertCircle, Camera, Check, Circle, Info } from 'lucide-react';
import { toast } from './materials.jsx';
import { logEvent } from './data.js';
import { useAuth, REMEMBER_DAYS } from './session.js';
import { registerAccount, authenticate, verifyAccount, useProfile, ALLOW_DEMO_LOGIN, YEARS, USERNAME_RE, USERNAME_HELP } from './accounts.js';
import { fileToAvatar, AVATAR_ACCEPT } from './avatar.js';

const store = { get: k => tab.getRaw(k) || '', set: (k, v) => { tab.setRaw(k, v); } };

function Shell({ children, wide }) {
  return <div className={`auth-screen ${wide ? 'auth-long' : ''}`}><div className="auth-brand"><Link to="/" className="brand"><img className="brand-logo" src="/logo.png" alt="" width="36" height="36" /><span>KNOXIA</span></Link></div><ThemeToggle className="auth-theme" />{children}<div className="auth-footer">© 2026 KNOXIA. Learn smarter. Grow together.</div></div>;
}
const Card = ({ icon: I, title, sub, wide, children }) => <div className={`auth-card ${wide ? 'wide' : ''}`}><div className="auth-icon"><I size={24} /></div><h1>{title}</h1><p>{sub}</p>{children}</div>;
const Submit = ({ busy, children }) => <button type="submit" disabled={busy} className="btn primary">{busy ? <i className="spin" aria-hidden="true" /> : null}<span>{children}</span></button>;
const Err = ({ msg }) => msg ? <div className="notice error" role="alert"><AlertCircle size={16} />{msg}</div> : null;
const Field = ({ label, optional, children }) => <label className="afield"><span className="field-label">{label}{optional && <em> (optional)</em>}</span>{children}</label>;
const Legal = ({ from = '/login' }) => <>By continuing you agree to the <Link to="/terms" state={{ from }}>Terms and Conditions</Link> and <Link to="/privacy" state={{ from }}>Privacy Policy</Link>.</>;

function Password({ value, onChange, placeholder = 'Enter your password', name, autoComplete }) {
  const [show, setShow] = useState(false);
  return <div className="password-field"><input className="field" name={name} autoComplete={autoComplete} type={show ? 'text' : 'password'} required placeholder={placeholder} value={value} onChange={onChange} /><button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>;
}
const RULES = [['At least 8 characters', p => p.length >= 8], ['One uppercase letter (A–Z)', p => /[A-Z]/.test(p)], ['One lowercase letter (a–z)', p => /[a-z]/.test(p)], ['One number (0–9)', p => /\d/.test(p)], ['One symbol such as ! @ # $ (recommended)', p => /[^A-Za-z0-9]/.test(p), true]];
const pwOk = p => RULES.every(([, t, opt]) => opt || t(p));
function PasswordRules({ pw }) {
  const n = RULES.filter(([, t]) => t(pw)).length; const label = !pw ? '' : n < 4 ? 'Weak' : n === 4 ? 'Good' : 'Strong'; const color = n < 4 ? '#E0455A' : n === 4 ? '#F5B942' : '#16A37F';
  return <div className="pw-rules" aria-live="polite"><div className="pw-head"><b>Password requirements</b>{label && <small style={{ color }}>{label}</small>}</div><div className="pw-meter"><span style={{ width: (pw ? n / RULES.length * 100 : 0) + '%', background: color }} /></div>
    <ul>{RULES.map(([l, t]) => <li key={l} className={t(pw) ? 'ok' : ''}>{t(pw) ? <Check size={14} /> : <Circle size={14} />}{l}</li>)}</ul><small>Tip: a passphrase of 3–4 random words is easy to remember and hard to guess. Avoid your name, birthday or common words.</small></div>;
}
const Match = ({ a, b }) => b ? <small className={`pw-match ${a === b ? 'ok' : ''}`}>{a === b ? 'Passwords match' : 'Passwords do not match yet'}</small> : null;
const useFake = (done) => { const [busy, setBusy] = useState(false); return [busy, () => { setBusy(true); setTimeout(async () => { try { await done(); } catch (e) { console.error(e); } finally { setBusy(false); } }, 700); }]; };

export function Login() {
  const { login } = useAuth(); const nav = useNavigate(); const st = useLocation().state; const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [remember, setRemember] = useState(true); const [err, setErr] = useState('');
  // Registered accounts must match their password; starting the session is then enough: the app's route guard sends the user to the page they originally asked for (or the dashboard).
  const [busy, go] = useFake(async () => {
    const r = await authenticate(email, pw);
    if (r.reason === 'unverified') { store.set('knoxia-pending-email', r.account.email); store.set('knoxia-name', r.account.first); nav('/verify-email'); return; }
    if (!r.ok) { setErr('Incorrect email or password.'); return; }
    setErr(''); login({ email: r.account.email, name: r.account.first, remember });
  });
  const note = st && st.notice === 'logged-out' ? 'You’ve been logged out.' : st && st.from ? 'Please log in to continue.' : '';
  return <Shell><Card icon={BrainCircuit} title="Welcome back!" sub="Sign in to continue learning and growing.">
    {note && <div className="notice" role="status"><Info size={16} />{note}</div>}
    <form onSubmit={e => { e.preventDefault(); if (!busy) go(); }}>
      <Field label="Email address"><input className="field" type="email" required autoComplete="email" placeholder="Enter your email address" value={email} onChange={e => setEmail(e.target.value)} /></Field>
      <Field label="Password"><Password value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" /></Field>
      <div className="login-opts"><label className="check-inline" title={`Stay signed in on this device for ${REMEMBER_DAYS} days`}><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Remember me</label><Link to="/forgot-password">Forgot password?</Link></div>
      <Err msg={err} /><Submit busy={busy}>Log in</Submit></form>
    <div className="auth-switch">New to KNOXIA? <Link to="/register">Sign up</Link></div>
    {ALLOW_DEMO_LOGIN && <p className="auth-legal">Demo mode: an email that isn’t registered yet signs in with any password.</p>}
    <p className="auth-legal"><Legal /></p></Card></Shell>;
}

export function Register() {
  const nav = useNavigate(); const blank = { first: '', middle: '', last: '', suffix: '', email: '', username: '', pw: '', pw2: '', sid: '', school: '', college: '', course: '', year: '', section: '', terms: false, privacy: false };
  const DRAFT = 'knoxia-reg-draft'; const [f, setF] = useState(() => ({ ...blank, ...tab.get(DRAFT, {}) }));
  useEffect(() => { const { pw, pw2, ...rest } = f; tab.set(DRAFT, rest); }, [f]); const [err, setErr] = useState(''); const [photo, setPhoto] = useState('');
  const set = k => e => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  // Saves the account (persisted in this browser, see src/accounts.js), then asks for the email code.
  const [busy, go] = useFake(async () => {
    const r = await registerAccount({ ...f, avatar: photo });
    if (r.error) { setErr(r.error); return; }
    tab.remove(DRAFT);
    store.set('knoxia-pending-email', r.account.email); store.set('knoxia-name', r.account.first);
    logEvent(`New user registered: ${f.first} ${f.last}`); nav('/verify-email');
  });
  const submit = e => { e.preventDefault(); if (busy) return;
    if (!USERNAME_RE.test(f.username.trim())) return setErr(USERNAME_HELP);
    if (!pwOk(f.pw)) return setErr('Your password doesn’t meet all the requirements listed under the password fields.');
    if (f.pw !== f.pw2) return setErr('Passwords do not match.');
    if (!f.terms || !f.privacy) return setErr('Please agree to the Terms and Conditions and the Privacy Policy.');
    setErr(''); go(); };
  return <Shell wide><Card wide icon={GraduationCap} title="Create your account" sub="Tell us about yourself so KNOXIA can personalize your study space.">
    <form onSubmit={submit}>
      <fieldset><legend>Personal information</legend>
        <label className="photo-pick">{photo ? <img src={photo} alt="Profile preview" /> : <Camera size={22} />}<input type="file" accept={AVATAR_ACCEPT} hidden onChange={async e => { const x = e.target.files[0]; e.target.value = ''; if (!x) return; try { setPhoto(await fileToAvatar(x)); setErr(''); } catch (ex) { setErr(ex.message || 'That picture could not be used.'); } }} /><span>Upload your profile picture <em>(optional)</em></span></label>
        <div className="form-grid"><Field label="First name"><input className="field" required autoComplete="given-name" placeholder="Enter your first name" value={f.first} onChange={set('first')} /></Field><Field label="Middle name" optional><input className="field" autoComplete="additional-name" placeholder="Enter your middle name (optional)" value={f.middle} onChange={set('middle')} /></Field>
          <Field label="Last name"><input className="field" required autoComplete="family-name" placeholder="Enter your last name" value={f.last} onChange={set('last')} /></Field><Field label="Suffix" optional><input className="field" placeholder="Enter your suffix (optional)" value={f.suffix} onChange={set('suffix')} /></Field></div></fieldset>
      <fieldset><legend>Account information</legend>
        <div className="form-grid"><Field label="Email address"><input className="field" type="email" required autoComplete="email" placeholder="Enter your email address" value={f.email} onChange={set('email')} /></Field><Field label="Username"><input className="field" required autoComplete="username" placeholder="Choose a username" value={f.username} onChange={set('username')} /></Field>
          <Field label="Password"><Password value={f.pw} onChange={set('pw')} placeholder="Create a password" autoComplete="new-password" /></Field><Field label="Confirm password"><Password value={f.pw2} onChange={set('pw2')} placeholder="Re-enter your password" autoComplete="new-password" /><Match a={f.pw} b={f.pw2} /></Field></div><PasswordRules pw={f.pw} /></fieldset>
      <fieldset><legend>Academic information</legend>
        <div className="form-grid"><Field label="University / School"><input className="field wide-field" required autoComplete="organization" placeholder="Enter your university or school name" value={f.school} onChange={set('school')} /></Field>
          <Field label="Student ID number"><input className="field" required placeholder="Enter your student ID number" value={f.sid} onChange={set('sid')} /></Field><Field label="College / Department"><input className="field" required placeholder="Enter your college or department" value={f.college} onChange={set('college')} /></Field>
          <Field label="Course / Program"><input className="field" required placeholder="Enter your course or program" value={f.course} onChange={set('course')} /></Field><Field label="Year level"><select className="field" required value={f.year} onChange={set('year')}><option value="" disabled>Select your year level</option>{YEARS.map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Section" optional><input className="field" placeholder="Enter your section (optional)" value={f.section} onChange={set('section')} /></Field></div></fieldset>
      <div className="agree"><label className="check-inline"><input type="checkbox" checked={f.terms} onChange={set('terms')} /> I agree to the <Link to="/terms" state={{ from: '/register' }}>Terms and Conditions</Link></label><label className="check-inline"><input type="checkbox" checked={f.privacy} onChange={set('privacy')} /> I agree to the <Link to="/privacy" state={{ from: '/register' }}>Privacy Policy</Link></label></div>
      <Err msg={err} /><Submit busy={busy}>Create account</Submit></form>
    <div className="auth-switch">Already have an account? <Link to="/login">Log in</Link></div></Card></Shell>;
}

export function Forgot() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false);
  const [busy, go] = useFake(() => { store.set('knoxia-email', email); setSent(true); });
  return <Shell><Card icon={KeyRound} title="Forgot password?" sub="Enter your registered email and we’ll send you a link to reset it.">
    <form onSubmit={e => { e.preventDefault(); if (!busy) go(); }}><Field label="Registered email address"><input className="field" type="email" required autoComplete="email" placeholder="Enter your email address" value={email} onChange={e => setEmail(e.target.value)} /></Field><Submit busy={busy}>Send reset link</Submit>
      {sent && <p className="auth-sent">If an account exists for {email}, a reset link is on its way. <Link to="/reset-password">Open reset page (demo)</Link></p>}</form>
    <div className="auth-switch"><Link to="/login">Back to login</Link></div></Card></Shell>;
}

export function ResetPassword() {
  const nav = useNavigate(); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState('');
  const [busy, go] = useFake(() => { toast('Password updated'); nav('/login'); });
  return <Shell><Card icon={KeyRound} title="Set a new password" sub="Choose a password you haven’t used before.">
    <form onSubmit={e => { e.preventDefault(); if (busy) return; if (!pwOk(pw)) return setErr('Your password doesn’t meet all the requirements listed below.'); if (pw !== pw2) return setErr('Passwords do not match.'); setErr(''); go(); }}>
      <Field label="New password"><Password value={pw} onChange={e => setPw(e.target.value)} placeholder="Create a password" autoComplete="new-password" /></Field><Field label="Confirm new password"><Password value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Re-enter your password" autoComplete="new-password" /><Match a={pw} b={pw2} /></Field><PasswordRules pw={pw} />
      <Err msg={err} /><Submit busy={busy}>Update password</Submit></form><div className="auth-switch"><Link to="/login">Back to login</Link></div></Card></Shell>;
}

export function VerifyEmail() {
  const { isAuthenticated, login } = useAuth(); const pending = store.get('knoxia-pending-email'); const email = pending || 'your email'; const verified = useRef(false);
  const [code, setCode] = useState(Array(6).fill('')); const [err, setErr] = useState(''); const [wait, setWait] = useState(30);
  // Verifying the code finishes sign-up and signs the new user in (for this tab only; they did not choose "remember me").
  const [busy, go] = useFake(() => { verifyAccount(pending); verified.current = true; login({ email: pending, name: store.get('knoxia-name'), remember: false }); store.set('knoxia-pending-email', ''); });
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  if (isAuthenticated) return <Navigate to={verified.current ? '/welcome' : '/dashboard'} replace />;
  if (!pending) return <Navigate to="/register" replace />; // nothing to verify: this page is only reachable from sign-up
  const put = (i, v) => { const d = v.replace(/\D/g, '').slice(-1); setCode(c => c.map((x, k) => k === i ? d : x)); if (d && i < 5) document.getElementById('otp' + (i + 1))?.focus(); };
  const paste = e => { const d = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); if (d) { e.preventDefault(); setCode(Array.from({ length: 6 }, (_, k) => d[k] || '')); } };
  return <Shell><Card icon={MailCheck} title="Verify your email" sub={`Enter the 6-digit code we sent to ${email}.`}>
    <form onSubmit={e => { e.preventDefault(); if (busy) return; if (code.join('').length < 6) return setErr('Enter all 6 digits.'); setErr(''); go(); }}>
      <div className="otp" onPaste={paste}>{code.map((c, i) => <input key={i} id={'otp' + i} aria-label={`Digit ${i + 1}`} inputMode="numeric" autoComplete={i ? 'off' : 'one-time-code'} maxLength={1} value={c} onChange={e => put(i, e.target.value)} onKeyDown={e => { if (e.key === 'Backspace' && !c && i > 0) document.getElementById('otp' + (i - 1))?.focus(); }} />)}</div>
      <Err msg={err} /><Submit busy={busy}>Verify account</Submit></form>
    <div className="auth-switch"><button type="button" className="link-btn" disabled={wait > 0} onClick={() => { setWait(30); toast('Code resent'); }}>{wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}</button> · <Link to="/register">Change email</Link></div>
    <p className="auth-legal">Demo mode: any 6 digits will verify. Real codes need an email service.</p></Card></Shell>;
}

export function Welcome() {
  const nav = useNavigate(); const me = useProfile(); const name = me.exists ? me.first : store.get('knoxia-name');
  return <Shell><Card icon={PartyPopper} title={`Account created${name ? ', ' + name : ''}!`} sub="Your email is verified. Upload your first material to build a reviewer, flashcards or a quiz.">
    <div className="welcome-actions"><button className="btn primary" onClick={() => nav('/materials/upload')}>Upload your first file</button><button className="btn outline" onClick={() => nav('/dashboard')}>Go to dashboard</button></div></Card></Shell>;
}

const LEGAL = {
  '/terms': ['Terms and Conditions', [['Using KNOXIA', 'KNOXIA is a study platform for students. You agree to use it for lawful learning purposes and to keep your account details accurate.'], ['Your content', 'You own the materials you upload. You give KNOXIA permission to process them to create reviewers, flashcards and quizzes for you.'], ['Community conduct', 'Do not post harmful, misleading or infringing content. Reported content may be removed by moderators.'], ['Changes', 'We may update these terms. Continued use after an update means you accept it.']]],
  '/privacy': ['Privacy Policy', [['What we collect', 'Account details (name, email, username), academic details (student ID, college, program, year level) and the materials you upload.'], ['How we use it', 'To run your account, personalize your dashboard, study groups and leaderboards, and generate study tools from your materials.'], ['Sharing', 'Your materials are private by default. Profile details are shown to others only as your privacy settings allow.'], ['Your choices', 'You can edit or delete your data from Settings, or contact support.']]],
};
export function Legal_({ path }) {
  const nav = useNavigate(); const from = useLocation().state?.from || '/login'; const [title, secs] = LEGAL[path];
  return <Shell wide><div className="auth-card wide legal-doc"><h1>{title}</h1><p className="auth-legal">Draft for the prototype. Have it reviewed before launch.</p>{secs.map(([h, t]) => <section key={h}><h2>{h}</h2><p>{t}</p></section>)}<div className="auth-switch"><button type="button" className="btn primary" onClick={() => nav(from)}>{from === '/register' ? 'Back to sign up' : 'Back to log in'}</button></div></div></Shell>;
}

export function authPage(path) {
  switch (path) {
    case '/login': return <Login />; case '/register': return <Register />; case '/forgot-password': return <Forgot />;
    case '/reset-password': return <ResetPassword />; case '/verify-email': return <VerifyEmail />; case '/welcome': return <Welcome />;
    case '/terms': case '/privacy': return <Legal_ path={path} />;
    default: return null;
  }
}
