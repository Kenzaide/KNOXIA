# KNOXIA — Supabase foundation (work in progress)

This branch starts backend integration; **it is not a production release**.

## Apply safely

1. Back up your Supabase project and use a development Supabase project first.
2. Open Supabase Dashboard → SQL Editor and review `supabase/migrations/202611170001_knoxia_foundation.sql`.
3. Execute it on the development project. Confirm all tables, policies and buckets were created. Do not run repeatedly without reviewing policy conflicts.
4. Ensure local `.env` contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never commit a secret/service-role key.
5. Test with **two real Supabase users**. Verify cross-account isolation, profile updates, storage upload/read/delete and room membership access.
6. Run `npm install`, `npm test`, `npm run build`.

## Known limitations / required follow-up

- Current React hooks still use localStorage/IndexedDB for most data. This migration alone does **not** migrate old browser data or make screens multi-user.
- Existing demo fixtures and legacy browser-only account code must be retired from the active app.
- The admin UI currently uses an email-based demo check; do not rely on it for authorization. Assign `admin_roles` through a trusted operator, never via client-side code.
- Row-level policies are a starting point requiring live Supabase testing and security review, especially room membership, content moderation and public materials.
- Quiz answer keys inside `quizzes.questions` must not be exposed to test-takers in a future shared-quiz feature.
- XP and audit-log writes intentionally lack client insert policies; implement them in trusted server-side functions.
- AI reviewer and Knowl need a server-side AI integration with secret keys and limits.
- File visibility rules and signed-download URLs need an explicit access design before public/friends sharing.
- Add migrations for missing domain objects as features are connected (planner tasks, challenge completions, badges, invitations).
- Add integration tests, error boundaries, accessibility checks, and deployment configuration.

## Suggested integration order

1. Profiles and materials (Supabase Storage).
2. Flashcards, reviewers, quizzes and attempts.
3. Posts, comments and reactions.
4. Friend requests, study rooms and realtime messages.
5. Planner, notifications, XP, moderation and analytics.
6. AI generation, testing and production deployment.
