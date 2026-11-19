-- Challenge upgrades: settings, scoring, rewards and public rankings.
alter table public.study_challenges_live
 add column if not exists difficulty text not null default 'medium',
 add column if not exists time_limit_minutes integer not null default 0,
 add column if not exists creator_finished_at timestamptz,
 add column if not exists opponent_finished_at timestamptz;
alter table public.study_challenges_live drop constraint if exists challenge_difficulty_valid;
alter table public.study_challenges_live add constraint challenge_difficulty_valid check(difficulty in ('easy','medium','hard'));
alter table public.study_challenges_live drop constraint if exists challenge_time_valid;
alter table public.study_challenges_live add constraint challenge_time_valid check(time_limit_minutes in (0,5,10,15,20,30,45,60));
alter table public.study_challenges_live drop constraint if exists challenge_question_count_valid;
alter table public.study_challenges_live add constraint challenge_question_count_valid check(jsonb_typeof(question_set)='array' and jsonb_array_length(question_set) between 5 and 20);
-- A single authenticated RPC grades attempts. Browser cannot update scores directly.
drop policy if exists "Challenge participants score" on public.study_challenges_live;
revoke update on public.study_challenges_live from authenticated;
create or replace function public.submit_study_challenge(p_challenge_id uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.study_challenges_live%rowtype; n integer; i integer; score integer:=0; correct integer; chosen integer; mine text;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select * into c from public.study_challenges_live where id=p_challenge_id for update;
 if not found or auth.uid() not in (c.creator_id,c.opponent_id) then raise exception 'Challenge not found';end if;
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
revoke all on function public.submit_study_challenge(uuid,jsonb) from public;
grant execute on function public.submit_study_challenge(uuid,jsonb) to authenticated;
-- Existing guard trigger permits only own score and immutable challenge settings.
create or replace function public.guard_study_challenge() returns trigger language plpgsql as $$
begin
 if new.creator_id is distinct from old.creator_id or new.opponent_id is distinct from old.opponent_id or new.question_set is distinct from old.question_set or new.title is distinct from old.title or new.difficulty is distinct from old.difficulty or new.time_limit_minutes is distinct from old.time_limit_minutes then raise exception 'Challenge details are immutable';end if;
 if auth.uid()=old.creator_id then
  if new.opponent_score is distinct from old.opponent_score or new.opponent_finished_at is distinct from old.opponent_finished_at then raise exception 'Cannot change opponent result';end if;
  if old.creator_score is not null and new.creator_score is distinct from old.creator_score then raise exception 'Already submitted';end if;
 elsif auth.uid()=old.opponent_id then
  if new.creator_score is distinct from old.creator_score or new.creator_finished_at is distinct from old.creator_finished_at then raise exception 'Cannot change creator result';end if;
  if old.opponent_score is not null and new.opponent_score is distinct from old.opponent_score then raise exception 'Already submitted';end if;
 else raise exception 'Not a participant';end if;
 return new;
end $$;
-- XP is derived from recorded results, not browser-local state. +10 participation, +2 per correct, +20 win / +10 draw.
create or replace function public.knoxia_challenge_leaderboard()
returns table(user_id uuid,display_name text,played bigint,wins bigint,draws bigint,challenge_xp bigint,accuracy numeric)
language sql security definer set search_path=public,pg_temp stable as $$
 with attempts as (
 select creator_id as uid,creator_score as score,opponent_score as other,jsonb_array_length(question_set) as total from public.study_challenges_live where creator_score is not null
 union all
 select opponent_id,opponent_score,creator_score,jsonb_array_length(question_set) from public.study_challenges_live where opponent_score is not null
 ), agg as (
 select uid,count(*) played,count(*) filter(where other is not null and score>other) wins,count(*) filter(where other is not null and score=other) draws,
 sum(10+score*2+case when other is not null and score>other then 20 when other is not null and score=other then 10 else 0 end)::bigint xp,
 round(100.0*sum(score)/nullif(sum(total),0),1) acc from attempts group by uid
 )
 select a.uid,coalesce(p.display_name,p.username,'Student')::text,a.played,a.wins,a.draws,a.xp,a.acc
 from agg a left join public.profiles p on p.id=a.uid order by a.xp desc,a.wins desc;
$$;
revoke all on function public.knoxia_challenge_leaderboard() from public;
grant execute on function public.knoxia_challenge_leaderboard() to authenticated;
-- Completion notifications are created once per completed battle.
create or replace function public.notify_challenge_result() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.creator_score is not null and new.opponent_score is not null and (old.creator_score is null or old.opponent_score is null) then
 insert into public.notifications(user_id,actor_id,event_key,title,description,target_path)
 values(new.creator_id,new.opponent_id,'challenge-finished-creator:'||new.id,'Challenge completed',new.title,'/challenges/'||new.id||'/play'),
 (new.opponent_id,new.creator_id,'challenge-finished-opponent:'||new.id,'Challenge completed',new.title,'/challenges/'||new.id||'/play')
 on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists notify_challenge_result_trigger on public.study_challenges_live;
create trigger notify_challenge_result_trigger after update on public.study_challenges_live for each row execute function public.notify_challenge_result();
