-- Independent private chat storage; safe alongside the existing study_rooms tables.
create table if not exists public.companion_conversations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null default 'New conversation',
 material_id uuid references public.materials(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.companion_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.companion_conversations(id) on delete cascade,
 role text not null check(role in ('user','assistant')),
 content text not null check(length(content) between 1 and 10000),
 created_at timestamptz not null default now()
);
create index if not exists companion_conversations_user_recent on public.companion_conversations(user_id,updated_at desc);
create index if not exists companion_messages_order on public.companion_messages(conversation_id,created_at,id);
alter table public.companion_conversations enable row level security;
alter table public.companion_messages enable row level security;
create policy "companion conversations own" on public.companion_conversations for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "companion messages read" on public.companion_messages for select to authenticated
 using(exists(select 1 from public.companion_conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));
-- Messages are written only by the authenticated Edge Function after Gemini responds.
-- No direct client insert/update/delete policy is granted.
