/**
 * Achievements and badges (Patch 24): the list of milestones, and how close someone is to each.
 *
 * Pure functions only: no storage, no React (tested by test/achievementsCalc.test.mjs). The numbers come from
 * `profileStats` (profileCalc.js). Hooks and unlock dates are in `src/gamificationStore.js`, the screens in `src/gamification.jsx`.
 *
 * An achievement is { id, name, desc, icon, group, target, value(stats) }: it is earned when value reaches target.
 * Quiz Challenges are still a demo, so "Challenger" stays locked (`soon`).
 */
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const GROUPS = ['Study habits', 'Quizzes', 'Library', 'Community', 'Levels'];

export const ACHIEVEMENTS = [
  { id: 'streak-7', name: '7-Day Streak', desc: 'Study 7 days in a row', icon: 'Flame', group: 'Study habits', target: 7, value: (s) => n(s.streakBest) },
  { id: 'streak-30', name: '30-Day Streak', desc: 'Study 30 days in a row', icon: 'Medal', group: 'Study habits', target: 30, value: (s) => n(s.streakBest) },
  { id: 'early-bird', name: 'Early Bird', desc: 'Study before 7 AM', icon: 'Zap', group: 'Study habits', target: 1, value: (s) => (s.earlyBird ? 1 : 0) },
  { id: 'finisher', name: 'Finisher', desc: 'Complete 3 reviewers', icon: 'CheckCircle2', group: 'Study habits', target: 3, value: (s) => n(s.reviewersDone) },
  { id: 'first-quiz', name: 'First Quiz', desc: 'Take your first quiz', icon: 'Star', group: 'Quizzes', target: 1, value: (s) => n(s.quizzesTaken) },
  { id: 'quiz-regular', name: 'Quiz Regular', desc: 'Take 10 quizzes', icon: 'Target', group: 'Quizzes', target: 10, value: (s) => n(s.quizzesTaken) },
  { id: 'quiz-master', name: 'Quiz Master', desc: 'Score 90% or higher on a quiz', icon: 'Target', group: 'Quizzes', target: 90, value: (s) => n(s.quizBest) },
  { id: 'deck-builder', name: 'Deck Builder', desc: 'Create 5 flashcard decks', icon: 'Layers', group: 'Library', target: 5, value: (s) => n(s.decks) },
  { id: 'bookworm', name: 'Bookworm', desc: 'Upload 10 materials', icon: 'BookOpen', group: 'Library', target: 10, value: (s) => n(s.materials) },
  { id: 'team-player', name: 'Team Player', desc: 'Join 3 study rooms', icon: 'Users', group: 'Community', target: 3, value: (s) => n(s.rooms) },
  { id: 'group-learner', name: 'Group Learner', desc: 'Take part in 3 group activities', icon: 'GraduationCap', group: 'Community', target: 3, value: (s) => n(s.groupActivities) },
  { id: 'contributor', name: 'Contributor', desc: 'Write 3 posts on the feed', icon: 'MessageSquare', group: 'Community', target: 3, value: (s) => n(s.posts) },
  { id: 'challenger', name: 'Challenger', desc: 'Win 5 quiz challenges', icon: 'Trophy', group: 'Community', target: 5, value: () => 0, soon: true },
  { id: 'level-5', name: 'Rising Star', desc: 'Reach level 5', icon: 'Star', group: 'Levels', target: 5, value: (s) => n(s.level) },
  { id: 'level-10', name: 'Scholar', desc: 'Reach level 10', icon: 'GraduationCap', group: 'Levels', target: 10, value: (s) => n(s.level) },
];

/**
 * Every achievement with progress: { ...achievement, current, pct, earned, at }.
 * `unlocked` maps an achievement id to the ISO date it was unlocked (or null when the date is unknown).
 */
export function achievementStatus(stats, unlocked = {}) {
  const s = stats || {}; const saved = unlocked && typeof unlocked === 'object' ? unlocked : {};
  return ACHIEVEMENTS.map(({ value, ...a }) => {
    const current = Math.min(a.target, Math.max(0, Math.floor(value(s))));
    const earned = current >= a.target;
    return { ...a, current, pct: Math.round((current / a.target) * 100), earned, at: earned && typeof saved[a.id] === 'string' ? saved[a.id] : null };
  });
}
/** The data.js badge shape ([name, description, icon, earned]) that public profiles use. */
export const badgeTuples = (stats) => achievementStatus(stats).map((a) => [a.name, a.desc, a.icon, a.earned]);
/** Achievements by group, in the order of GROUPS. */
export const byGroup = (list) => GROUPS.map((g) => ({ group: g, items: list.filter((a) => a.group === g) })).filter((g) => g.items.length);
/** Ids earned now that are not in the saved record yet. */
export const newlyEarned = (list, unlocked) => list.filter((a) => a.earned && !(unlocked && a.id in unlocked)).map((a) => a.id);
