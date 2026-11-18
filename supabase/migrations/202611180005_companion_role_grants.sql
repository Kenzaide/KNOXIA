-- Repair Knowl database privileges without disabling row-level security.
-- Conversation writes use the authenticated user's JWT; server-generated
-- messages are written by the verified Edge Function using service_role.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.companion_conversations to authenticated;
grant select on public.companion_messages to authenticated;
grant select, insert, update, delete on public.companion_conversations to service_role;
grant select, insert, update, delete on public.companion_messages to service_role;

-- Keep row-level security enabled: conversation ownership is enforced by
-- the existing "companion conversations own" policy.
alter table public.companion_conversations enable row level security;
alter table public.companion_messages enable row level security;
