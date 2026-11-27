import type { PlayerStats } from '../shared/api';

export const getYesterdayDateKey = (dateKey: string): string => {
  const parts = dateKey.split('-').map((n) => Number(n));
  const y = parts[0] ?? 2026;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const prev = new Date(Date.UTC(y, m, d) - 86400000);
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(prev.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
};

export const computeUpdatedStats = (
  prev: PlayerStats,
  solvedDateKey: string,
  todayDateKey: string,
  stars: 1 | 2 | 3,
  alreadySolvedThisDate: boolean
): PlayerStats => {
  if (alreadySolvedThisDate) {
    const upgradedPerfect =
      stars === 3 ? Math.max(prev.perfectRuns, 1) : prev.perfectRuns;
    return {
      ...prev,
      perfectRuns: upgradedPerfect,
    };
  }

  const totalSolved = prev.totalSolved + 1;
  const perfectRuns = prev.perfectRuns + (stars === 3 ? 1 : 0);

  if (solvedDateKey !== todayDateKey) {
    return {
      ...prev,
      totalSolved,
      perfectRuns,
    };
  }

  const yesterday = getYesterdayDateKey(todayDateKey);
  let currentStreak = 1;
  if (prev.lastSolvedDate === todayDateKey) {
    currentStreak = Math.max(1, prev.currentStreak);
  } else if (prev.lastSolvedDate === yesterday) {
    currentStreak = prev.currentStreak + 1;
  }

  const bestStreak = Math.max(prev.bestStreak, currentStreak);
  return {
    currentStreak,
    bestStreak,
    totalSolved,
    perfectRuns,
    lastSolvedDate: todayDateKey,
  };
};

export const encodeAscendingRankScore = (
  points: number,
  moves: number,
  seconds: number
): number => {
  const clampedMoves = Math.min(999, Math.max(1, Math.floor(moves)));
  const clampedSecs = Math.min(999, Math.max(1, Math.floor(seconds)));
  const composite =
    points * 1000000 + (999 - clampedMoves) * 1000 + (999 - clampedSecs);
  return -composite;
};
