/**
 * Supabase friend-request API. The Friends UI still needs async hook integration.
 * All writes are checked by the existing public.friend_requests RLS policies.
 */
import { supabase } from './supabase.js';

async function signedIn() {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Please sign in again.');
  return data.user.id;
}
function result({ data, error }) {
  if (error) throw error;
  return data;
}
export async function getFriendRequests() {
  const uid = await signedIn();
  return result(await supabase.from('friend_requests')
    .select('id,sender_id,receiver_id,status,created_at')
    .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
    .order('created_at', { ascending: false }));
}
export async function requestFriendship(receiverId) {
  const uid = await signedIn();
  if (!receiverId || receiverId === uid) throw new Error('Choose another student.');
  return result(await supabase.from('friend_requests').insert({
    sender_id: uid, receiver_id: receiverId, status: 'pending',
  }).select().single());
}
export async function acceptFriendship(requestId) {
  const uid = await signedIn();
  return result(await supabase.from('friend_requests').update({ status: 'accepted' })
    .eq('id', requestId).eq('receiver_id', uid).eq('status', 'pending').select().single());
}
export async function declineFriendship(requestId) {
  const uid = await signedIn();
  return result(await supabase.from('friend_requests').update({ status: 'declined' })
    .eq('id', requestId).eq('receiver_id', uid).eq('status', 'pending').select().single());
}
export async function cancelFriendshipRequest(requestId) {
  const uid = await signedIn();
  return result(await supabase.from('friend_requests').delete()
    .eq('id', requestId).eq('sender_id', uid).eq('status', 'pending').select().single());
}
export async function removeAcceptedFriendship(requestId) {
  const uid = await signedIn();
  // RLS restricts deletion to sender or receiver.
  return result(await supabase.from('friend_requests').delete()
    .eq('id', requestId).eq('status', 'accepted')
    .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`).select().single());
}
