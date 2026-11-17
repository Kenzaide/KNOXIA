"""Run from KNOXIA project root: python path/to/install_patch40.py"""
from pathlib import Path
import shutil,sys
root=Path.cwd(); src=root/'src'; pkg=Path(__file__).resolve().parent
if not (src/'App.jsx').exists() or not (src/'auth.jsx').exists():
 sys.exit('Run from the KNOXIA project root (src/App.jsx missing).')
app=(src/'App.jsx').read_text(encoding='utf-8'); auth=(src/'auth.jsx').read_text(encoding='utf-8')
auth_changes=[
 ("import React, { useEffect, useRef, useState } from 'react';", "import React, { useEffect, useRef, useState } from 'react';\nimport { LoginSupabase, RegisterSupabase, ForgotSupabase, ResetSupabase } from './authSupabase.jsx';"),
 ("case '/login': return <Login />; case '/register': return <Register />; case '/forgot-password': return <Forgot />;", "case '/login': return <LoginSupabase />; case '/register': return <RegisterSupabase />; case '/forgot-password': return <ForgotSupabase />;"),
 ("case '/reset-password': return <ResetPassword />; case '/verify-email': return <VerifyEmail />; case '/welcome': return <Welcome />;", "case '/reset-password': return <ResetSupabase />; case '/verify-email': return <LoginSupabase />; case '/welcome': return <Welcome />;")]
app_changes=[
 ("const {logout}=useAuth(); const me=useProfile();", "const {logout,role}=useAuth(); const me=useProfile();"),
 ("{!admin && isDemoAdmin(me) && <SideLink", "{!admin && role === 'admin' && <SideLink"),
 ("const {isAuthenticated}=useAuth(); const useProfileForAdmin=useProfile();", "const {isAuthenticated,role,ready}=useAuth(); const useProfileForAdmin=useProfile();"),
 ("if(access==='guest'&&isAuthenticated) return <Navigate to={safeRedirect(loc.state&&loc.state.from, isDemoAdmin(useProfileForAdmin) ? '/admin/dashboard' : '/dashboard')} replace/>;", "if(!ready) return <div className=\"auth-screen\" role=\"status\">Loading KNOXIA session…</div>;\n if(access==='guest'&&isAuthenticated) return <Navigate to={safeRedirect(loc.state&&loc.state.from, role === 'admin' ? '/admin/dashboard' : '/dashboard')} replace/>;"),
 ("isDemoAdmin(useProfileForAdmin) ?", "role === 'admin' ?")]
for filename,contents,changes in [('src/auth.jsx',auth,auth_changes),('src/App.jsx',app,app_changes)]:
 for old,new in changes:
  if old not in contents: sys.exit(f'Stopped without writing: expected text missing in {filename}: {old[:90]}')
  contents=contents.replace(old,new)
 if filename.endswith('auth.jsx'): auth=contents
 else: app=contents
for name in ['App.jsx','auth.jsx','session.js']:
 target=src/name
 if target.exists(): shutil.copy2(target,src/(name+'.pre-patch40.bak'))
(src/'App.jsx').write_text(app,encoding='utf-8');(src/'auth.jsx').write_text(auth,encoding='utf-8')
shutil.copy2(pkg/'src/session.js',src/'session.js');shutil.copy2(pkg/'src/authSupabase.jsx',src/'authSupabase.jsx')
print('Patch 40 installed. Run npm install @supabase/supabase-js && npm run build')
