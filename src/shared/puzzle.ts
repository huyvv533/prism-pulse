export type Direction = 'N' | 'E' | 'S' | 'W';
export type BeamColor = 'azure' | 'solar';
export type TargetColor = 'azure' | 'solar' | 'emerald';

export type CellKind =
  | 'empty'
  | 'blocker'
  | 'mirror'
  | 'prism'
  | 'splitter'
  | 'beacon';

export type GridCell = {
  index: number;
  row: number;
  col: number;
  kind: CellKind;
  targetColor?: TargetColor;
};

export type Emitter = {
  id: string;
  edge: Direction;
  lineIndex: number;
  direction: Direction;
  color: BeamColor;
};

export type DailyPuzzle = {
  dateKey: string;
  puzzleNumber: number;
  gridSize: number;
  emitters: Emitter[];
  cells: GridCell[];
  initialOrientations: number[];
  solutionOrientations: number[];
  parMoves: number;
};

export type BeamSegment = {
  row: number;
  col: number;
  from: Direction | 'CENTER';
  to: Direction | 'CENTER';
  color: BeamColor;
};

export type CellIllumination = {
  azure: boolean;
  solar: boolean;
};

export type TraceResult = {
  segments: BeamSegment[];
  illumination: CellIllumination[];
  beaconSatisfied: Record<number, boolean>;
  satisfiedTargets: number;
  totalTargets: number;
  allTargetsSatisfied: boolean;
};

export type SolveScore = {
  stars: 1 | 2 | 3;
  points: number;
  rankLabel: string;
};

export type ShareCardInput = {
  puzzle: DailyPuzzle;
  trace: TraceResult;
  moves: number;
  seconds: number;
  stars: 1 | 2 | 3;
  streak: number;
  usedHint: boolean;
  username?: string;
};

const GRID_SIZE = 5;
const EPOCH_UTC_MS = Date.UTC(2026, 0, 1);

const ALL_DIRS: Direction[] = ['N', 'E', 'S', 'W'];

export const oppositeDir = (dir: Direction): Direction => {
  switch (dir) {
    case 'N':
      return 'S';
    case 'S':
      return 'N';
    case 'E':
      return 'W';
    case 'W':
      return 'E';
  }
};

export const stepDelta = (dir: Direction): { dr: number; dc: number } => {
  switch (dir) {
    case 'N':
      return { dr: -1, dc: 0 };
    case 'S':
      return { dr: 1, dc: 0 };
    case 'E':
      return { dr: 0, dc: 1 };
    case 'W':
      return { dr: 0, dc: -1 };
  }
};

export const isRotatableKind = (kind: CellKind): boolean =>
  kind === 'mirror' || kind === 'prism' || kind === 'splitter';

export const orientationPeriod = (kind: CellKind): number => {
  if (kind === 'mirror' || kind === 'prism') return 2;
  if (kind === 'splitter') return 4;
  return 1;
};

export const rotateOrientation = (kind: CellKind, current: number): number => {
  const period = orientationPeriod(kind);
  if (period <= 1) return 0;
  return (((current + 1) % period) + period) % period;
};

export const quarterTurnsBetween = (
  kind: CellKind,
  fromOri: number,
  toOri: number
): number => {
  const period = orientationPeriod(kind);
  if (period <= 1) return 0;
  const f = ((fromOri % period) + period) % period;
  const t = ((toOri % period) + period) % period;
  return (t - f + period) % period;
};

export const computeMinMovesToSolution = (
  puzzle: DailyPuzzle,
  orientations: number[]
): number => {
  let moves = 0;
  for (let i = 0; i < puzzle.cells.length; i++) {
    const cell = puzzle.cells[i];
    if (cell && isRotatableKind(cell.kind)) {
      moves += quarterTurnsBetween(
        cell.kind,
        orientations[i] ?? 0,
        puzzle.solutionOrientations[i] ?? 0
      );
    }
  }
  return moves;
};

