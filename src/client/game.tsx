import './index.css';

import { showToast } from '@devvit/web/client';
import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import type {
  DailyCompletionRecord,
  InitResponse,
  LeaderboardEntry,
  PlayerStats,
  PuzzleFetchResponse,
  ShareCommentResponse,
  SubmitSolveResponse,
} from '../shared/api';
import {
  type BeamSegment,
  type DailyPuzzle,
  type Direction,
  type Emitter,
  type GridCell,
  formatDuration,
  formatShareCard,
  generateDailyPuzzle,
  getRecentDateKeys,
  getUtcDateKey,
  isRotatableKind,
  rotateOrientation,
  scoreSolve,
  splitterOpenPorts,
  tracePuzzle,
} from '../shared/puzzle';
import {
  playBeaconLockSound,
  playRotateSound,
  playVictoryFanfare,
} from './sound';

const BOARD_PX = 310;
const CELL_PX = BOARD_PX / 5; // 62

const legacyCopyText = (text: string): boolean => {
  const previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
    previousFocus?.focus({ preventScroll: true });
  }
};

const safeToast = (msg: string): void => {
  try {
    showToast(msg);
  } catch {
    // Running in standalone browser preview outside Devvit
  }
};

const isInitResponse = (v: unknown): v is InitResponse =>
  typeof v === 'object' && v !== null && 'type' in v && v.type === 'init';

const isPuzzleResponse = (v: unknown): v is PuzzleFetchResponse =>
  typeof v === 'object' && v !== null && 'type' in v && v.type === 'puzzle';

const isSolveResponse = (v: unknown): v is SubmitSolveResponse =>
  typeof v === 'object' && v !== null && 'type' in v && v.type === 'solve';

const isShareResponse = (v: unknown): v is ShareCommentResponse =>
  typeof v === 'object' && v !== null && 'type' in v && v.type === 'shared';

const pointForAnchor = (
  row: number,
  col: number,
  anchor: Direction | 'CENTER'
): { x: number; y: number } => {
  const cx = col * CELL_PX + CELL_PX / 2;
  const cy = row * CELL_PX + CELL_PX / 2;
  const half = CELL_PX / 2;
  switch (anchor) {
    case 'CENTER':
      return { x: cx, y: cy };
    case 'N':
      return { x: cx, y: cy - half };
    case 'S':
      return { x: cx, y: cy + half };
    case 'W':
      return { x: cx - half, y: cy };
    case 'E':
      return { x: cx + half, y: cy };
  }
};

const emitterBadgePosition = (
  em: Emitter
): { left: string; top: string; arrow: string } => {
  const pct = `${em.lineIndex * 20 + 10}%`;
  switch (em.edge) {
    case 'N':
      return { left: pct, top: '-14px', arrow: '↓' };
    case 'S':
      return { left: pct, top: 'calc(100% + 14px)', arrow: '↑' };
    case 'W':
      return { left: '-14px', top: pct, arrow: '→' };
    case 'E':
      return { left: 'calc(100% + 14px)', top: pct, arrow: '←' };
  }
};

