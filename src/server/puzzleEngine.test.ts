import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMinMovesToSolution,
  formatShareCard,
  generateDailyPuzzle,
  rotateOrientation,
  scoreSolve,
  tracePuzzle,
} from '../shared/puzzle.ts';
import {
  computeUpdatedStats,
  encodeAscendingRankScore,
} from './streakLogic.ts';

describe('Prism Pulse Daily Engine & Streak Logic', () => {
  it('generates deterministic puzzles for the same UTC date and distinct puzzles across dates', () => {
    const p1 = generateDailyPuzzle('2026-11-28');
    const p2 = generateDailyPuzzle('2026-11-28');
    const p3 = generateDailyPuzzle('2026-11-29');

    assert.deepEqual(p1, p2);
    assert.notDeepEqual(p1.cells, p3.cells);
    assert.equal(p1.gridSize, 5);
    assert.ok(p1.puzzleNumber >= 1);
    assert.equal(p3.puzzleNumber, p1.puzzleNumber + 1);
  });

  it('guarantees every daily puzzle across a 60-day window starts unsolved and solves cleanly at solutionOrientations', () => {
    for (let day = 1; day <= 30; day++) {
      const novDate = `2026-11-${String(day).padStart(2, '0')}`;
      const decDate = `2026-12-${String(day).padStart(2, '0')}`;
      for (const dateKey of [novDate, decDate]) {
        const puzzle = generateDailyPuzzle(dateKey);

        const beacons = puzzle.cells.filter((c) => c.kind === 'beacon');
        assert.ok(
          beacons.length >= 3,
          `Expected >= 3 beacons for ${dateKey}, got ${beacons.length}`
        );

        const initialTrace = tracePuzzle(puzzle, puzzle.initialOrientations);
        assert.equal(
          initialTrace.allTargetsSatisfied,
          false,
          `Puzzle ${dateKey} should not start already solved`
        );

        const solvedTrace = tracePuzzle(puzzle, puzzle.solutionOrientations);
        assert.equal(
          solvedTrace.allTargetsSatisfied,
          true,
          `Puzzle ${dateKey} must be 100% solvable at solutionOrientations`
        );
        assert.equal(solvedTrace.satisfiedTargets, solvedTrace.totalTargets);

        const exactDist = computeMinMovesToSolution(
          puzzle,
          puzzle.initialOrientations
        );
        assert.equal(puzzle.parMoves, exactDist);
        assert.ok(
          puzzle.parMoves >= 3,
          `Expected parMoves >= 3 for ${dateKey}, got ${puzzle.parMoves}`
        );
      }
    }
  });

  it('terminates cleanly without infinite loops even on closed optical splitter loops', () => {
    const base = generateDailyPuzzle('2026-11-28');
    const loopCells = base.cells.map((cell, idx) => {
      const r = Math.floor(idx / 5);
      const c = idx % 5;
      if ((r === 1 || r === 3) && (c === 1 || c === 3)) {
        return { ...cell, kind: 'splitter' as const };
      }
      return cell;
    });
    const loopPuzzle = {
      ...base,
      cells: loopCells,
    };
    const trace = tracePuzzle(loopPuzzle, new Array<number>(25).fill(0));
    assert.ok(Array.isArray(trace.segments));
    assert.ok(trace.segments.length < 400);
  });

  it('rotates tiles modulo their optical symmetry period and awards accurate stars + spoiler-free share card', () => {
    assert.equal(rotateOrientation('mirror', 0), 1);
    assert.equal(rotateOrientation('mirror', 1), 0);
    assert.equal(rotateOrientation('prism', 1), 0);
    assert.equal(rotateOrientation('splitter', 3), 0);

    const puzzle = generateDailyPuzzle('2026-11-28');
    const solvedTrace = tracePuzzle(puzzle, puzzle.solutionOrientations);

    const perfect = scoreSolve(puzzle.parMoves, puzzle.parMoves, 35, false);
    assert.equal(perfect.stars, 3);

    const hinted = scoreSolve(puzzle.parMoves, puzzle.parMoves, 35, true);
    assert.equal(hinted.stars, 2);

    const overPar = scoreSolve(puzzle.parMoves + 5, puzzle.parMoves, 90, false);
    assert.equal(overPar.stars, 1);

    const card = formatShareCard({
      puzzle,
      trace: solvedTrace,
      moves: puzzle.parMoves,
      seconds: 42,
      stars: 3,
      streak: 4,
      usedHint: false,
      username: 'huyvv533',
    });
    assert.ok(card.includes(`Prism Pulse #${puzzle.puzzleNumber}`));
    assert.ok(card.includes('u/huyvv533'));
    const gridLines = card.split('\n').slice(-5);
    assert.equal(gridLines.length, 5);
    for (const row of gridLines) {
      assert.ok(!row.includes('/'));
      assert.ok(!row.includes('\\'));
    }
  });

  it('tracks consecutive daily streaks, resets broken streaks, and orders leaderboard scores accurately', () => {
    const empty = {
      currentStreak: 0,
      bestStreak: 0,
      totalSolved: 0,
      perfectRuns: 0,
      lastSolvedDate: null,
    };
    const day1 = computeUpdatedStats(
      empty,
      '2026-11-27',
      '2026-11-27',
      3,
      false
    );
    assert.equal(day1.currentStreak, 1);
    assert.equal(day1.perfectRuns, 1);

    const day2 = computeUpdatedStats(
      day1,
      '2026-11-28',
      '2026-11-28',
      2,
      false
    );
    assert.equal(day2.currentStreak, 2);
    assert.equal(day2.bestStreak, 2);

    // Archive solve does not break or double-increment today's streak
    const archive = computeUpdatedStats(
      day2,
      '2026-11-25',
      '2026-11-28',
      3,
      false
    );
    assert.equal(archive.currentStreak, 2);
    assert.equal(archive.totalSolved, 3);

    // Skipped a day -> streak resets to 1, bestStreak stays 2
    const broken = computeUpdatedStats(
      archive,
      '2026-11-30',
      '2026-11-30',
      3,
      false
    );
    assert.equal(broken.currentStreak, 1);
    assert.equal(broken.bestStreak, 2);

    const fastPar = encodeAscendingRankScore(1200, 5, 25);
    const slowPar = encodeAscendingRankScore(1150, 5, 60);
    assert.ok(fastPar < slowPar);
  });
});
