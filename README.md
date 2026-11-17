# KNOXIA Frontend

A responsive React + Vite frontend starter for KNOXIA.

## Run locally

1. Install Node.js (LTS).
2. Open this folder in VS Code.
3. In the terminal, run:

```bash
npm install
npm run dev
```

4. Open the local URL shown by Vite (usually http://localhost:5173).

## Included

- Public landing page
- Register, login, forgot password, onboarding screens
- Student dashboard and learning materials
- Reviewer management (My Reviewers): save, rename, bookmark, organize into folders, search, sort and delete reviewers, one at a time or in bulk
- Upload UI, AI reviewer builder, study companion UI
- Flashcards: create, edit and delete decks and cards, flip, shuffle and study them; each card remembers whether you knew it, and decks show their mastery
- Quizzes (demo): generate a quiz from a saved reviewer, write your own questions, or take a sample quiz; edit, retake and delete saved quizzes; results keep the questions they were graded on
- Quiz taking: choose, change or clear an answer, flag questions to revisit, jump between questions from a numbered navigator, follow progress and a running clock, and use the keyboard (A-D or 1-4 to choose, arrow keys to move, F to flag). "Review & submit" lists every question first; questions left unanswered count as incorrect and ask for confirmation. Leaving a quiz with answers asks first. Answers are only saved on submit (`src/quizRunner.jsx`)
- Quiz results and history: score, correct / incorrect / not answered breakdown, time taken, every answer with its explanation (filterable), a comparison with your previous attempt at the same quiz, retake the whole quiz or only the questions you missed, and a history page of all attempts with filter, sort, score trend and delete (`src/quizResults.jsx`, `src/attempts.js`)
- Study progress: one page (`/progress`) shows reviewers completed / in progress / not started (mark them completed there or in the reviewer editor), flashcard mastery per deck with when it was last studied, quiz attempts with best, latest and average score and the change since the previous attempt, the last 7 days of activity, a study streak and a feed of recent sessions. Flashcard sessions are logged when you finish, restart or leave a deck; quiz and flashcard data is read from where those features save it, not copied. The dashboard and Learning Analytics show these real numbers once you have activity (sample values before that). "Reset study log" clears reviewer completion and session history only. Rules are in `src/progressCalc.js` (tested with `npm test`), storage and hooks in `src/progressStore.js`, the page in `src/progress.jsx`
- Study progress (`/progress`): completed, in-progress and not-started reviewers (open one to start it, then mark it completed in the editor or on the page), flashcard mastery per deck and when it was last studied, score history per quiz with best, latest and average and the change since the previous attempt, a study streak, a last-7-days activity chart and a feed of recent sessions. Flashcard sessions are logged when you finish a deck, restart, or leave mid-session. Missed-question retakes stay in quiz history but are not counted in averages. Analytics and the dashboard use these real numbers once you have any activity, and show labelled sample values before that. Flashcard mastery and quiz attempts are read from where those features save them, never copied (`src/progressCalc.js`, `src/progressStore.js`, `src/progress.jsx`)
- Friends (`/friends`): search people by name or username, send, accept, decline and cancel friend requests, remove friends, and browse your friend list. Tabs for All friends, Requests, Sent and Find people; the sidebar shows how many requests are waiting. The same Add friend / Request sent / Accept / Friends button appears on profiles, and the feed's "People to connect with" card uses it too. Sending or accepting a request notifies the other person. If two people ask each other, they simply become friends. Registered accounts in this browser can find each other (to try it with two people, sign in as the second account in another tab); the three sample classmates are tagged **Sample** and accept right away. Rules are in `src/friendsCalc.js` (tested with `npm test`), storage, hooks and notifications in `src/friendsStore.js`, the screens in `src/friends.jsx`
- Learning Feed (`/feed`): write a post (up to 500 characters, up to 3 tags), read everyone's posts newest first, and delete your own posts. Names link to profiles, and the feed starts with three sample posts from the sample classmates. Rules are in `src/feedCalc.js` (tested with `npm test`), storage and hooks in `src/feedStore.js`, the screens in `src/feed.jsx`
- Reactions and comments (on the feed): react with Like, Insightful, Celebrate or Motivated (one reaction per person per post: press it again to take it back, press another to change it, and see who reacted). Comment on a post and reply to a comment (replies go one level deep). Edit your own comments (marked "edited"); delete your own comments, or any comment on your own post (deleting a comment also deletes its replies, after asking). Comments on your post and replies to your comments notify you; reactions do not. Posts saved with the old like button are read as Like reactions
- Public profiles (`/profile/:username`): a classmate's study streak, study time, achievements, recent learning activity (last 7 days and latest sessions), the materials they chose to share, and their posts from the feed. You choose who can see the activity, achievements and shared materials under **Privacy and sharing** on your own profile: Everyone, Friends only (the default) or Only me; materials are shared one by one and nothing is shared until you pick it. Posts are always public, because the feed is. The Achievements page now shows badges earned from your real activity (7-Day and 30-Day Streak, Quiz Master, Early Bird, Deck Builder, Bookworm); Team Player and Challenger stay locked until study rooms and challenges are real. Sample classmates have no study data, so their profile shows only their posts. Rules are in `src/profileCalc.js` (tested with `npm test`), data and hooks in `src/profileStore.js`, the screens in `src/profileSocial.jsx`
- Study rooms, challenges
- Leaderboards, achievements, analytics, study planner
- Settings and notifications
- Admin dashboard, user management, moderation, activity logs
- Responsive sidebar and mobile navigation

## Tests

```bash
npm test
```

Runs the study-progress calculations (`test/progressCalc.test.mjs`), the friends rules (`test/friendsCalc.test.mjs`) the feed rules (`test/feedCalc.test.mjs`) and the profile rules (`test/profileCalc.test.mjs`) with Node's built-in test runner. No extra packages are needed.

## Demo authentication

Login is a **frontend demo**: any well-formed email and any password signs you in. It controls what the UI shows, but it is not security.

- **Protected routes:** every app screen (including `/admin/*`, `/onboarding` and `/welcome`) needs a session. Signed-out visitors are sent to `/login` and returned to the page they asked for after signing in.
- **Public routes:** `/`, `/terms`, `/privacy`, `/forgot-password`, `/reset-password`. Signed-in users who open `/login`, `/register` or `/forgot-password` are sent on to the app.
- **Remember me:** checked keeps the session in `localStorage` for 30 days; unchecked keeps it in `sessionStorage`, so it ends with the tab/browser session. If the browser blocks storage, the session lives in memory until the page is closed.
- **Logout:** clears the session everywhere, including other open tabs.
- **Sign-up:** verifying the email code (demo: any 6 digits) starts a tab-only session.
- **Code:** all of this lives in `src/session.js` (session store, `useAuth()`, and the list of public / guest-only routes), with the guard in `App.jsx`.

## Important implementation notes

This is a frontend prototype using sample/demo data. It does not yet include:
- Secure authentication (the demo login above is not secure) or password reset emails
- Database persistence
- Real file upload/storage or document parsing/OCR
- Real AI integration for the study companion
- A real AI model for quizzes: the quiz generator is a **demo**. It reads a saved reviewer and builds multiple-choice and true/false questions from its definitions, key points and review questions with simple text rules (`src/quizzes.js`, `generateFromReviewer`), so questions can be awkward and should be reviewed in the quiz editor. Swap it for your AI service later
- A real AI model for reviewers: the AI reviewer is a **demo**. It reads your material in the browser and builds the reviewer with simple text rules (`src/reviewerGen.js`); the progress steps are simulated and nothing is sent anywhere. Swap `generateReviewer` for your AI service later
- Friends across devices: friend requests are kept in this browser (`src/friendsStore.js`), so only accounts registered in the same browser can find each other, and nothing stops someone editing them. A backend must enforce who may send, accept and remove
- Feed across devices: posts, reactions and comments are kept in this browser (`src/feedStore.js`), so only accounts in the same browser share a feed, and nothing stops someone editing them. A backend must enforce who may post and delete
- Profile privacy across devices: who can see a profile is only enforced by the screens (`src/profileStore.js`). Every account's data sits in this browser's localStorage, so anyone using the browser could read it. A backend must check visibility on the server and send only what the viewer may see
- Real-time chat, study rooms, notifications, or challenge synchronization
- Backend authorization for admin routes

Connect these features to your chosen backend and AI services before production use.
#   k n o x i a 
 
 