const TileGraphic = ({
  cell,
  orientation,
  beaconLit,
  hinted,
}: {
  cell: GridCell;
  orientation: number;
  beaconLit: boolean;
  hinted: boolean;
}) => {
  if (cell.kind === 'blocker') {
    return (
      <div className="relative z-20 w-10 h-10 rounded-xl bg-slate-800 border-2 border-slate-700 shadow-inner flex items-center justify-center">
        <div className="w-3.5 h-3.5 rotate-45 bg-slate-600 rounded-xs opacity-70" />
      </div>
    );
  }

  if (cell.kind === 'beacon') {
    const colorMap = {
      azure: {
        ring: '#0284C7',
        fill: beaconLit ? '#0EA5E9' : '#E0F2FE',
        label: '🔵',
        sub: 'AZR',
      },
      solar: {
        ring: '#D97706',
        fill: beaconLit ? '#FBBF24' : '#FEF3C7',
        label: '🟡',
        sub: 'SLR',
      },
      emerald: {
        ring: '#059669',
        fill: beaconLit ? '#10B981' : '#D1FAE5',
        label: '🟢',
        sub: '🔵+🟡',
      },
    };
    const cfg = colorMap[cell.targetColor ?? 'azure'];
    return (
      <div
        className={`relative z-20 w-11 h-11 rounded-full flex flex-col items-center justify-center border-2 shadow-xs ${
          beaconLit ? 'al-beacon-lit' : ''
        }`}
        style={{
          borderColor: cfg.ring,
          backgroundColor: cfg.fill,
          boxShadow: beaconLit ? `0 0 16px ${cfg.ring}66` : undefined,
        }}
      >
        <span className="text-xs leading-none font-black text-slate-900">
          {beaconLit ? '✓' : cfg.label}
        </span>
        <span className="text-[9px] font-extrabold tracking-tight text-slate-800 mt-0.5">
          {cfg.sub}
        </span>
      </div>
    );
  }

  if (cell.kind === 'mirror' || cell.kind === 'prism') {
    const isSlash = orientation % 2 === 0; // '/' vs '\'
    const deg = isSlash ? -45 : 45;
    const isPrism = cell.kind === 'prism';
    return (
      <div className="relative z-20 w-11 h-11 flex items-center justify-center">
        <div
          className="w-10 h-2.5 rounded-full shadow-xs transition-transform duration-200"
          style={{
            transform: `rotate(${deg}deg)`,
            background: isPrism
              ? 'linear-gradient(90deg, #0EA5E9 0%, #FBBF24 100%)'
              : 'linear-gradient(90deg, #334155 0%, #94A3B8 50%, #334155 100%)',
            border: isPrism ? '1.5px solid #0284C7' : '1.5px solid #1E293B',
          }}
        />
        {isPrism && (
          <span className="absolute -bottom-1 right-0 text-[9px] font-extrabold px-1 rounded bg-amber-100 text-amber-900 border border-amber-300 leading-tight">
            ⇄
          </span>
        )}
        {hinted && (
          <span className="absolute -top-1 -left-1 text-[10px]" aria-hidden="true">
            💡
          </span>
        )}
      </div>
    );
  }

  if (cell.kind === 'splitter') {
    const open = splitterOpenPorts(orientation);
    return (
      <div className="relative z-20 w-11 h-11 flex items-center justify-center">
        <svg viewBox="0 0 48 48" className="w-10 h-10" aria-hidden="true">
          {/* Closed back wall indicator */}
          {!open.includes('N') && (
            <line x1="10" y1="8" x2="38" y2="8" stroke="#0F172A" strokeWidth="4" strokeLinecap="round" />
          )}
          {!open.includes('S') && (
            <line x1="10" y1="40" x2="38" y2="40" stroke="#0F172A" strokeWidth="4" strokeLinecap="round" />
          )}
          {!open.includes('W') && (
            <line x1="8" y1="10" x2="8" y2="38" stroke="#0F172A" strokeWidth="4" strokeLinecap="round" />
          )}
          {!open.includes('E') && (
            <line x1="40" y1="10" x2="40" y2="38" stroke="#0F172A" strokeWidth="4" strokeLinecap="round" />
          )}

          {/* 3 Open Optical Channels */}
          {open.includes('N') && (
            <line x1="24" y1="24" x2="24" y2="6" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round" />
          )}
          {open.includes('S') && (
            <line x1="24" y1="24" x2="24" y2="42" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round" />
          )}
          {open.includes('W') && (
            <line x1="24" y1="24" x2="6" y2="24" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round" />
          )}
          {open.includes('E') && (
            <line x1="24" y1="24" x2="42" y2="24" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round" />
          )}
          <circle cx="24" cy="24" r="6" fill="#EDE9FE" stroke="#7C3AED" strokeWidth="2.5" />
        </svg>
        {hinted && (
          <span className="absolute -top-1 -left-1 text-[10px]" aria-hidden="true">
            💡
          </span>
        )}
      </div>
    );
  }

  return null;
};

