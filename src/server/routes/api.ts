import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DailyCompletionRecord,
  InitResponse,
  LeaderboardEntry,
  PlayerStats,
  PuzzleFetchResponse,
  ShareCommentRequest,
  ShareCommentResponse,
  SubmitSolveRequest,
  SubmitSolveResponse,
} from '../../shared/api';
import {
  formatShareCard,
  generateDailyPuzzle,
  getRecentDateKeys,
  getUtcDateKey,
  scoreSolve,
  tracePuzzle,
} from '../../shared/puzzle';
import {
  computeUpdatedStats,
  encodeAscendingRankScore,
} from '../streakLogic';

type ErrorResponse = {
  status: 'error';
  message: string;
};

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const emptyStats = (): PlayerStats => ({
  currentStreak: 0,
  bestStreak: 0,
  totalSolved: 0,
  perfectRuns: 0,
  lastSolvedDate: null,
});

const parsePlayerStats = (raw: string | undefined): PlayerStats => {
  if (!raw) return emptyStats();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyStats();
    const rec = parsed;
    if (
      'currentStreak' in rec &&
      typeof rec.currentStreak === 'number' &&
      'bestStreak' in rec &&
      typeof rec.bestStreak === 'number' &&
      'totalSolved' in rec &&
      typeof rec.totalSolved === 'number' &&
      'perfectRuns' in rec &&
      typeof rec.perfectRuns === 'number'
    ) {
      const last =
        'lastSolvedDate' in rec && typeof rec.lastSolvedDate === 'string'
          ? rec.lastSolvedDate
          : null;
      return {
        currentStreak: rec.currentStreak,
        bestStreak: rec.bestStreak,
        totalSolved: rec.totalSolved,
        perfectRuns: rec.perfectRuns,
        lastSolvedDate: last,
      };
    }
    return emptyStats();
  } catch {
    return emptyStats();
  }
};

const parseCompletion = (
  raw: string | undefined
): DailyCompletionRecord | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (
      'moves' in parsed &&
      typeof parsed.moves === 'number' &&
      'seconds' in parsed &&
      typeof parsed.seconds === 'number' &&
      'stars' in parsed &&
      (parsed.stars === 1 || parsed.stars === 2 || parsed.stars === 3) &&
      'points' in parsed &&
      typeof parsed.points === 'number'
    ) {
      const usedHint =
        'usedHint' in parsed && typeof parsed.usedHint === 'boolean'
          ? parsed.usedHint
          : false;
      const sharedComment =
        'sharedComment' in parsed && typeof parsed.sharedComment === 'boolean'
          ? parsed.sharedComment
          : false;
      return {
        moves: parsed.moves,
        seconds: parsed.seconds,
        stars: parsed.stars,
        points: parsed.points,
        usedHint,
        sharedComment,
      };
    }
    return null;
  } catch {
    return null;
  }
};

const loadLeaderboard = async (dateKey: string): Promise<LeaderboardEntry[]> => {
  const lbKey = `prism:lb:${dateKey}`;
  const metaKey = `prism:lbmeta:${dateKey}`;

  const [topMembers, allMeta] = await Promise.all([
    redis.zRange(lbKey, 0, 9, { by: 'rank' }),
    redis.hGetAll(metaKey),
  ]);

  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < topMembers.length; i++) {
    const item = topMembers[i];
    if (!item) continue;
    const metaRaw = allMeta[item.member];
    const parsed = parseCompletion(metaRaw);
    entries.push({
      rank: i + 1,
      username: item.member,
      moves: parsed?.moves ?? 0,
      seconds: parsed?.seconds ?? 0,
      stars: parsed?.stars ?? 1,
      points: parsed?.points ?? Math.max(100, Math.floor(-item.score / 1000000)),
    });
  }
  return entries;
};

export const api = new Hono();