const reflectSlash = (inDir: Direction, orientation: number): Direction => {
  const norm = ((orientation % 2) + 2) % 2;
  if (norm === 0) {
    // '/' mirror: E<->N, S<->W
    switch (inDir) {
      case 'E':
        return 'N';
      case 'N':
        return 'E';
      case 'S':
        return 'W';
      case 'W':
        return 'S';
    }
  }
  // '\' mirror: E<->S, N<->W
  switch (inDir) {
    case 'E':
      return 'S';
    case 'S':
      return 'E';
    case 'N':
      return 'W';
    case 'W':
      return 'N';
  }
};

export const splitterOpenPorts = (orientation: number): Direction[] => {
  const closedIndex = ((orientation % 4) + 4) % 4;
  const closedFace = ALL_DIRS[closedIndex] ?? 'N';
  return ALL_DIRS.filter((d) => d !== closedFace);
};

export const tracePuzzle = (
  puzzle: DailyPuzzle,
  orientations: number[]
): TraceResult => {
  const size = puzzle.gridSize;
  const totalCells = size * size;
  const illumination: CellIllumination[] = Array.from(
    { length: totalCells },
    () => ({
      azure: false,
      solar: false,
    })
  );
  const segments: BeamSegment[] = [];

  type RayState = {
    row: number;
    col: number;
    inDir: Direction;
    color: BeamColor;
  };

  const queue: RayState[] = [];
  const visited = new Set<string>();

  for (const emitter of puzzle.emitters) {
    let startRow: number;
    let startCol: number;
    if (emitter.edge === 'N') {
      startRow = 0;
      startCol = emitter.lineIndex;
    } else if (emitter.edge === 'S') {
      startRow = size - 1;
      startCol = emitter.lineIndex;
    } else if (emitter.edge === 'W') {
      startRow = emitter.lineIndex;
      startCol = 0;
    } else {
      startRow = emitter.lineIndex;
      startCol = size - 1;
    }
    queue.push({
      row: startRow,
      col: startCol,
      inDir: emitter.direction,
      color: emitter.color,
    });
  }

  while (queue.length > 0) {
    const ray = queue.shift();
    if (!ray) break;
    const { row, col, inDir, color } = ray;
    if (row < 0 || row >= size || col < 0 || col >= size) continue;

    const stateKey = `${row},${col},${inDir},${color}`;
    if (visited.has(stateKey)) continue;
    visited.add(stateKey);

    const idx = row * size + col;
    const cell = puzzle.cells[idx];
    const illum = illumination[idx];
    if (!cell || !illum) continue;

    const entryFace = oppositeDir(inDir);

    if (cell.kind === 'blocker') {
      continue;
    }

    if (cell.kind === 'splitter') {
      const openPorts = splitterOpenPorts(orientations[idx] ?? 0);
      if (!openPorts.includes(entryFace)) {
        // Hits the flat opaque back of the splitter
        continue;
      }
      if (color === 'azure') illum.azure = true;
      else illum.solar = true;
      segments.push({ row, col, from: entryFace, to: 'CENTER', color });

      for (const outDir of openPorts) {
        if (outDir === entryFace) continue;
        segments.push({ row, col, from: 'CENTER', to: outDir, color });
        const { dr, dc } = stepDelta(outDir);
        queue.push({ row: row + dr, col: col + dc, inDir: outDir, color });
      }
      continue;
    }

    if (color === 'azure') illum.azure = true;
    else illum.solar = true;

    if (cell.kind === 'empty' || cell.kind === 'beacon') {
      segments.push({ row, col, from: entryFace, to: 'CENTER', color });
      segments.push({ row, col, from: 'CENTER', to: inDir, color });
      const { dr, dc } = stepDelta(inDir);
      queue.push({ row: row + dr, col: col + dc, inDir, color });
      continue;
    }

    if (cell.kind === 'mirror' || cell.kind === 'prism') {
      const outDir = reflectSlash(inDir, orientations[idx] ?? 0);
      const outColor: BeamColor =
        cell.kind === 'prism'
          ? color === 'azure'
            ? 'solar'
            : 'azure'
          : color;
      if (outColor === 'azure') illum.azure = true;
      else illum.solar = true;

      segments.push({ row, col, from: entryFace, to: 'CENTER', color });
      segments.push({ row, col, from: 'CENTER', to: outDir, color: outColor });
      const { dr, dc } = stepDelta(outDir);
      queue.push({
        row: row + dr,
        col: col + dc,
        inDir: outDir,
        color: outColor,
      });
    }
  }

  const beaconSatisfied: Record<number, boolean> = {};
  let satisfiedTargets = 0;
  let totalTargets = 0;

  for (const cell of puzzle.cells) {
    if (cell.kind !== 'beacon' || !cell.targetColor) continue;
    totalTargets += 1;
    const illum = illumination[cell.index] ?? { azure: false, solar: false };
    let ok: boolean;
    if (cell.targetColor === 'emerald') {
      ok = illum.azure && illum.solar;
    } else if (cell.targetColor === 'azure') {
      ok = illum.azure && !illum.solar;
    } else {
      ok = illum.solar && !illum.azure;
    }
    beaconSatisfied[cell.index] = ok;
    if (ok) satisfiedTargets += 1;
  }

  return {
    segments,
    illumination,
    beaconSatisfied,
    satisfiedTargets,
    totalTargets,
    allTargetsSatisfied: totalTargets > 0 && satisfiedTargets === totalTargets,
  };
};

