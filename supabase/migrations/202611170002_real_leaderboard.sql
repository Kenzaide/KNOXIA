-- Real leaderboard: only Supabase Auth users with profiles, never browser demo accounts.
-- Quiz XP is calculated from recorded quiz attempts: 10 XP for completing an attempt,
-- plus 1 XP per correct answer. Other local-only XP is not included.
create or replace function public.knoxia_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  quiz_xp bigint,
  quizzes_completed bigint,
  quiz_average integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         coalesce(nullif(trim(p.full_name), ''), nullif(p.username, ''), 'Student')::text,
         (coalesce(sum(10 + a.score), 0))::bigint,
         count(a.id)::bigint,
         case when count(a.id) = 0 then null
              else round(avg(100.0 * a.score / nullif(a.total, 0)))::integer
         end
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.quiz_attempts a on a.user_id = p.id and a.total > 0
  where u.deleted_at is null
  group by p.id, p.full_name, p.username;
$$;
revoke all on function public.knoxia_leaderboard() from public, anon;
grant execute on function public.knoxia_leaderboard() to authenticated;
