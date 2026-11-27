import { reddit } from '@devvit/web/server';
import { generateDailyPuzzle, getUtcDateKey } from '../../shared/puzzle';

export const createPost = async () => {
  const today = getUtcDateKey();
  const puzzle = generateDailyPuzzle(today);
  return await reddit.submitCustomPost({
    title: `⚡ Prism Pulse #${puzzle.puzzleNumber} (${today}) — Can You Hit Par ${puzzle.parMoves}?`,
  });
};
