/**
 * Supabase persistence adapters for KNOXIA learning modules.
 * These functions are intentionally separate from the existing synchronous UI stores.
 * Wire each screen only after its loading/error states and navigation are made async-safe.
 * Never fall back to demo/local data when a server write fails.
 */
import { supabase } from './supabase.js';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
async function userId() {
  const { data, error } = await client().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Please sign in again.');
  return data.user.id;
}
function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}
const uniqueId = () => crypto.randomUUID();

// Materials: metadata is stored in public.materials, bytes in the private "materials" bucket.
// Uses the existing private learning-materials bucket; verify its DELETE/UPDATE policies before production use.
export async function listMaterials() {
  const uid = await userId();
  return unwrap(await client().from('materials').select('id,title,description,storage_path,mime_type,visibility,created_at')
    .eq('owner_id', uid).order('created_at', { ascending: false }));
}
export async function uploadMaterial(file, { title, description = '', visibility = 'private' } = {}) {
  const uid = await userId();
  if (!file || !file.size) throw new Error('Choose a file to upload.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Files must be 25 MB or smaller.');
  const id = uniqueId();
  const path = `${uid}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  unwrap(await client().storage.from('learning-materials').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' }));
  try {
    return unwrap(await client().from('materials').insert({
      id, owner_id: uid, title: String(title || file.name).slice(0, 200),
      description, storage_path: path, mime_type: file.type || null, visibility,
    }).select().single());
  } catch (error) {
    await client().storage.from('learning-materials').remove([path]);
    throw error;
  }
}
/**
 * Fetch a private material's bytes. A signed URL is generated only for a
 * material belonging to the signed-in user, rather than trusting an arbitrary
 * storage path supplied by the browser.
 */
export async function downloadOwnedMaterial(id) {
  const uid = await userId();
  const row = unwrap(await client().from('materials')
    .select('title,storage_path,mime_type')
    .eq('id', id).eq('owner_id', uid).single());
  if (!row.storage_path) throw new Error('This material has no uploaded file.');
  const signedUrl = await materialDownloadUrl(row.storage_path);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error('Could not download this file. Please retry.');
  return { blob: await response.blob(), title: row.title, mimeType: row.mime_type };
}

/** Update only metadata columns known to exist in the live schema. */
export async function updateMaterialDetails(id, { title, description } = {}) {
  const uid = await userId();
  const patch = {};
  if (title !== undefined) {
    const trimmed = String(title).trim().slice(0, 200);
    if (!trimmed) throw new Error('Give this material a title.');
    patch.title = trimmed;
  }
  if (description !== undefined) patch.description = String(description);
  if (!Object.keys(patch).length) throw new Error('No changes to save.');
  return unwrap(await client().from('materials').update(patch)
    .eq('id', id).eq('owner_id', uid).select().single());
}

export async function materialDownloadUrl(path) {
  const { data, error } = await client().storage.from('learning-materials').createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
export async function deleteMaterial(id) {
  const uid = await userId();
  const row = unwrap(await client().from('materials').select('storage_path').eq('id', id).eq('owner_id', uid).single());
  unwrap(await client().from('materials').delete().eq('id', id).eq('owner_id', uid));
  // The database delete succeeds even if cleanup fails; report the storage cleanup error.
  unwrap(await client().storage.from('learning-materials').remove([row.storage_path]));
}

// Reviewer text is stored in public.reviewers. Keep generation separate from persistence.
export async function listReviewers() {
  const uid = await userId();
  return unwrap(await client().from('reviewers').select('id,material_id,title,body,created_at')
    .eq('owner_id', uid).order('created_at', { ascending: false }));
}
export async function saveReviewer({ id, title, body = '', materialId = null }) {
  const uid = await userId();
  const row = { id: id || uniqueId(), owner_id: uid, title, body, material_id: materialId };
  return unwrap(await client().from('reviewers').upsert(row, { onConflict: 'id' }).select().single());
}
export async function deleteReviewer(id) {
  const uid = await userId();
  unwrap(await client().from('reviewers').delete().eq('id', id).eq('owner_id', uid));
}

// Quiz questions are stored as JSONB, matching the existing editor's question shape.
export async function listQuizzes() {
  const uid = await userId();
  return unwrap(await client().from('quizzes').select('id,reviewer_id,title,questions,created_at')
    .eq('owner_id', uid).order('created_at', { ascending: false }));
}
export async function saveQuiz({ id, title, questions = [], reviewerId = null }) {
  const uid = await userId();
  return unwrap(await client().from('quizzes').upsert({
    id: id || uniqueId(), owner_id: uid, title, questions, reviewer_id: reviewerId,
  }, { onConflict: 'id' }).select().single());
}
export async function deleteQuiz(id) {
  const uid = await userId();
  unwrap(await client().from('quizzes').delete().eq('id', id).eq('owner_id', uid));
}
export async function saveQuizAttempt({ quizId, score, total, answers }) {
  const uid = await userId();
  return unwrap(await client().from('quiz_attempts').insert({
    quiz_id: quizId, user_id: uid, score, total, answers,
  }).select().single());
}

// Study rooms: membership and message access must also be enforced by Supabase RLS.
export async function listStudyRooms() {
  await userId();
  return unwrap(await client().from('study_rooms').select('id,owner_id,title,topic,is_public,created_at')
    .order('created_at', { ascending: false }));
}
export async function createStudyRoom({ title, topic = '', isPublic = true }) {
  const uid = await userId();
  const room = unwrap(await client().from('study_rooms').insert({
    owner_id: uid, title, topic, is_public: isPublic,
  }).select().single());
  // If membership creation fails, avoid leaving an inaccessible orphan room.
  try {
    unwrap(await client().from('room_members').insert({ room_id: room.id, user_id: uid }));
  } catch (error) {
    await client().from('study_rooms').delete().eq('id', room.id).eq('owner_id', uid);
    throw error;
  }
  return room;
}
export async function joinStudyRoom(roomId) {
  const uid = await userId();
  return unwrap(await client().from('room_members').insert({ room_id: roomId, user_id: uid }).select().single());
}
export async function leaveStudyRoom(roomId) {
  const uid = await userId();
  unwrap(await client().from('room_members').delete().eq('room_id', roomId).eq('user_id', uid));
}
export async function listRoomMessages(roomId) {
  await userId();
  return unwrap(await client().from('room_messages').select('id,room_id,author_id,body,created_at')
    .eq('room_id', roomId).order('created_at', { ascending: true }));
}
export async function sendRoomMessage(roomId, body) {
  const uid = await userId();
  return unwrap(await client().from('room_messages').insert({
    room_id: roomId, author_id: uid, body: String(body).trim(),
  }).select().single());
}