api.get('/init', async (c) => {
  const { postId, subredditName } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId missing from Devvit context' },
      400
    );
  }

  try {
    const todayDateKey = getUtcDateKey();
    const archiveDateKeys = getRecentDateKeys(todayDateKey, 7);
    const puzzle = generateDailyPuzzle(todayDateKey);

    const rawUser = await reddit.getCurrentUsername();
    const username = rawUser ?? 'anonymous';

    const [
      statsRaw,
      todayCompRaw,
      leaderboard,
      solvedCard,
      attemptsRaw,
    ] = await Promise.all([
      redis.get(`prism:user:${username}:stats`),
      redis.get(`prism:comp:${todayDateKey}:${username}`),
      loadLeaderboard(todayDateKey),
      redis.zCard(`prism:lb:${todayDateKey}`),
      redis.incrBy(`prism:attempts:${todayDateKey}`, 1),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId,
      subredditName: subredditName ?? 'GamesOnReddit',
      username,
      todayDateKey,
      activeDateKey: todayDateKey,
      archiveDateKeys,
      puzzle,
      stats: parsePlayerStats(statsRaw),
      todayCompletion: parseCompletion(todayCompRaw),
      leaderboard,
      communitySolvedToday: solvedCard,
      communityAttemptsToday: attemptsRaw,
    });
  } catch (error) {
    console.error('Prism Pulse /api/init error:', error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Failed to initialize Prism Pulse' },
      500
    );
  }
});

api.get('/puzzle', async (c) => {
  const requested = c.req.query('date') ?? getUtcDateKey();
  const dateKey = DATE_KEY_RE.test(requested) ? requested : getUtcDateKey();

  try {
    const rawUser = await reddit.getCurrentUsername();
    const username = rawUser ?? 'anonymous';
    const puzzle = generateDailyPuzzle(dateKey);

    const [compRaw, leaderboard, solvedCard] = await Promise.all([
      redis.get(`prism:comp:${dateKey}:${username}`),
      loadLeaderboard(dateKey),
      redis.zCard(`prism:lb:${dateKey}`),
    ]);

    return c.json<PuzzleFetchResponse>({
      type: 'puzzle',
      dateKey,
      puzzle,
      completion: parseCompletion(compRaw),
      leaderboard,
      communitySolvedCount: solvedCard,
    });
  } catch (error) {
    console.error('Prism Pulse /api/puzzle error:', error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Failed to load puzzle' },
      500
    );
  }
});

api.post('/solve', async (c) => {
  try {
    const body = await c.req.json<SubmitSolveRequest>();
    const todayDateKey = getUtcDateKey();
    const dateKey = DATE_KEY_RE.test(body.dateKey)
      ? body.dateKey
      : todayDateKey;

    if (!Array.isArray(body.orientations) || body.orientations.length !== 25) {
      return c.json<ErrorResponse>(
        { status: 'error', message: 'Invalid board orientations' },
        400
      );
    }

    const puzzle = generateDailyPuzzle(dateKey);
    const trace = tracePuzzle(puzzle, body.orientations);

    if (!trace.allTargetsSatisfied) {
      return c.json<ErrorResponse>(
        { status: 'error', message: 'Not all target beacons are satisfied' },
        400
      );
    }

    const verifiedMoves = Math.max(puzzle.parMoves, Math.floor(body.moves));
    const verifiedSeconds = Math.max(1, Math.floor(body.seconds));
    const usedHint = Boolean(body.usedHint);

    const { stars, points, rankLabel } = scoreSolve(
      verifiedMoves,
      puzzle.parMoves,
      verifiedSeconds,
      usedHint
    );

    const rawUser = await reddit.getCurrentUsername();
    const username = rawUser ?? 'anonymous';

    const compKey = `prism:comp:${dateKey}:${username}`;
    const statsKey = `prism:user:${username}:stats`;
    const lbKey = `prism:lb:${dateKey}`;
    const lbMetaKey = `prism:lbmeta:${dateKey}`;

    const [existingCompRaw, prevStatsRaw] = await Promise.all([
      redis.get(compKey),
      redis.get(statsKey),
    ]);

    const existingComp = parseCompletion(existingCompRaw);
    const prevStats = parsePlayerStats(prevStatsRaw);
    const updatedStats = computeUpdatedStats(
      prevStats,
      dateKey,
      todayDateKey,
      stars,
      existingComp !== null
    );

    // Keep personal best completion record for this date
    const shouldReplaceBest =
      existingComp === null || points >= existingComp.points;

    const savedCompletion: DailyCompletionRecord = shouldReplaceBest
      ? {
          moves: verifiedMoves,
          seconds: verifiedSeconds,
          stars,
          points,
          usedHint,
          sharedComment: existingComp?.sharedComment ?? false,
        }
      : existingComp;

    await Promise.all([
      redis.set(statsKey, JSON.stringify(updatedStats)),
      redis.set(compKey, JSON.stringify(savedCompletion)),
    ]);

    if (username !== 'anonymous' && shouldReplaceBest) {
      const rankScore = encodeAscendingRankScore(
        savedCompletion.points,
        savedCompletion.moves,
        savedCompletion.seconds
      );
      await Promise.all([
        redis.zAdd(lbKey, { member: username, score: rankScore }),
        redis.hSet(lbMetaKey, {
          [username]: JSON.stringify(savedCompletion),
        }),
      ]);
    }

    const [leaderboard, totalSolvers, userRank] = await Promise.all([
      loadLeaderboard(dateKey),
      redis.zCard(lbKey),
      username !== 'anonymous'
        ? redis.zRank(lbKey, username)
        : Promise.resolve(undefined),
    ]);

    let percentileBeat = 95;
    if (totalSolvers > 1 && typeof userRank === 'number') {
      percentileBeat = Math.max(
        5,
        Math.min(
          99,
          Math.round(((totalSolvers - 1 - userRank) / (totalSolvers - 1)) * 100)
        )
      );
    }

    const shareText = formatShareCard({
      puzzle,
      trace,
      moves: verifiedMoves,
      seconds: verifiedSeconds,
      stars,
      streak: updatedStats.currentStreak,
      usedHint,
      username,
    });

    return c.json<SubmitSolveResponse>({
      type: 'solve',
      verified: true,
      stars,
      points,
      rankLabel,
      percentileBeat,
      stats: updatedStats,
      completion: savedCompletion,
      leaderboard,
      communitySolvedCount: Math.max(1, totalSolvers),
      shareText,
    });
  } catch (error) {
    console.error('Prism Pulse /api/solve error:', error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Failed to record solve' },
      500
    );
  }
});

