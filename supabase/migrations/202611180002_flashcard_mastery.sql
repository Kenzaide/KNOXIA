-- Run once in the Supabase SQL Editor before updating the frontend.
alter table public.flashcards
  add column if not exists known boolean not null default false;

-- Existing deck-owner RLS policy protects this column.
comment on column public.flashcards.known is
  'Most recent recall result: true = I knew it; false = still learning.';
