-- Live social study features. Run once in Supabase SQL Editor.
create table if not exists public.study_rooms_live(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 3 and 80),topic text not null default '',
 created_at timestamptz not null default now());
create table if not exists public.study_room_members_live(
 room_id uuid not null references public.study_rooms_live(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),primary key(room_id,user_id));
create table if not exists public.study_room_messages_live(
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.study_rooms_live(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 1000),created_at timestamptz not null default now());
create table if not exists public.study_challenges_live(
 id uuid primary key default gen_random_uuid(),creator_id uuid not null references auth.users(id) on delete cascade,
 opponent_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 3 and 100),
 question_set jsonb not null, creator_score integer,opponent_score integer,
 created_at timestamptz not null default now(),
 constraint different_challenge_users check(creator_id<>opponent_id));
grant select,insert,delete on public.study_rooms_live,public.study_room_members_live,public.study_room_messages_live to authenticated;
grant select,insert,update on public.study_challenges_live to authenticated;
alter table public.study_rooms_live enable row level security;
alter table public.study_room_members_live enable row level security;
alter table public.study_room_messages_live enable row level security;
alter table public.study_challenges_live enable row level security;
create policy "Rooms visible" on public.study_rooms_live for select to authenticated using(true);
create policy "Create owned room" on public.study_rooms_live for insert to authenticated with check(owner_id=auth.uid());
create policy "Owner delete room" on public.study_rooms_live for delete to authenticated using(owner_id=auth.uid());
-- Membership visibility is public to signed-in students; room messages are members-only.
create policy "Room members visible" on public.study_room_members_live for select to authenticated using(true);
create policy "Join existing room" on public.study_room_members_live for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.study_rooms_live r where r.id=room_id));
create policy "Leave room" on public.study_room_members_live for delete to authenticated using(user_id=auth.uid());
create policy "Members read messages" on public.study_room_messages_live for select to authenticated using(exists(select 1 from public.study_room_members_live m where m.room_id=study_room_messages_live.room_id and m.user_id=auth.uid()));
create policy "Members send messages" on public.study_room_messages_live for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.study_room_members_live m where m.room_id=study_room_messages_live.room_id and m.user_id=auth.uid()));
create policy "Author delete message" on public.study_room_messages_live for delete to authenticated using(author_id=auth.uid());
create policy "Challenge participants read" on public.study_challenges_live for select to authenticated using(creator_id=auth.uid() or opponent_id=auth.uid());
create policy "Challenge creator insert" on public.study_challenges_live for insert to authenticated with check(creator_id=auth.uid() and creator_score is null and opponent_score is null);
create policy "Challenge participants score" on public.study_challenges_live for update to authenticated using(creator_id=auth.uid() or opponent_id=auth.uid()) with check(creator_id=auth.uid() or opponent_id=auth.uid());
-- Prevent changing challenge identity/questions or other person's score.
create or replace function public.guard_study_challenge() returns trigger language plpgsql as $$
begin
 if new.creator_id is distinct from old.creator_id or new.opponent_id is distinct from old.opponent_id or new.question_set is distinct from old.question_set or new.title is distinct from old.title then raise exception 'Challenge details are immutable'; end if;
 if auth.uid()=old.creator_id then
  if new.opponent_score is distinct from old.opponent_score then raise exception 'Cannot change opponent score'; end if;
  if old.creator_score is not null and new.creator_score is distinct from old.creator_score then raise exception 'Score already submitted'; end if;
 elsif auth.uid()=old.opponent_id then
  if new.creator_score is distinct from old.creator_score then raise exception 'Cannot change creator score'; end if;
  if old.opponent_score is not null and new.opponent_score is distinct from old.opponent_score then raise exception 'Score already submitted'; end if;
 else raise exception 'Not a participant'; end if;
 return new;
end $$;
drop trigger if exists guard_study_challenge_update on public.study_challenges_live;
create trigger guard_study_challenge_update before update on public.study_challenges_live for each row execute function public.guard_study_challenge();
-- Room owner automatically joins.
create or replace function public.auto_join_study_room() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.study_room_members_live(room_id,user_id) values(new.id,new.owner_id);return new;end $$;
drop trigger if exists auto_join_study_room_trigger on public.study_rooms_live;
create trigger auto_join_study_room_trigger after insert on public.study_rooms_live for each row execute function public.auto_join_study_room();
-- Notify challenge recipient using existing notification schema.
create or replace function public.notify_study_challenge() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.notifications(user_id,actor_id,event_key,title,description,target_path)
 values(new.opponent_id,new.creator_id,'challenge:'||new.id,'New study challenge',new.title,'/challenges')
 on conflict(event_key) do nothing;
 return new;
end $$;
drop trigger if exists notify_study_challenge_trigger on public.study_challenges_live;
create trigger notify_study_challenge_trigger after insert on public.study_challenges_live for each row execute function public.notify_study_challenge();
