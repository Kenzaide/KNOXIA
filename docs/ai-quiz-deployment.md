# AI Quiz Generator deployment and testing

This is a real Gemini/Supabase flow. It does not generate questions from local sample banks.

## Deployment order

1. Confirm `public.quizzes` and `public.quiz_attempts` exist and have the owner-only RLS policies from `supabase/migrations/202611170001_knoxia_foundation.sql`. Existing deployments may already have them; do not blindly rerun the full foundation migration if your schema has diverged.
2. In Supabase SQL Editor, run `supabase/migrations/202611180003_ai_quiz_indexes.sql`.
3. Deploy `supabase/functions/generate-quiz/index.ts` as an Edge Function named **generate-quiz**. The function must be called by authenticated users.
4. Confirm Supabase Edge Function secret `GEMINI_API_KEY` exists. If the default `gemini-2.5-flash` is not supported by your key, configure `GEMINI_MODEL` with the **same working model ID** used by the deployed reviewer/flashcard functions. Never put Gemini secrets in Vite client variables.
5. Merge the PR and pull the updated `main` branch into the local Vite app.

## Manual acceptance tests

- Sign in, open Quizzes in the sidebar, select a real uploaded material, and generate 10 mixed questions at medium difficulty.
- Preview the answers, save, take the quiz, submit, and confirm that the result page shows score, correct answer and explanation.
- Return to the AI quiz library; the quiz remains after refresh. Open its study page to see saved attempts.
- Answer a few questions incorrectly, then select **Retake missed** and verify only missed questions are included.
- Generate using pasted notes; try easy/hard and each question type individually.
- Check that a different user cannot access another user's quiz or attempt by URL (RLS).
- Test missing/invalid Gemini key and missing source file; user should receive an error, not sample data.

## Limitations

- Identification scoring uses normalized, case-insensitive exact matching, with whitespace and terminal punctuation ignored. Synonyms and semantically equivalent longer answers are not automatically accepted. The correct answer is displayed in the results.
- Generated quizzes are immutable after saving in this new workflow; the legacy manual quiz editor is unchanged.
- The new AI quiz experience is separate from the older local-only quiz and attempt history, which remain at their original URLs for backward compatibility.
- The server uses Gemini for generation, but answers are graded deterministically from the saved answer key. AI-generated content should be reviewed for factual correctness before assessment.