const hashString = (str: string): number => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const createRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const getUtcDateKey = (date: Date = new Date()): string => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getRecentDateKeys = (
  anchorDateKey: string,
  days: number = 7
): string[] => {
  const parts = anchorDateKey.split('-').map((n) => Number(n));
  const y = parts[0] ?? 2026;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const baseMs = Date.UTC(y, m, d);
  const result: string[] = [];
  for (let i = 0; i < days; i++) {
    result.push(getUtcDateKey(new Date(baseMs - i * 86400000)));
  }
  return result;
};

const computePuzzleNumber = (dateKey: string): number => {
  const parts = dateKey.split('-').map((n) => Number(n));
  const y = parts[0] ?? 2026;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const utcMs = Date.UTC(y, m, d);
  const diffDays = Math.floor((utcMs - EPOCH_UTC_MS) / 86400000);
  return Math.max(1, diffDays + 1);
};

const findGlobalOptimalSolution = (
  basePuzzle: DailyPuzzle,
  initialOrientations: number[]
): { bestOrientations: number[]; minMoves: number } | null => {
  const rotIndices: number[] = [];
  const periods: number[] = [];

  for (let i = 0; i < basePuzzle.cells.length; i++) {
    const cell = basePuzzle.cells[i];
    if (cell && isRotatableKind(cell.kind)) {
      rotIndices.push(i);
      periods.push(orientationPeriod(cell.kind));
    }
  }

  let bestMoves = Infinity;
  let bestOrientations: number[] | null = null;
  const candidate = [...initialOrientations];

  const dfs = (pos: number, movesSoFar: number): void => {
    if (movesSoFar >= bestMoves) return;
    if (pos === rotIndices.length) {
      if (movesSoFar === 0) return;
      const trace = tracePuzzle(basePuzzle, candidate);
      if (trace.allTargetsSatisfied) {
        bestMoves = movesSoFar;
        bestOrientations = [...candidate];
      }
      return;
    }

    const cellIdx = rotIndices[pos] ?? 0;
    const period = periods[pos] ?? 1;
    const startOri = initialOrientations[cellIdx] ?? 0;

    for (let step = 0; step < period; step++) {
      candidate[cellIdx] = (startOri + step) % period;
      dfs(pos + 1, movesSoFar + step);
    }
    candidate[cellIdx] = startOri;
  };

  dfs(0, 0);
  if (!bestOrientations || !Number.isFinite(bestMoves)) return null;
  return { bestOrientations, minMoves: bestMoves };
};

