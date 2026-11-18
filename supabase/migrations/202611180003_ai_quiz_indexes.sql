-- AI quizzes use the existing public.quizzes and public.quiz_attempts tables.
-- This migration is safe to rerun after the Knoxia foundation migration.
-- Run the foundation migration first if either table does not yet exist.

create index if not exists knoxia_ai_quizzes_owner_recent
  on public.quizzes (owner_id, created_at desc);

create index if not exists knoxia_ai_attempts_user_quiz_recent
  on public.quiz_attempts (user_id, quiz_id, created_at desc);

-- Quiz questions are stored in quizzes.questions JSONB, including type,
-- question text, answer key, options, explanation and difficulty.
-- Attempts store an immutable question snapshot and user responses in
-- quiz_attempts.answers JSONB, and score / total in dedicated columns.
-- Existing "quizzes owner" and "attempts owner" RLS policies are retained.
