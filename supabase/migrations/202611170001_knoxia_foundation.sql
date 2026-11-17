-- KNOXIA Supabase foundation. Run in Supabase SQL editor once.
create extension if not exists pgcrypto;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique, full_name text not null default '', avatar_path text,
 bio text not null default '', created_at timestamptz not null default now(),
 constraint username_format check (username is null or username ~ '^[A-Za-z0-9_.]{3,20}$')
);
create or replace function public.create_knoxia_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,username,full_name)
 values (new.id,null,coalesce(new.raw_user_meta_data->>'full_name',''))
 on conflict (id) do nothing;
 return new;
end $$;
drop trigger if exists on_knoxia_user_created on auth.users;
create trigger on_knoxia_user_created after insert on auth.users
for each row execute function public.create_knoxia_profile();
insert into public.profiles(id,full_name)
select id,coalesce(raw_user_meta_data->>'full_name','') from auth.users
on conflict(id) do nothing;

create table if not exists public.materials (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check(length(title) between 1 and 200),
 description text not null default '', storage_path text not null,
 mime_type text, visibility text not null default 'private'
 check(visibility in ('private','public','friends')),
 created_at timestamptz not null default now()
);
create table if not exists public.reviewers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 material_id uuid references public.materials(id) on delete set null,
 title text not null, body text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.flashcard_decks (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, subject text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.flashcards (
 id uuid primary key default gen_random_uuid(),
 deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
 front text not null, back text not null, created_at timestamptz not null default now()
);
create table if not exists public.quizzes (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 reviewer_id uuid references public.reviewers(id) on delete set null,
 title text not null, questions jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now()
);
create table if not exists public.quiz_attempts (
 id uuid primary key default gen_random_uuid(),
 quiz_id uuid not null references public.quizzes(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 score integer not null default 0, total integer not null default 0,
 answers jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),
 check(score >= 0 and total >= 0 and score <= total)
);
create table if not exists public.posts (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(length(body) between 1 and 2000),
 tags text[] not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.comments (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.posts(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(length(body) between 1 and 1000),
 created_at timestamptz not null default now()
);
create table if not exists public.post_reactions (
 post_id uuid not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 reaction text not null check(reaction in ('like','love','celebrate','insightful')),
 primary key(post_id,user_id)
);
create table if not exists public.friend_requests (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references public.profiles(id) on delete cascade,
 receiver_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 created_at timestamptz not null default now(),
 unique(sender_id,receiver_id),check(sender_id <> receiver_id)
);
create table if not exists public.study_rooms (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, topic text not null default '',
 is_public boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.room_members (
 room_id uuid not null references public.study_rooms(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 joined_at timestamptz not null default now(),primary key(room_id,user_id)
);
create table if not exists public.room_messages (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.study_rooms(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(length(body) between 1 and 1000),
 created_at timestamptz not null default now()
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null, payload jsonb not null default '{}'::jsonb,
 read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.study_progress (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 xp integer not null default 0 check(xp >= 0),
 streak integer not null default 0 check(streak >= 0),
 updated_at timestamptz not null default now()
);
create table if not exists public.admin_roles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 role text not null check(role in ('admin','moderator'))
);
create table if not exists public.reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references public.profiles(id) on delete cascade,
 post_id uuid references public.posts(id) on delete set null,
 reason text not null, status text not null default 'pending'
 check(status in ('pending','dismissed','removed')),
 created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
 id bigint generated always as identity primary key,
 actor_id uuid references public.profiles(id) on delete set null,
 action text not null, detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create or replace function public.knoxia_is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.admin_roles where user_id = (select auth.uid()) and role='admin') $$;
revoke all on function public.knoxia_is_admin() from public;
grant execute on function public.knoxia_is_admin() to authenticated;

do $$ declare t text; begin
 foreach t in array array['profiles','materials','reviewers','flashcard_decks','flashcards','quizzes','quiz_attempts','posts','comments','post_reactions','friend_requests','study_rooms','room_members','room_messages','notifications','study_progress','admin_roles','reports','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy "profiles readable" on public.profiles for select to authenticated using(true);
create policy "profiles own insert" on public.profiles for insert to authenticated with check(id=(select auth.uid()));
create policy "profiles own update" on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy "materials readable" on public.materials for select to authenticated using(owner_id=(select auth.uid()) or visibility='public' or public.knoxia_is_admin());
create policy "materials own insert" on public.materials for insert to authenticated with check(owner_id=(select auth.uid()));
create policy "materials own update" on public.materials for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "materials own delete" on public.materials for delete to authenticated using(owner_id=(select auth.uid()));
create policy "reviewers owner" on public.reviewers for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "decks owner" on public.flashcard_decks for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "cards via deck" on public.flashcards for all to authenticated
 using(exists(select 1 from public.flashcard_decks d where d.id=deck_id and d.owner_id=(select auth.uid())))
 with check(exists(select 1 from public.flashcard_decks d where d.id=deck_id and d.owner_id=(select auth.uid())));
create policy "quizzes owner" on public.quizzes for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "attempts owner" on public.quiz_attempts for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.quizzes q where q.id=quiz_id and q.owner_id=(select auth.uid())));
create policy "posts readable" on public.posts for select to authenticated using(true);
create policy "posts insert" on public.posts for insert to authenticated with check(author_id=(select auth.uid()));
create policy "posts update" on public.posts for update to authenticated using(author_id=(select auth.uid())) with check(author_id=(select auth.uid()));
create policy "posts delete" on public.posts for delete to authenticated using(author_id=(select auth.uid()) or public.knoxia_is_admin());
create policy "comments readable" on public.comments for select to authenticated using(true);
create policy "comments insert" on public.comments for insert to authenticated with check(author_id=(select auth.uid()));
create policy "comments update" on public.comments for update to authenticated using(author_id=(select auth.uid())) with check(author_id=(select auth.uid()));
create policy "comments delete" on public.comments for delete to authenticated using(author_id=(select auth.uid()) or public.knoxia_is_admin());
create policy "reactions readable" on public.post_reactions for select to authenticated using(true);
create policy "reactions own insert" on public.post_reactions for insert to authenticated with check(user_id=(select auth.uid()));
create policy "reactions own update" on public.post_reactions for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "reactions own delete" on public.post_reactions for delete to authenticated using(user_id=(select auth.uid()));
create policy "friends readable" on public.friend_requests for select to authenticated using(sender_id=(select auth.uid()) or receiver_id=(select auth.uid()));
create policy "friends send" on public.friend_requests for insert to authenticated with check(sender_id=(select auth.uid()) and status='pending');
create policy "friends receiver update" on public.friend_requests for update to authenticated using(receiver_id=(select auth.uid())) with check(receiver_id=(select auth.uid()) and status in ('accepted','declined'));
create policy "friends sender delete" on public.friend_requests for delete to authenticated using(sender_id=(select auth.uid()) or receiver_id=(select auth.uid()));
create policy "rooms readable" on public.study_rooms for select to authenticated using(is_public or owner_id=(select auth.uid()) or exists(select 1 from public.room_members m where m.room_id=id and m.user_id=(select auth.uid())));
create policy "rooms create" on public.study_rooms for insert to authenticated with check(owner_id=(select auth.uid()));
create policy "rooms owner update" on public.study_rooms for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "rooms owner delete" on public.study_rooms for delete to authenticated using(owner_id=(select auth.uid()));
create policy "room members read" on public.room_members for select to authenticated using(exists(select 1 from public.study_rooms r where r.id=room_id and (r.is_public or r.owner_id=(select auth.uid()))) or user_id=(select auth.uid()));
create policy "room members join" on public.room_members for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.study_rooms r where r.id=room_id and (r.is_public or r.owner_id=(select auth.uid()))));
create policy "room members leave" on public.room_members for delete to authenticated using(user_id=(select auth.uid()));
create policy "room messages read" on public.room_messages for select to authenticated using(exists(select 1 from public.room_members m where m.room_id=room_messages.room_id and m.user_id=(select auth.uid())));
create policy "room messages send" on public.room_messages for insert to authenticated with check(author_id=(select auth.uid()) and exists(select 1 from public.room_members m where m.room_id=room_messages.room_id and m.user_id=(select auth.uid())));
create policy "notifications own" on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy "notifications read own" on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "progress own read" on public.study_progress for select to authenticated using(user_id=(select auth.uid()));
-- XP must be awarded by a trusted server function, never directly by clients.
create policy "admin roles self read" on public.admin_roles for select to authenticated using(user_id=(select auth.uid()) or public.knoxia_is_admin());
create policy "reports submit" on public.reports for insert to authenticated with check(reporter_id=(select auth.uid()) and status='pending');
create policy "reports view" on public.reports for select to authenticated using(reporter_id=(select auth.uid()) or public.knoxia_is_admin());
create policy "reports admin update" on public.reports for update to authenticated using(public.knoxia_is_admin()) with check(public.knoxia_is_admin());
create policy "audit admin read" on public.audit_logs for select to authenticated using(public.knoxia_is_admin());
insert into storage.buckets(id,name,public,file_size_limit) values
 ('knoxia-materials','knoxia-materials',false,26214400),
 ('knoxia-avatars','knoxia-avatars',false,2097152)
on conflict(id) do nothing;
create policy "material owner upload" on storage.objects for insert to authenticated
 with check(bucket_id='knoxia-materials' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "material owner read" on storage.objects for select to authenticated
 using(bucket_id='knoxia-materials' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "material owner delete" on storage.objects for delete to authenticated
 using(bucket_id='knoxia-materials' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "avatar owner upload" on storage.objects for insert to authenticated
 with check(bucket_id='knoxia-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "avatar owner read" on storage.objects for select to authenticated
 using(bucket_id='knoxia-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "avatar owner update" on storage.objects for update to authenticated
 using(bucket_id='knoxia-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
 with check(bucket_id='knoxia-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
