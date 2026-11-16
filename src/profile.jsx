import React, { useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Camera, Trash2, AlertCircle, Info } from 'lucide-react';
import { useProfile, updateProfile, profileError, YEARS, BIO_MAX } from './accounts.js';
import { fileToAvatar, AVATAR_ACCEPT } from './avatar.js';
import { toast } from './materials.jsx';

/** The signed-in person's picture, or their initials when they have not uploaded one. Pass `profile` to show someone else. */
export function UserAvatar({ size = 'md', online = false, profile }) {
  const mine = useProfile(); const p = profile || mine;
  return <div className={`avatar ${size}`}>{p.avatar ? <img src={p.avatar} alt="" /> : p.initials}{online && <i />}</div>;
}

const memberSince = (t) => (t ? new Date(t).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');
const Field = ({ label, optional, hint, children }) => <label className="afield"><span className="field-label">{label}{optional && <em> (optional)</em>}</span>{children}{hint && <small className="field-hint">{hint}</small>}</label>;
const FIELDS = ['first', 'middle', 'last', 'suffix', 'username', 'bio', 'sid', 'school', 'college', 'course', 'year', 'section', 'avatar'];
const pick = (p) => Object.fromEntries(FIELDS.map((k) => [k, p[k] || '']));

/** Edit your own profile: photo, name, username, bio and academic details. Used in Settings > Profile. */
export function ProfileEditor() {
  const p = useProfile();
  // Remount when the saved profile changes (after saving, or an edit from another tab) so the form always starts from what is stored.
  return <ProfileForm key={p.updatedAt || 'new'} p={p} />;
}

function ProfileForm({ p }) {
  const base = pick(p); const [f, setF] = useState(base); const [err, setErr] = useState(''); const [photoErr, setPhotoErr] = useState(''); const [busy, setBusy] = useState(false); const file = useRef(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const dirty = FIELDS.some((k) => f[k] !== base[k]);
  const preview = { ...p, avatar: f.avatar, initials: ((f.first[0] || '') + (f.last[0] || f.first[1] || '')).toUpperCase() || p.initials };

  const choose = async (e) => {
    const x = e.target.files && e.target.files[0]; e.target.value = ''; if (!x) return;
    setPhotoErr(''); setBusy(true);
    try { const url = await fileToAvatar(x); setF((v) => ({ ...v, avatar: url })); } catch (ex) { setPhotoErr(ex.message || 'That picture could not be used.'); }
    setBusy(false);
  };
  const submit = (e) => {
    e.preventDefault(); if (!dirty) return;
    const msg = profileError(f, p.id); if (msg) return setErr(msg);
    const r = updateProfile(p.email, f); if (r.error) return setErr(r.error);
    setErr(''); toast('Profile updated');
  };

  return <form className="profile-form" onSubmit={submit}>
    <h3>Profile information</h3>
    <p className="settings-sub">This is how you appear across KNOXIA. Changes show up everywhere as soon as you save.</p>
    <div className="profile-edit">
      <UserAvatar size="xl" profile={preview} />
      <div><b>Profile photo</b><small>PNG, JPEG or WebP, up to 5 MB. It is cropped to a square.</small>{photoErr && <small className="field-error" role="alert">{photoErr}</small>}</div>
      <div className="profile-edit-actions">
        <input ref={file} type="file" accept={AVATAR_ACCEPT} hidden onChange={choose} />
        <button type="button" className="btn outline" disabled={busy} onClick={() => file.current && file.current.click()}><Camera size={16} /><span>{f.avatar ? 'Change' : 'Upload'}</span></button>
        {f.avatar && <button type="button" className="btn outline" onClick={() => setF((v) => ({ ...v, avatar: '' }))}><Trash2 size={16} /><span>Remove</span></button>}
      </div>
    </div>

    <fieldset><legend>Personal information</legend>
      <div className="form-grid">
        <Field label="First name"><input className="field" required autoComplete="given-name" value={f.first} onChange={set('first')} /></Field>
        <Field label="Middle name" optional><input className="field" autoComplete="additional-name" value={f.middle} onChange={set('middle')} /></Field>
        <Field label="Last name"><input className="field" required autoComplete="family-name" value={f.last} onChange={set('last')} /></Field>
        <Field label="Suffix" optional><input className="field" value={f.suffix} onChange={set('suffix')} /></Field>
      </div>
      <Field label="Bio" optional hint={`${f.bio.length}/${BIO_MAX}`}><textarea className="field" rows={3} maxLength={BIO_MAX} placeholder="Tell others a little about how you like to study." value={f.bio} onChange={set('bio')} /></Field>
    </fieldset>

    <fieldset><legend>Academic details</legend>
      <div className="form-grid">
        <Field label="University / School"><input className="field wide-field" autoComplete="organization" value={f.school} onChange={set('school')} /></Field>
        <Field label="Student ID number"><input className="field" value={f.sid} onChange={set('sid')} /></Field>
        <Field label="College / Department"><input className="field" value={f.college} onChange={set('college')} /></Field>
        <Field label="Course / Program"><input className="field" value={f.course} onChange={set('course')} /></Field>
        <Field label="Year level"><select className="field" value={f.year} onChange={set('year')}><option value="">Not set</option>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></Field>
        <Field label="Section" optional><input className="field" value={f.section} onChange={set('section')} /></Field>
      </div>
    </fieldset>

    <fieldset><legend>Account information</legend>
      <div className="form-grid">
        <Field label="Username" hint="Your public handle. Others find you as @username."><input className="field" required autoComplete="username" value={f.username} onChange={set('username')} /></Field>
        <Field label="Email address" hint="Your sign-in email. Changing it will need email verification once the backend is connected."><input className="field" type="email" value={p.email} readOnly disabled /></Field>
      </div>
      <dl className="account-facts">
        <div><dt>Member since</dt><dd>{memberSince(p.createdAt) || 'Today'}</dd></div>
        <div><dt>Account status</dt><dd>{p.demo ? 'Demo account' : p.verified ? 'Email verified' : 'Email not verified'}</dd></div>
      </dl>
      {p.demo && <div className="notice" role="note"><Info size={16} />This is a demo account (any email signs in while there is no backend). Your profile is still saved in this browser.</div>}
    </fieldset>

    {err && <div className="notice error" role="alert"><AlertCircle size={16} />{err}</div>}
    <div className="form-actions">
      <button type="submit" className="btn primary" disabled={!dirty}><span>Save changes</span></button>
      <button type="button" className="btn outline" disabled={!dirty} onClick={() => { setF(base); setErr(''); setPhotoErr(''); }}><span>Discard</span></button>
    </div>
  </form>;
}

/** Top card of a profile page. `mine` shows an Edit button; otherwise `action` (e.g. Add friend). */
export function ProfileHeader({ p, mine, action }) {
  return <div className="panel profile-cover">
    <div className="profile-avatar"><UserAvatar size="xl" profile={p} /></div>
    <div className="profile-info"><h1>{p.displayName}</h1><p>@{p.username}{p.academic ? ` · ${p.academic}` : ''}</p>{p.bio && <span>{p.bio}</span>}</div>
    {mine ? <NavLink to="/settings" className="btn outline">Edit profile</NavLink> : action}
  </div>;
}

/** Academic and account details. Private details (student ID, email) only show on your own profile. */
export function ProfileDetails({ p, mine }) {
  const rows = [['University / School', p.school], ['College / Department', p.college], ['Course / Program', p.course], ['Year level', p.year], ['Section', p.section],
    ...(mine ? [['Student ID', p.sid], ['Email', p.email]] : []), ['Member since', memberSince(p.createdAt)]].filter(([, v]) => v);
  const incomplete = mine && (!p.school || !p.course || !p.year);
  return <div className="panel profile-details">
    <h3>About</h3>
    {incomplete && <div className="notice" role="note"><Info size={16} /><span>Add your academic details so classmates can find you. <NavLink to="/settings">Complete your profile</NavLink></span></div>}
    {rows.length ? <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : <p className="muted">No details shared yet.</p>}
  </div>;
}