export const App = () => {
  const initialToday = useMemo(() => getUtcDateKey(), []);
  const [todayDateKey, setTodayDateKey] = useState<string>(initialToday);
  const [activeDateKey, setActiveDateKey] = useState<string>(initialToday);
  const [archiveKeys, setArchiveKeys] = useState<string[]>(() =>
    getRecentDateKeys(initialToday, 7)
  );
  const [username, setUsername] = useState<string>('anonymous');
  const [puzzle, setPuzzle] = useState<DailyPuzzle>(() =>
    generateDailyPuzzle(initialToday)
  );
  const [orientations, setOrientations] = useState<number[]>(
    () => generateDailyPuzzle(initialToday).initialOrientations
  );
  const [moves, setMoves] = useState<number>(0);
  const [seconds, setSeconds] = useState<number>(0);
  const [usedHint, setUsedHint] = useState<boolean>(false);
  const [hintedIndices, setHintedIndices] = useState<number[]>([]);
  const [muted, setMuted] = useState<boolean>(false);

  const [stats, setStats] = useState<PlayerStats>({
    currentStreak: 0,
    bestStreak: 0,
    totalSolved: 0,
    perfectRuns: 0,
    lastSolvedDate: null,
  });
  const [completion, setCompletion] = useState<DailyCompletionRecord | null>(
    null
  );
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [communitySolvedCount, setCommunitySolvedCount] = useState<number>(0);

  const [victoryBanner, setVictoryBanner] = useState<{
    stars: 1 | 2 | 3;
    points: number;
    rankLabel: string;
    percentileBeat: number;
    shareText: string;
    sharedToComments: boolean;
  } | null>(null);
  const [sharingComment, setSharingComment] = useState<boolean>(false);
  const [copyStatusText, setCopyStatusText] = useState<string>('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  );

  const rulesDialogRef = useRef<HTMLDialogElement | null>(null);
  const archiveDialogRef = useRef<HTMLDialogElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const lastAnnouncedCopyRef = useRef<string>('');
  const prevSatisfiedRef = useRef<number>(0);
  const solveSubmittedRef = useRef<boolean>(false);

  const trace = useMemo(
    () => tracePuzzle(puzzle, orientations),
    [puzzle, orientations]
  );

  // Initialize from Devvit server (gracefully falls back to local deterministic mode)
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (!isInitResponse(data)) return;

        setTodayDateKey(data.todayDateKey);
        setActiveDateKey(data.activeDateKey);
        setArchiveKeys(data.archiveDateKeys);
        setUsername(data.username);
        setPuzzle(data.puzzle);
        setOrientations(data.puzzle.initialOrientations);
        setStats(data.stats);
        setCompletion(data.todayCompletion);
        setLeaderboard(data.leaderboard);
        setCommunitySolvedCount(data.communitySolvedToday);
      } catch {
        // Offline / Vite local preview mode works out-of-the-box
      }
    };
    void init();
  }, []);

  // Live timer while puzzle is active and unsolved
  useEffect(() => {
    if (trace.allTargetsSatisfied) return;
    const id = window.setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [trace.allTargetsSatisfied, activeDateKey]);

  // Beacon lock chime
  useEffect(() => {
    if (
      trace.satisfiedTargets > prevSatisfiedRef.current &&
      !trace.allTargetsSatisfied
    ) {
      playBeaconLockSound(muted);
    }
    prevSatisfiedRef.current = trace.satisfiedTargets;
  }, [trace.satisfiedTargets, trace.allTargetsSatisfied, muted]);

  // Handle solve completion!
  useEffect(() => {
    if (!trace.allTargetsSatisfied || solveSubmittedRef.current) return;
    solveSubmittedRef.current = true;
    playVictoryFanfare(muted);

    const effectiveMoves = Math.max(puzzle.parMoves, moves);
    const localScore = scoreSolve(
      effectiveMoves,
      puzzle.parMoves,
      Math.max(1, seconds),
      usedHint
    );
    const fallbackShare = formatShareCard({
      puzzle,
      trace,
      moves: effectiveMoves,
      seconds: Math.max(1, seconds),
      stars: localScore.stars,
      streak: Math.max(1, stats.currentStreak),
      usedHint,
      username,
    });

    setVictoryBanner({
      stars: localScore.stars,
      points: localScore.points,
      rankLabel: localScore.rankLabel,
      percentileBeat: 92,
      shareText: fallbackShare,
      sharedToComments: completion?.sharedComment ?? false,
    });

    const syncSolve = async () => {
      try {
        const res = await fetch('/api/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dateKey: activeDateKey,
            orientations,
            moves: effectiveMoves,
            seconds: Math.max(1, seconds),
            usedHint,
          }),
        });
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (!isSolveResponse(data)) return;

        setStats(data.stats);
        setCompletion(data.completion);
        setLeaderboard(data.leaderboard);
        setCommunitySolvedCount(data.communitySolvedCount);
        setVictoryBanner({
          stars: data.stars,
          points: data.points,
          rankLabel: data.rankLabel,
          percentileBeat: data.percentileBeat,
          shareText: data.shareText,
          sharedToComments: data.completion.sharedComment,
        });
      } catch {
        // Local score banner already shown
      }
    };
    void syncSolve();
  }, [
    trace,
    moves,
    seconds,
    usedHint,
    puzzle,
    activeDateKey,
    orientations,
    muted,
    stats.currentStreak,
    username,
    completion?.sharedComment,
  ]);

  const loadDatePuzzle = useCallback(async (targetDateKey: string) => {
    const localPuzzle = generateDailyPuzzle(targetDateKey);
    solveSubmittedRef.current = false;
    prevSatisfiedRef.current = 0;
    setActiveDateKey(targetDateKey);
    setPuzzle(localPuzzle);
    setOrientations(localPuzzle.initialOrientations);
    setMoves(0);
    setSeconds(0);
    setUsedHint(false);
    setHintedIndices([]);
    setVictoryBanner(null);
    setCopyState('idle');
    setCopyStatusText('');

    try {
      const res = await fetch(
        `/api/puzzle?date=${encodeURIComponent(targetDateKey)}`
      );
      if (!res.ok) return;
      const data: unknown = await res.json();
      if (!isPuzzleResponse(data)) return;
      setCompletion(data.completion);
      setLeaderboard(data.leaderboard);
      setCommunitySolvedCount(data.communitySolvedCount);
    } catch {
      setCompletion(null);
    }
  }, []);

  const handleTileClick = (cell: GridCell) => {
    if (!isRotatableKind(cell.kind) || trace.allTargetsSatisfied) return;
    const nextMoves = moves + 1;
    setMoves(nextMoves);
    playRotateSound(muted, nextMoves);
    setOrientations((prev) => {
      const copy = [...prev];
      copy[cell.index] = rotateOrientation(
        cell.kind,
        copy[cell.index] ?? 0
      );
      return copy;
    });
  };

  const handleReset = () => {
    solveSubmittedRef.current = false;
    prevSatisfiedRef.current = 0;
    setOrientations(puzzle.initialOrientations);
    setMoves(0);
    setSeconds(0);
    setUsedHint(false);
    setHintedIndices([]);
    setVictoryBanner(null);
  };

  const handleHint = () => {
    if (trace.allTargetsSatisfied) return;
    for (const cell of puzzle.cells) {
      if (!isRotatableKind(cell.kind)) continue;
      const cur = orientations[cell.index] ?? 0;
      const sol = puzzle.solutionOrientations[cell.index] ?? 0;
      if (cur !== sol) {
        setUsedHint(true);
        setHintedIndices((prev) =>
          prev.includes(cell.index) ? prev : [...prev, cell.index]
        );
        setMoves((m) => m + 1);
        playBeaconLockSound(muted);
        setOrientations((prev) => {
          const copy = [...prev];
          copy[cell.index] = sol;
          return copy;
        });
        safeToast(
          `Aligned tile at Row ${cell.row + 1}, Col ${cell.col + 1} to optimal angle!`
        );
        return;
      }
    }
  };

  const reportCopyOutcome = (ok: boolean): void => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    let msg = ok ? 'Copied' : 'Copy failed';
    if (msg === lastAnnouncedCopyRef.current) {
      msg += '\u00A0';
    }
    lastAnnouncedCopyRef.current = msg;
    setCopyState(ok ? 'copied' : 'failed');
    setCopyStatusText(msg);
    safeToast(
      ok
        ? 'Copied spoiler-free Emoji Card to clipboard!'
        : 'Clipboard unavailable in this view'
    );
    copyTimerRef.current = window.setTimeout(() => {
      setCopyState('idle');
      setCopyStatusText('');
      copyTimerRef.current = null;
    }, 2200);
  };

  const handleCopyShare = async () => {
    if (!victoryBanner) return;
    try {
      await navigator.clipboard.writeText(victoryBanner.shareText);
      reportCopyOutcome(true);
    } catch {
      const ok = legacyCopyText(victoryBanner.shareText);
      reportCopyOutcome(ok);
    }
  };

  const handlePostRedditComment = async () => {
    if (!victoryBanner || sharingComment || victoryBanner.sharedToComments) {
      return;
    }
    setSharingComment(true);
    try {
      const res = await fetch('/api/share-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey: activeDateKey,
          orientations,
          moves: Math.max(puzzle.parMoves, moves),
          seconds: Math.max(1, seconds),
          usedHint,
        }),
      });
      const raw: unknown = await res.json();
      if (isShareResponse(raw)) {
        safeToast(raw.message);
        if (raw.ok) {
          setVictoryBanner((prev) =>
            prev ? { ...prev, sharedToComments: true } : null
          );
        }
      }
    } catch {
      await handleCopyShare();
    } finally {
      setSharingComment(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start py-2 px-3 sm:py-3">
      {/* Top Header Strip */}
      <header className="w-full max-w-[460px] flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight truncate">
              ⚡ Prism Pulse #{puzzle.puzzleNumber}
            </h1>
            {activeDateKey !== todayDateKey && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                Archive
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 font-medium truncate">
            {activeDateKey} • Tap optical tiles to ignite all beacons
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            className="al-btn h-8 w-8 rounded-xl bg-white border border-slate-200 text-sm flex items-center justify-center cursor-pointer shadow-2xs"
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            type="button"
            onClick={() => archiveDialogRef.current?.showModal()}
            className="al-btn h-8 px-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 flex items-center gap-1 whitespace-nowrap cursor-pointer shadow-2xs"
          >
            🏆 Ranks
          </button>
          <button
            type="button"
            onClick={() => rulesDialogRef.current?.showModal()}
            aria-label="How to play Prism Pulse"
            className="al-btn h-8 w-8 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-sky-700 flex items-center justify-center cursor-pointer shadow-2xs"
          >
            ?
          </button>
        </div>
      </header>

      {/* Telemetry HUD Bar */}
      <div className="al-glass-card w-full max-w-[460px] rounded-2xl px-3 py-1.5 mb-2.5 grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Beacons
          </div>
          <div className="text-sm font-extrabold text-emerald-700">
            {trace.satisfiedTargets} / {trace.totalTargets}
          </div>
        </div>
        <div className="border-x border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Moves / Par
          </div>
          <div
            className={`text-sm font-extrabold ${
              moves <= puzzle.parMoves ? 'text-sky-700' : 'text-amber-700'
            }`}
          >
            {moves} / {puzzle.parMoves}
          </div>
        </div>
        <div className="border-r border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Time
          </div>
          <div className="text-sm font-extrabold text-slate-900">
            {formatDuration(seconds)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Streak
          </div>
          <div className="text-sm font-extrabold text-amber-600">
            🔥 {stats.currentStreak}
          </div>
        </div>
      </div>

      {/* Main Optical Board Container (with Perimeter Emitter Margin) */}
      <div className="al-active-frame rounded-3xl p-4 sm:p-5 bg-white mb-2.5">
        <div
          className="relative"
          style={{ width: `${BOARD_PX}px`, height: `${BOARD_PX}px` }}
        >
          {/* Perimeter Laser Emitters */}
          {puzzle.emitters.map((em) => {
            const pos = emitterBadgePosition(em);
            const isAzure = em.color === 'azure';
            return (
              <div
                key={em.id}
                style={{ left: pos.left, top: pos.top }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shadow-md border-2 border-white ${
                  isAzure ? 'bg-sky-500' : 'bg-amber-500'
                }`}
                title={`${isAzure ? 'Azure' : 'Solar'} Laser Emitter`}
              >
                {pos.arrow}
              </div>
            );
          })}

          {/* 5x5 Interactive Tile Grid */}
          <div className="grid grid-cols-5 grid-rows-5 w-full h-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-50/70">
            {puzzle.cells.map((cell) => {
              const rotatable = isRotatableKind(cell.kind);
              const illum = trace.illumination[cell.index] ?? {
                azure: false,
                solar: false,
              };
              const beaconLit = Boolean(trace.beaconSatisfied[cell.index]);
              const isHinted = hintedIndices.includes(cell.index);

              let cellBg = 'bg-white/90';
              if (illum.azure && illum.solar) {
                cellBg = 'bg-emerald-50/90';
              } else if (illum.azure) {
                cellBg = 'bg-sky-50/85';
              } else if (illum.solar) {
                cellBg = 'bg-amber-50/85';
              }

              return (
                <button
                  key={cell.index}
                  type="button"
                  disabled={!rotatable || trace.allTargetsSatisfied}
                  onClick={() => handleTileClick(cell)}
                  aria-label={`Row ${cell.row + 1} Column ${cell.col + 1}: ${cell.kind}`}
                  className={`al-tile-btn relative border border-slate-200/80 flex items-center justify-center ${cellBg} ${
                    rotatable && !trace.allTargetsSatisfied
                      ? 'cursor-pointer hover:border-sky-400'
                      : 'cursor-default'
                  }`}
                >
                  <TileGraphic
                    cell={cell}
                    orientation={orientations[cell.index] ?? 0}
                    beaconLit={beaconLit}
                    hinted={isHinted}
                  />
                </button>
              );
            })}
          </div>

          {/* Real-Time Raytraced Laser SVG Overlay */}
          <svg
            viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`}
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            aria-hidden="true"
          >
            {trace.segments.map((seg: BeamSegment, i: number) => {
              const p1 = pointForAnchor(seg.row, seg.col, seg.from);
              const p2 = pointForAnchor(seg.row, seg.col, seg.to);
              const stroke = seg.color === 'azure' ? '#0EA5E9' : '#F59E0B';
              return (
                <g key={i}>
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={stroke}
                    strokeWidth="7"
                    strokeOpacity="0.24"
                    strokeLinecap="round"
                  />
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={stroke}
                    strokeWidth="3"
                    strokeOpacity="0.95"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Controls & Quick Legend Strip */}
      <div className="w-full max-w-[460px] flex items-center justify-between gap-2 mb-2">
        <button
          type="button"
          onClick={handleReset}
          className="al-btn flex-1 py-2 px-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer shadow-2xs"
        >
          ↺ Reset Board
        </button>
        <button
          type="button"
          onClick={handleHint}
          disabled={trace.allTargetsSatisfied}
          className="al-btn flex-1 py-2 px-3 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-900 cursor-pointer shadow-2xs disabled:opacity-50"
        >
          💡 Align 1 Tile (Hint)
        </button>
      </div>

      {/* Compact Inline Tile Legend (Zero Learning Curve) */}
      {!victoryBanner && (
        <div className="w-full max-w-[460px] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-600 px-2">
          <span>
            <strong className="text-slate-900">Mirror:</strong> 90° bounce
          </span>
          <span>•</span>
          <span>
            <strong className="text-sky-700">Prism ⇄:</strong> 90° + flips 🔵↔🟡
          </span>
          <span>•</span>
          <span>
            <strong className="text-purple-700">Splitter:</strong> 2-way split
          </span>
          <span>•</span>
          <span>
            <strong className="text-emerald-700">🟢:</strong> needs 🔵+🟡
          </span>
        </div>
      )}

      {/* Victory Celebration Card (Inline right below board so player sees solved beams!) */}
      {victoryBanner && (
        <section
          aria-live="polite"
          className="al-active-frame w-full max-w-[460px] rounded-2xl p-3 bg-white space-y-2"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                All Beacons Ignited • {victoryBanner.rankLabel}
              </div>
              <h2 className="text-base font-extrabold text-slate-900">
                {'⭐'.repeat(victoryBanner.stars)} {victoryBanner.points} pts
              </h2>
            </div>
            <div className="text-right text-xs text-slate-600">
              <div>
                Top <strong>{100 - victoryBanner.percentileBeat}%</strong> today
              </div>
              <div>
                {communitySolvedCount} solved #{puzzle.puzzleNumber}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handlePostRedditComment()}
              disabled={sharingComment || victoryBanner.sharedToComments}
              className="al-btn min-h-9 py-2 px-3 rounded-xl font-bold text-xs text-white cursor-pointer shadow-xs disabled:opacity-65"
              style={{
                background:
                  'linear-gradient(135deg, #0284C7 0%, #10B981 100%)',
              }}
            >
              {victoryBanner.sharedToComments
                ? '✅ Posted to Reddit Comments'
                : sharingComment
                  ? 'Posting to Comments...'
                  : '💬 Share Grid to Comments'}
            </button>
            <span className="relative flex flex-col">
              <button
                type="button"
                onClick={() => void handleCopyShare()}
                data-copied={copyState === 'copied' ? '' : undefined}
                data-failed={copyState === 'failed' ? '' : undefined}
                className="al-btn min-h-9 w-full py-2 px-3 rounded-xl font-bold text-xs bg-slate-900 text-white cursor-pointer shadow-xs"
              >
                <span aria-hidden="true">
                  {copyState === 'copied'
                    ? '✓ '
                    : copyState === 'failed'
                      ? '⚠ '
                      : '📋 '}
                </span>
                {copyState === 'copied'
                  ? 'Copied Emoji Grid!'
                  : copyState === 'failed'
                    ? 'Copy Failed — Retry'
                    : 'Copy Spoiler-Free Card'}
              </button>
              <span
                role="status"
                className={`pointer-events-none absolute -top-6 right-1 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs transition-opacity duration-150 ${
                  copyStatusText ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {copyStatusText}
              </span>
            </span>
          </div>
        </section>
      )}

      {/* Native Modal 1: Leaderboard & 7-Day Archive */}
      <dialog
        ref={archiveDialogRef}
        aria-labelledby="archive-dialog-title"
        className="al-dialog"
      >
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h1
              id="archive-dialog-title"
              className="text-base font-extrabold text-slate-900"
            >
              🏆 Leaderboard &amp; 7-Day Archive
            </h1>
            <form method="dialog">
              <button
                type="submit"
                autoFocus
                className="h-8 px-3 rounded-lg bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Close
              </button>
            </form>
          </div>

          {/* 7-Day Switcher */}
          <div>
            <div className="text-xs font-bold text-slate-500 mb-2">
              Play Past Daily Editions (UTC):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {archiveKeys.map((dk, idx) => {
                const active = dk === activeDateKey;
                return (
                  <button
                    key={dk}
                    type="button"
                    onClick={() => {
                      void loadDatePuzzle(dk);
                      archiveDialogRef.current?.close();
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                      active
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-sky-400'
                    }`}
                  >
                    {idx === 0 ? `Today (${dk.slice(5)})` : dk.slice(5)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Career Summary */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-center text-xs">
            <div>
              <div className="text-slate-500">Best Streak</div>
              <div className="font-extrabold text-slate-900">
                🔥 {stats.bestStreak}d
              </div>
            </div>
            <div>
              <div className="text-slate-500">Total Solved</div>
              <div className="font-extrabold text-slate-900">
                {stats.totalSolved}
              </div>
            </div>
            <div>
              <div className="text-slate-500">3⭐ Perfects</div>
              <div className="font-extrabold text-emerald-700">
                {stats.perfectRuns}
              </div>
            </div>
          </div>

          {/* Top 10 Daily Leaderboard */}
          <div>
            <div className="text-xs font-bold text-slate-500 mb-2">
              Top Solvers for {activeDateKey}:
            </div>
            {leaderboard.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3 text-center">
                No verified solves recorded for this edition yet — finish the
                board to claim <strong>#1</strong>!
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {leaderboard.map((row) => (
                  <div
                    key={row.username}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-2 font-bold text-slate-900">
                      <span className="text-sky-700">#{row.rank}</span>
                      <span>u/{row.username}</span>
                      <span>{'⭐'.repeat(row.stars)}</span>
                    </div>
                    <div className="text-slate-600 font-semibold">
                      {row.moves}m • {formatDuration(row.seconds)} •{' '}
                      <strong className="text-slate-900">{row.points}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </dialog>

      {/* Native Modal 2: Optical Rules Guide */}
      <dialog
        ref={rulesDialogRef}
        aria-labelledby="rules-dialog-title"
        className="al-dialog"
      >
        <div className="p-5 space-y-3 text-xs text-slate-700 leading-relaxed">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h1
              id="rules-dialog-title"
              className="text-base font-extrabold text-slate-900"
            >
              ⚡ How to Play Prism Pulse
            </h1>
            <form method="dialog">
              <button
                type="submit"
                autoFocus
                className="h-8 px-3 rounded-lg bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Got it
              </button>
            </form>
          </div>

          <p>
            Every UTC day generates one deterministic <strong>5×5</strong>{' '}
            optical puzzle shared by everyone on Reddit, with a mathematically
            verified minimum move count (<strong>Par</strong>).
          </p>

          <ul className="space-y-2 list-disc pl-4">
            <li>
              <strong>Silver Mirror:</strong> Tap to flip between{' '}
              <code>/</code> and <code>\</code> (reflects any laser 90°).
            </li>
            <li>
              <strong>Chromatic Prism (⇄):</strong> Reflects 90°{' '}
              <em>and</em> converts beam color between{' '}
              <strong className="text-sky-700">🔵 Azure</strong> and{' '}
              <strong className="text-amber-700">🟡 Solar</strong>.
            </li>
            <li>
              <strong>Purple T-Splitter:</strong> Tap to rotate 90°. Light
              entering any of its 3 open prongs splits out the other 2 prongs;
              the flat dark bar blocks light.
            </li>
            <li>
              <strong>Target Beacons:</strong> Match{' '}
              <strong className="text-sky-700">AZR (🔵 only)</strong>,{' '}
              <strong className="text-amber-700">SLR (🟡 only)</strong>, or{' '}
              <strong className="text-emerald-700">
                🔵+🟡 Emerald Fusion
              </strong>{' '}
              (intersect both an Azure beam and a Solar beam through the same
              beacon!).
            </li>
          </ul>

          <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-sky-900 font-semibold">
            ⭐⭐⭐ Solve within <strong>Par moves</strong> without using a Hint
            to earn <strong>Prism Grandmaster</strong> status and post your
            spoiler-free Emoji Grid straight to the Reddit comments!
          </div>
        </div>
      </dialog>
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