export const generateDailyPuzzle = (dateKey: string): DailyPuzzle => {
  const puzzleNumber = computePuzzleNumber(dateKey);
  const rng = createRng(hashString(`prism-pulse-v1:${dateKey}`));

  const pickInt = (maxExclusive: number): number =>
    Math.floor(rng() * maxExclusive);

  for (let attempt = 0; attempt < 250; attempt++) {
    // 1. Place two distinct perimeter emitters (one Azure, one Solar)
    const edgeA = ALL_DIRS[pickInt(4)] ?? 'W';
    const edgeB = ALL_DIRS[(ALL_DIRS.indexOf(edgeA) + 1 + pickInt(3)) % 4] ?? 'N';
    const lineA = 1 + pickInt(3);
    const lineB = 1 + pickInt(3);

    const emitters: Emitter[] = [
      {
        id: 'em-azure',
        edge: edgeA,
        lineIndex: lineA,
        direction: oppositeDir(edgeA),
        color: 'azure',
      },
      {
        id: 'em-solar',
        edge: edgeB,
        lineIndex: lineB,
        direction: oppositeDir(edgeB),
        color: 'solar',
      },
    ];

    const cells: GridCell[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, idx) => ({
      index: idx,
      row: Math.floor(idx / GRID_SIZE),
      col: idx % GRID_SIZE,
      kind: 'empty',
    }));

    // Protect immediate entry cells in front of emitters from blockers
    const entryCells = new Set<number>();
    for (const em of emitters) {
      const r =
        em.edge === 'N' ? 0 : em.edge === 'S' ? GRID_SIZE - 1 : em.lineIndex;
      const c =
        em.edge === 'W' ? 0 : em.edge === 'E' ? GRID_SIZE - 1 : em.lineIndex;
      entryCells.add(r * GRID_SIZE + c);
    }

    // Shuffle all 25 indices deterministically
    const pool = Array.from({ length: 25 }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = pickInt(i + 1);
      const tmp = pool[i] ?? 0;
      pool[i] = pool[j] ?? 0;
      pool[j] = tmp;
    }

    // Place 6 rotatable optical tiles: 3 mirrors, 2 prisms, 1 splitter
    const layoutPlan: CellKind[] = [
      'mirror',
      'mirror',
      'mirror',
      'prism',
      'prism',
      'splitter',
    ];
    if (rng() > 0.55) {
      layoutPlan.push('splitter');
    }

    const secretOrientations = new Array<number>(25).fill(0);
    let cursor = 0;

    for (const kind of layoutPlan) {
      while (cursor < pool.length) {
        const idx = pool[cursor] ?? 0;
        cursor += 1;
        const targetCell = cells[idx];
        if (targetCell && targetCell.kind === 'empty') {
          targetCell.kind = kind;
          secretOrientations[idx] = pickInt(orientationPeriod(kind));
          break;
        }
      }
    }

    // Place 2 obsidian blockers away from emitter entry squares
    let blockersPlaced = 0;
    while (cursor < pool.length && blockersPlaced < 2) {
      const idx = pool[cursor] ?? 0;
      cursor += 1;
      const targetCell = cells[idx];
      if (targetCell && targetCell.kind === 'empty' && !entryCells.has(idx)) {
        targetCell.kind = 'blocker';
        blockersPlaced += 1;
      }
    }

    const draftPuzzle: DailyPuzzle = {
      dateKey,
      puzzleNumber,
      gridSize: GRID_SIZE,
      emitters,
      cells,
      initialOrientations: [...secretOrientations],
      solutionOrientations: [...secretOrientations],
      parMoves: 0,
    };

    const solvedPreview = tracePuzzle(draftPuzzle, secretOrientations);

    // Require at least 3 rotatable tiles to actively carry light in the solution
    let activeRotatables = 0;
    const candidateBeacons: { idx: number; color: TargetColor }[] = [];

    for (const cell of cells) {
      const illum = solvedPreview.illumination[cell.index];
      if (!illum) continue;
      const isLit = illum.azure || illum.solar;
      if (isRotatableKind(cell.kind) && isLit) {
        activeRotatables += 1;
      }
      if (cell.kind === 'empty' && isLit && !entryCells.has(cell.index)) {
        const color: TargetColor =
          illum.azure && illum.solar
            ? 'emerald'
            : illum.azure
              ? 'azure'
              : 'solar';
        candidateBeacons.push({ idx: cell.index, color });
      }
    }

    if (activeRotatables < 3 || candidateBeacons.length < 3) continue;

    // Prioritize any emerald fusion cells first, then mix azure & solar
    candidateBeacons.sort((a, b) => {
      const rank = (c: TargetColor): number => (c === 'emerald' ? 0 : 1);
      return rank(a.color) - rank(b.color);
    });

    const targetCount = candidateBeacons.length >= 4 && rng() > 0.35 ? 4 : 3;
    const chosen = candidateBeacons.slice(0, targetCount);
    for (const item of chosen) {
      const c = cells[item.idx];
      if (c) {
        c.kind = 'beacon';
        c.targetColor = item.color;
      }
    }

    // Scramble rotatable tiles to create initialOrientations
    const initialOrientations = [...secretOrientations];
    for (const cell of cells) {
      if (!isRotatableKind(cell.kind)) continue;
      const period = orientationPeriod(cell.kind);
      const offset = 1 + pickInt(period - 1);
      initialOrientations[cell.index] =
        ((secretOrientations[cell.index] ?? 0) + offset) % period;
    }

    const initialPreview = tracePuzzle(draftPuzzle, initialOrientations);
    if (initialPreview.allTargetsSatisfied) continue;
    if (initialPreview.satisfiedTargets >= targetCount - 1 && targetCount <= 3) {
      // Avoid 2/3 already lit if a richer scramble exists
      if (attempt < 180) continue;
    }

    // Exact global BFS/DFS verification over all <= 512 states!
    const optimal = findGlobalOptimalSolution(draftPuzzle, initialOrientations);
    if (!optimal || optimal.minMoves < 3 || optimal.minMoves > 10) continue;

    return {
      dateKey,
      puzzleNumber,
      gridSize: GRID_SIZE,
      emitters,
      cells,
      initialOrientations,
      solutionOrientations: optimal.bestOrientations,
      parMoves: optimal.minMoves,
    };
  }

  // Deterministic fallback guaranteed-valid handcrafted puzzle if 250 random seeds ever miss
  const fallbackCells: GridCell[] = Array.from({ length: 25 }, (_, idx) => ({
    index: idx,
    row: Math.floor(idx / 5),
    col: idx % 5,
    kind: 'empty',
  }));
  fallbackCells[2] = { index: 2, row: 0, col: 2, kind: 'mirror' };
  fallbackCells[12] = { index: 12, row: 2, col: 2, kind: 'splitter' };
  fallbackCells[10] = { index: 10, row: 2, col: 0, kind: 'prism' };
  fallbackCells[14] = { index: 14, row: 2, col: 4, kind: 'mirror' };
  fallbackCells[4] = {
    index: 4,
    row: 0,
    col: 4,
    kind: 'beacon',
    targetColor: 'azure',
  };
  fallbackCells[20] = {
    index: 20,
    row: 4,
    col: 0,
    kind: 'beacon',
    targetColor: 'solar',
  };
  fallbackCells[24] = {
    index: 24,
    row: 4,
    col: 4,
    kind: 'beacon',
    targetColor: 'azure',
  };

  const sol = new Array<number>(25).fill(0);
  sol[2] = 1; // '\' sends East-moving beam at (0,2) South to (2,2)
  sol[12] = 2; // 'S' closed -> splits incoming 'S' (from 'N') to 'E' and 'W'
  sol[10] = 0; // '/' sends West-moving beam at (2,0) South to (4,0) and flips azure->solar!
  sol[14] = 1; // '\' sends East-moving beam at (2,4) South to (4,4)!

  const init = new Array<number>(25).fill(0);
  init[2] = 0;
  init[12] = 0;
  init[10] = 1;
  init[14] = 0;

  const fb: DailyPuzzle = {
    dateKey,
    puzzleNumber,
    gridSize: 5,
    emitters: [
      { id: 'em-a', edge: 'W', lineIndex: 0, direction: 'E', color: 'azure' },
      { id: 'em-b', edge: 'S', lineIndex: 4, direction: 'N', color: 'azure' },
    ],
    cells: fallbackCells,
    initialOrientations: init,
    solutionOrientations: sol,
    parMoves: 5,
  };
  const opt = findGlobalOptimalSolution(fb, init);
  if (opt) {
    fb.solutionOrientations = opt.bestOrientations;
    fb.parMoves = opt.minMoves;
  }
  return fb;
};