api.post('/share-comment', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId missing from context' },
      400
    );
  }

  try {
    const rawUser = await reddit.getCurrentUsername();
    if (!rawUser) {
      return c.json<ShareCommentResponse>({
        type: 'shared',
        ok: false,
        alreadyShared: false,
        message: 'Sign in to Reddit to post your score card to comments!',
      });
    }

    const body = await c.req.json<ShareCommentRequest>();
    const dateKey = DATE_KEY_RE.test(body.dateKey)
      ? body.dateKey
      : getUtcDateKey();

    const sharedLockKey = `prism:shared:${postId}:${dateKey}:${rawUser}`;
    const already = await redis.get(sharedLockKey);
    if (already === '1') {
      return c.json<ShareCommentResponse>({
        type: 'shared',
        ok: true,
        alreadyShared: true,
        message: 'Your score card is already posted in the comments!',
      });
    }

    const puzzle = generateDailyPuzzle(dateKey);
    const trace = tracePuzzle(puzzle, body.orientations);
    if (!trace.allTargetsSatisfied) {
      return c.json<ErrorResponse>(
        { status: 'error', message: 'Solve the puzzle before sharing' },
        400
      );
    }

    const verifiedMoves = Math.max(puzzle.parMoves, Math.floor(body.moves));
    const verifiedSeconds = Math.max(1, Math.floor(body.seconds));
    const usedHint = Boolean(body.usedHint);
    const { stars } = scoreSolve(
      verifiedMoves,
      puzzle.parMoves,
      verifiedSeconds,
      usedHint
    );

    const statsRaw = await redis.get(`prism:user:${rawUser}:stats`);
    const stats = parsePlayerStats(statsRaw);

    const commentText = formatShareCard({
      puzzle,
      trace,
      moves: verifiedMoves,
      seconds: verifiedSeconds,
      stars,
      streak: Math.max(1, stats.currentStreak),
      usedHint,
      username: rawUser,
    });

    await reddit.submitComment({
      id: postId,
      text: commentText,
    });

    await redis.set(sharedLockKey, '1');

    const compKey = `prism:comp:${dateKey}:${rawUser}`;
    const compRaw = await redis.get(compKey);
    const existingComp = parseCompletion(compRaw);
    if (existingComp) {
      await redis.set(
        compKey,
        JSON.stringify({ ...existingComp, sharedComment: true })
      );
    }

    return c.json<ShareCommentResponse>({
      type: 'shared',
      ok: true,
      alreadyShared: false,
      message: `Posted your spoiler-free score card to the comments as u/${rawUser}!`,
    });
  } catch (error) {
    console.error('Prism Pulse /api/share-comment error:', error);
    return c.json<ShareCommentResponse>({
      type: 'shared',
      ok: false,
      alreadyShared: false,
      message: 'Copied score card! (Comment posting unavailable right now)',
    });
  }
});
