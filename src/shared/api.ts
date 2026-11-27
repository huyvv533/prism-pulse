import type { DailyPuzzle } from './puzzle';

export type LeaderboardEntry = {
  rank: number;
  username: string;
  moves: number;
  seconds: number;
  stars: 1 | 2 | 3;
  points: number;
};

export type PlayerStats = {
  currentStreak: number;
  bestStreak: number;
  totalSolved: number;
  perfectRuns: number;
  lastSolvedDate: string | null;
};

export type DailyCompletionRecord = {
  moves: number;
  seconds: number;
  stars: 1 | 2 | 3;
  points: number;
  usedHint: boolean;
  sharedComment: boolean;
};

export type InitResponse = {
  type: 'init';
  postId: string;
  subredditName: string;
  username: string;
  todayDateKey: string;
  activeDateKey: string;
  archiveDateKeys: string[];
  puzzle: DailyPuzzle;
  stats: PlayerStats;
  todayCompletion: DailyCompletionRecord | null;
  leaderboard: LeaderboardEntry[];
  communitySolvedToday: number;
  communityAttemptsToday: number;
};

export type PuzzleFetchResponse = {
  type: 'puzzle';
  dateKey: string;
  puzzle: DailyPuzzle;
  completion: DailyCompletionRecord | null;
  leaderboard: LeaderboardEntry[];
  communitySolvedCount: number;
};

export type SubmitSolveRequest = {
  dateKey: string;
  orientations: number[];
  moves: number;
  seconds: number;
  usedHint: boolean;
};

export type SubmitSolveResponse = {
  type: 'solve';
  verified: boolean;
  stars: 1 | 2 | 3;
  points: number;
  rankLabel: string;
  percentileBeat: number;
  stats: PlayerStats;
  completion: DailyCompletionRecord;
  leaderboard: LeaderboardEntry[];
  communitySolvedCount: number;
  shareText: string;
};

export type ShareCommentRequest = {
  dateKey: string;
  orientations: number[];
  moves: number;
  seconds: number;
  usedHint: boolean;
};

export type ShareCommentResponse = {
  type: 'shared';
  ok: boolean;
  alreadyShared: boolean;
  message: string;
};
