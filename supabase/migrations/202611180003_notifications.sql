-- Shared notifications, automatically generated for social activity.
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 event_key text not null unique,
 title text not null,
 description text not null default '',
 target_path text not null default '/notifications',
 read boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists notifications_user_newest on public.notifications(user_id,created_at desc);
alter table public.notifications enable row level security;
grant select,update on public.notifications to authenticated;
drop policy if exists "notifications owner read" on public.notifications;
create policy "notifications owner read" on public.notifications for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "notifications owner update" on public.notifications;
create policy "notifications owner update" on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create or replace function public.knoxia_notify_friend_request() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' and NEW.status='pending' then
  insert into public.notifications(user_id,actor_id,event_key,title,description,target_path)
  values(NEW.receiver_id,NEW.sender_id,'friend-request:'||NEW.id,'New friend request','Someone wants to connect with you.','/friends') on conflict(event_key) do nothing;
 elsif TG_OP='UPDATE' and NEW.status='accepted' and OLD.status is distinct from 'accepted' then
  insert into public.notifications(user_id,actor_id,event_key,title,description,target_path)
  values(NEW.sender_id,NEW.receiver_id,'friend-accepted:'||NEW.id,'Friend request accepted','Your friend request was accepted.','/friends') on conflict(event_key) do nothing;
 end if;
 return NEW;
end $$;
drop trigger if exists knoxia_friend_request_notification on public.friend_requests;
create trigger knoxia_friend_request_notification after insert or update of status on public.friend_requests for each row execute function public.knoxia_notify_friend_request();
create or replace function public.knoxia_notify_feed_comment() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid; actor_label text;
begin
 select case when NEW.parent_id is not null then (select author_id from public.feed_comments where id=NEW.parent_id)
 else (select author_id from public.feed_posts where id=NEW.post_id) end into recipient;
 if recipient is null or recipient=NEW.author_id then return NEW; end if;
 select coalesce(username,'A student') into actor_label from public.profiles where id=NEW.author_id;
 insert into public.notifications(user_id,actor_id,event_key,title,description,target_path)
 values(recipient,NEW.author_id,'feed-comment:'||NEW.id,
 case when NEW.parent_id is null then 'New comment on your post' else 'New reply to your comment' end,
 coalesce(actor_label,'A student')||': '||left(NEW.body,110),'/feed')
 on conflict(event_key) do nothing;
 return NEW;
end $$;
drop trigger if exists knoxia_feed_comment_notification on public.feed_comments;
create trigger knoxia_feed_comment_notification after insert on public.feed_comments for each row execute function public.knoxia_notify_feed_comment();
create or replace function public.knoxia_notify_feed_reaction() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid;
begin
 select author_id into recipient from public.feed_posts where id=NEW.post_id;
 if recipient is null or recipient=NEW.user_id then return NEW; end if;
 insert into public.notifications(user_id,actor_id,event_key,title,description,target_path)
 values(recipient,NEW.user_id,'feed-reaction:'||NEW.post_id||':'||NEW.user_id,'Someone reacted to your post','Your post received a reaction.','/feed')
 on conflict(event_key) do nothing;
 return NEW;
end $$;
drop trigger if exists knoxia_feed_reaction_notification on public.feed_reactions;
create trigger knoxia_feed_reaction_notification after insert on public.feed_reactions for each row execute function public.knoxia_notify_feed_reaction();
