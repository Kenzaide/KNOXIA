# KNOXIA AI Study Companion — setup

The existing `/study-companion` page was a mock chat with a canned response and placeholder materials. This feature replaces the route with a real Gemini-powered study chat.

## Required deployment
1. In Supabase SQL Editor, run `supabase/migrations/202611180004_companion.sql` **once**. The migration creates two new private tables with RLS. It does not alter the existing quizzes, materials or flashcards.
2. In Supabase Edge Functions, create **study-companion** and paste `supabase/functions/study-companion/index.ts`. Deploy it.
3. Confirm the existing secret `GEMINI_API_KEY` exists. The function defaults to `gemini-3.1-flash-lite`, matching the model previously used by the working reviewer. If `GEMINI_MODEL` is set, that value takes priority. Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` by default; do not expose the service role key to the frontend.
4. Merge the PR and update your local main branch; run `npm run dev`.
5. Visit `http://localhost:5173/study-companion`.

## Acceptance checks
- Select a real uploaded DOCX/PDF/PPTX file, ask a question, and verify that the answer reflects the selected material.
- Ask about something absent from the material; Knowl should say it is not covered rather than inventing source facts.
- Create a new chat without a file and ask a general educational question.
- Refresh: prior chats and their messages should persist in Supabase.
- Open an older chat, continue it, and check that the conversation history remains intact.
- Delete a chat and verify that it and its messages disappear.
- Sign in as another account and verify that other users' chats are not visible.
- Check that invalid/missing file and Gemini failures display real errors rather than canned responses.

## Notes
- File text is extracted in the browser using the same extractor as the existing flashcard/quiz tools, then sent to the authenticated Edge Function. Maximum selected source text is 28,000 characters.
- Each turn sends the last 16 saved messages for conversational context.
- The service-role key is used **only on the server** to write messages after validating the authenticated user and ownership of the conversation.
- Responses are plain text (including any Markdown characters) rather than fully rendered Markdown.
- Chat is not streamed, and no citations or page numbers are fabricated.
- If your live Supabase schema differs from the repository migrations, check the actual table columns and RLS policies before changing existing tables.
