/** Phase 7 browser-only administration. Never treat this as server authorization. */
import { useSyncExternalStore } from 'react';
import { local } from './storage.js';
export const ADMIN_KEY = 'knoxia-admin-phase7';
const EMPTY = { statuses: {}, reports: [], actions: [] };
const read = () => local.get(ADMIN_KEY, EMPTY, v => !!v && typeof v === 'object' && !Array.isArray(v));
export const useAdminData = () => useSyncExternalStore(fn => local.subscribe(ADMIN_KEY, fn), read, () => EMPTY);
export const isDemoAdmin = (profile) => profile?.email?.toLowerCase() === 'admin@knoxia.local';
export function adminAction(actor, type, detail, update = x => x) {
  if (!isDemoAdmin(actor)) return false;
  const now = new Date().toISOString();
  local.update(ADMIN_KEY, current => {
    const base = { ...EMPTY, ...current };
    const changed = update(base);
    return { ...changed, actions: [{ id: `adm-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, at: now, actor: actor.email, type, detail }, ...(base.actions || [])].slice(0, 500) };
  }, EMPTY);
  return true;
}
export const setAccountStatus = (actor, email, status) => adminAction(actor, 'Account status', `${email}: ${status}`, x => ({ ...x, statuses: { ...x.statuses, [email]: status } }));
export const updateReport = (actor, report, status, note) => adminAction(actor, 'Moderation', `${report.type || 'Content'}: ${status}`, x => ({ ...x, reports: [...x.reports.filter(r => r.id !== report.id), { ...report, status, note, reviewedAt: new Date().toISOString(), reviewer: actor.email }] }));
export const submitReport = (report) => local.update(ADMIN_KEY, x => ({ ...EMPTY, ...x, reports: [...(x?.reports || []), { ...report, id: `report-${Date.now()}`, status: 'Pending', createdAt: new Date().toISOString() }] }), EMPTY);
