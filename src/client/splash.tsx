import './index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { InitResponse } from '../shared/api';
import { generateDailyPuzzle, getUtcDateKey } from '../shared/puzzle';

type SplashState = {
  puzzleNumber: number;
  dateKey: string;
  parMoves: number;
  beaconCount: number;
  solvedTodayCount: number;
  streak: number;
  userSolvedStars: 1 | 2 | 3 | null;
  topSolver: string | null;
};

const createFallbackSplash = (): SplashState => {
  const today = getUtcDateKey();
  const p = generateDailyPuzzle(today);
  const beaconCount = p.cells.filter((c) => c.kind === 'beacon').length;
  return {
    puzzleNumber: p.puzzleNumber,
    dateKey: today,
    parMoves: p.parMoves,
    beaconCount,
    solvedTodayCount: 0,
    streak: 0,
    userSolvedStars: null,
    topSolver: null,
  };
};

const isInitResponse = (val: unknown): val is InitResponse => {
  return (
    typeof val === 'object' &&
    val !== null &&
    'type' in val &&
    val.type === 'init'
  );
};

const getSafeUsername = (): string | null => {
  try {
    return typeof context?.username === 'string' && context.username.length > 0
      ? context.username
      : null;
  } catch {
    return null;
  }
};

const openExpandedGame = (event: MouseEvent): void => {
  try {
    requestExpandedMode(event, 'game');
  } catch {
    // Standalone browser preview outside Devvit host
  }
};

export const Splash = () => {
  const [info, setInfo] = useState<SplashState>(createFallbackSplash);
  const safeUsername = getSafeUsername();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) return;
        const raw: unknown = await res.json();
        if (!isInitResponse(raw)) return;
        const beaconCount = raw.puzzle.cells.filter(
          (c) => c.kind === 'beacon'
        ).length;
        setInfo({
          puzzleNumber: raw.puzzle.puzzleNumber,
          dateKey: raw.todayDateKey,
          parMoves: raw.puzzle.parMoves,
          beaconCount,
          solvedTodayCount: raw.communitySolvedToday,
          streak: raw.stats.currentStreak,
          userSolvedStars: raw.todayCompletion?.stars ?? null,
          topSolver: raw.leaderboard[0]?.username ?? null,
        });
      } catch {
        // Standalone preview fallback remains active
      }
    };
    void load();
  }, []);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-4 py-5">
      <div className="al-active-frame rounded-3xl w-full max-w-[440px] p-5 sm:p-6 flex flex-col items-center text-center gap-4">
        {/* Top Live Edition Pill */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
            ⚡ DAILY EDITION #{info.puzzleNumber}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            🎯 Par {info.parMoves} Moves
          </span>
          {info.streak > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              🔥 {info.streak}d Streak
            </span>
          )}
        </div>

        {/* Mini Animated Optical Crest */}
        <div className="relative w-24 h-24 rounded-2xl bg-slate-900 flex items-center justify-center shadow-md border border-slate-800">
          <svg
            viewBox="0 0 100 100"
            className="w-20 h-20"
            aria-hidden="true"
          >
            <line
              x1="8"
              y1="50"
              x2="50"
              y2="50"
              stroke="#0EA5E9"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <line
              x1="50"
              y1="50"
              x2="86"
              y2="20"
              stroke="#0EA5E9"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <line
              x1="50"
              y1="50"
              x2="86"
              y2="80"
              stroke="#F59E0B"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <polygon
              points="50,24 74,72 26,72"
              fill="rgba(16, 185, 129, 0.22)"
              stroke="#38BDF8"
              strokeWidth="3"
            />
            <circle cx="86" cy="20" r="6" fill="#0EA5E9" />
            <circle cx="86" cy="80" r="6" fill="#FBBF24" />
          </svg>
        </div>

        {/* Title & Hook */}
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Prism Pulse
          </h1>
          <p className="text-sm text-slate-600 max-w-[330px] mx-auto leading-relaxed">
            Rotate mirrors, splitters &amp; chromatic prisms to ignite all{' '}
            <strong className="text-slate-900">
              {info.beaconCount} target beacons
            </strong>{' '}
            in{' '}
            <strong className="text-sky-700">{info.parMoves} moves</strong> or
            fewer.
          </p>
        </div>

        {/* Live Subreddit Telemetry Bar */}
        <div className="w-full grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2.5 text-xs">
          <div className="flex flex-col items-center">
            <span className="text-slate-500 font-medium">Date (UTC)</span>
            <span className="font-bold text-slate-900">{info.dateKey}</span>
          </div>
          <div className="flex flex-col items-center border-x border-slate-200">
            <span className="text-slate-500 font-medium">Solved Today</span>
            <span className="font-bold text-emerald-700">
              {info.solvedTodayCount} Redditors
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-slate-500 font-medium">#1 Leader</span>
            <span className="font-bold text-amber-700 truncate max-w-[95px]">
              {info.topSolver ? `u/${info.topSolver}` : 'Claim #1!'}
            </span>
          </div>
        </div>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={(e) => openExpandedGame(e.nativeEvent)}
          className="al-btn w-full py-3.5 px-6 rounded-2xl font-extrabold text-base text-white cursor-pointer shadow-md flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 55%, #10B981 100%)',
          }}
        >
          {info.userSolvedStars ? (
            <>
              <span>
                ✅ Solved ({'⭐'.repeat(info.userSolvedStars)}) — View Board &amp;
                Ranks
              </span>
            </>
          ) : (
            <>
              <span>
                Play Daily #{info.puzzleNumber}
                {safeUsername ? ` as u/${safeUsername}` : ''} →
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <Splash />
    </StrictMode>
  );
}