export const scoreSolve = (
  moves: number,
  parMoves: number,
  seconds: number,
  usedHint: boolean
): SolveScore => {
  const safeMoves = Math.max(1, moves);
  const safeSeconds = Math.max(1, Math.floor(seconds));

  let stars: 1 | 2 | 3 = 1;
  if (!usedHint && safeMoves <= parMoves) {
    stars = 3;
  } else if (safeMoves <= parMoves + 3) {
    stars = 2;
  }

  const moveBonus = Math.max(0, (parMoves + 6 - safeMoves) * 80);
  const speedBonus = Math.max(0, (180 - Math.min(180, safeSeconds)) * 3);
  const hintPenalty = usedHint ? 150 : 0;
  const points = Math.max(100, 500 + moveBonus + speedBonus - hintPenalty);

  const rankLabel =
    stars === 3
      ? 'Prism Grandmaster'
      : stars === 2
        ? 'Optical Architect'
        : 'Beam Explorer';

  return { stars, points, rankLabel };
};

export const formatDuration = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
};

export const formatShareCard = (input: ShareCardInput): string => {
  const { puzzle, trace, moves, seconds, stars, streak, usedHint, username } =
    input;
  const starStr = '⭐'.repeat(stars);
  const hintTag = usedHint ? ' (💡1)' : '';
  const userTag = username && username !== 'anonymous' ? ` — u/${username}` : '';

  const rows: string[] = [];
  for (let r = 0; r < puzzle.gridSize; r++) {
    let line = '';
    for (let c = 0; c < puzzle.gridSize; c++) {
      const idx = r * puzzle.gridSize + c;
      const cell = puzzle.cells[idx];
      const illum = trace.illumination[idx] ?? { azure: false, solar: false };
      if (cell?.kind === 'beacon') {
        line += '🎯';
      } else if (cell?.kind === 'blocker') {
        line += '⬛';
      } else if (illum.azure && illum.solar) {
        line += '🟩';
      } else if (illum.azure) {
        line += '🟦';
      } else if (illum.solar) {
        line += '🟨';
      } else {
        line += '⬜';
      }
    }
    rows.push(line);
  }

  return [
    `⚡ **Prism Pulse #${puzzle.puzzleNumber}** (${puzzle.dateKey})${userTag}`,
    `${starStr} Moves: **${moves}/${puzzle.parMoves}**${hintTag} | Time: **${formatDuration(seconds)}** | Streak: 🔥 **${streak}**`,
    '',
    ...rows,
  ].join('\n');
};
