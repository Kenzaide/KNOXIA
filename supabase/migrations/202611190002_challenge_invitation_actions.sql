-- Pending challenge invitation actions. Execute after 202611190001_challenge_upgrades.sql.
alter table public.study_challenges_live
 add column if not exists declined_at timestamptz;
create or replace function public.manage_pending_challenge(p_challenge_id uuid,p_action text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.study_challenges_live%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_action not in ('cancel','decline') then raise exception 'Invalid action'; end if;
 select * into c from public.study_challenges_live where id=p_challenge_id for update;
 if not found then raise exception 'Challenge not found'; end if;
 if c.creator_score is not null or c.opponent_score is not null or c.declined_at is not null then
  raise exception 'Only unanswered pending challenges can be cancelled or declined';
 end if;
 if p_action='cancel' then
  if c.creator_id<>auth.uid() then raise exception 'Only the sender can cancel'; end if;
  delete from public.study_challenges_live where id=c.id;
  return 'cancelled';
 end if;
 if c.opponent_id<>auth.uid() then raise exception 'Only the recipient can decline'; end if;
 update public.study_challenges_live set declined_at=now() where id=c.id;
 return 'declined';
end $$;
revoke all on function public.manage_pending_challenge(uuid,text) from public;
grant execute on function public.manage_pending_challenge(uuid,text) to authenticated;
-- Guard all score writes on declined challenges.
create or replace function public.submit_study_challenge(p_challenge_id uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.study_challenges_live%rowtype; n integer; i integer; score integer:=0; correct integer; chosen integer; mine text;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select * into c from public.study_challenges_live where id=p_challenge_id for update;
 if not found or auth.uid() not in (c.creator_id,c.opponent_id) then raise exception 'Challenge not found';end if;
 if c.declined_at is not null then raise exception 'This challenge was declined';end if;
 mine:=case when auth.uid()=c.creator_id then 'creator' else 'opponent' end;
 if (mine='creator' and c.creator_score is not null) or (mine='opponent' and c.opponent_score is not null) then raise exception 'Already submitted';end if;
 n:=jsonb_array_length(c.question_set);
 if jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>n then raise exception 'Invalid answers';end if;
 for i in 0..n-1 loop
  if jsonb_typeof(p_answers->i) not in ('number','null') then raise exception 'Invalid answer type';end if;
  if jsonb_typeof(p_answers->i)='number' and (p_answers->>i)!~'^[0-3]$' then raise exception 'Invalid answer option';end if;
  correct:=(c.question_set->i->2)::integer;
  if jsonb_typeof(p_answers->i)='number' then
   chosen:=(p_answers->>i)::integer;
   if chosen=correct then score:=score+1;end if;
  end if;
 end loop;
 if mine='creator' then
  update public.study_challenges_live set creator_score=score,creator_finished_at=now() where id=c.id;
 else
  update public.study_challenges_live set opponent_score=score,opponent_finished_at=now() where id=c.id;
 end if;
 return jsonb_build_object('score',score,'total',n,'xp',10+score*2);
end $$;
-- Notification to sender after a decline.
create or replace function public.notify_challenge_declined() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.declined_at is null and new.declined_at is not null then
 insert into public.notifications(user_id,actor_id,event_key,title,description,target_path)
 values(new.creator_id,new.opponent_id,'challenge-declined:'||new.id,'Challenge declined',new.title,'/challenges')
 on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists notify_challenge_declined_trigger on public.study_challenges_live;
create trigger notify_challenge_declined_trigger after update on public.study_challenges_live for each row execute function public.notify_challenge_declined();
