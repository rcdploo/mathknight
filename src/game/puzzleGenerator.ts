import type { LevelConfig, PuzzleCard, PuzzlePair, Stage } from "./types";

type Range = { left: [number, number]; right: [number, number] };

const stageRanges: Record<Stage, Range> = {
  "1": { left: [0, 9], right: [0, 9] },
  "2": { left: [0, 9], right: [10, 19] },
  "3a": { left: [10, 19], right: [10, 19] },
  "3b": { left: [1, 9], right: [20, 99] },
  "4": { left: [10, 19], right: [20, 99] },
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function makePair(level: LevelConfig, index: number): PuzzlePair {
  const range = stageRanges[level.stage];
  let left = randomInt(...range.left);
  let right = randomInt(...range.right);
  let result = 0;
  let symbol = "+";

  if (level.unit === "addition") {
    result = left + right;
    symbol = "+";
  }

  if (level.unit === "subtraction") {
    if (right > left) [left, right] = [right, left];
    result = left - right;
    symbol = "-";
  }

  if (level.unit === "multiplication") {
    result = left * right;
    symbol = "x";
  }

  return {
    id: `${level.id}_pair${index}`,
    expression: `${left} ${symbol} ${right}`,
    result,
  };
}

export function generatePuzzle(level: LevelConfig): PuzzleCard[] {
  const pairsByResult = new Map<number, PuzzlePair>();
  let guard = 0;

  while (pairsByResult.size < level.pairs && guard < 500) {
    const pair = makePair(level, pairsByResult.size + 1);
    if (!pairsByResult.has(pair.result)) pairsByResult.set(pair.result, pair);
    guard += 1;
  }

  if (pairsByResult.size < level.pairs) {
    throw new Error(`Could not generate ${level.pairs} unique result values for ${level.id}.`);
  }

  const pairs = Array.from(pairsByResult.values());
  return shuffle(
    pairs.flatMap((pair) => [
      {
        id: `${pair.id}_expression`,
        pairId: pair.id,
        kind: "expression" as const,
        label: pair.expression,
        matched: false,
      },
      {
        id: `${pair.id}_result`,
        pairId: pair.id,
        kind: "result" as const,
        label: String(pair.result),
        matched: false,
      },
    ]),
  );
}
