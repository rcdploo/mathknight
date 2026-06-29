import type { LevelConfig, PuzzleCard, PuzzlePair } from "./types";

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(0, index);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function squareExpression(value: number) {
  return `${value}²`;
}

function sumExpression(values: number[]) {
  return values.map(squareExpression).join(" + ");
}

function cardsForPairs(level: LevelConfig, pairs: PuzzlePair[]) {
  return shuffle(pairs.flatMap((pair) => [
    { id: `${pair.id}_expression`, pairId: pair.id, kind: "expression" as const, label: pair.expression, matched: false },
    { id: `${pair.id}_result`, pairId: pair.id, kind: "result" as const, label: pair.resultLabel ?? String(pair.result), matched: false },
  ]));
}

function directSquarePairs(level: LevelConfig, min: number, max: number) {
  const bases = shuffle(Array.from({ length: max - min + 1 }, (_, index) => min + index)).slice(0, level.pairs);
  return bases.map((base, index) => ({
    id: `${level.id}_pair${index + 1}`,
    expression: squareExpression(base),
    result: base ** 2,
  }));
}

function twoSquarePairs(level: LevelConfig, operation: "sum" | "difference") {
  const candidates: Array<{ expression: string; result: number }> = [];
  for (let left = 2; left <= 25; left += 1) {
    for (let right = 2; right < left; right += 1) {
      candidates.push(operation === "sum"
        ? { expression: `${left}² + ${right}²`, result: left ** 2 + right ** 2 }
        : { expression: `${left}² − ${right}²`, result: left ** 2 - right ** 2 });
    }
  }

  const uniqueResults = new Map<number, { expression: string; result: number }>();
  shuffle(candidates).forEach((candidate) => {
    if (!uniqueResults.has(candidate.result)) uniqueResults.set(candidate.result, candidate);
  });
  return shuffle([...uniqueResults.values()]).slice(0, level.pairs).map((pair, index) => ({
    id: `${level.id}_pair${index + 1}`,
    ...pair,
  }));
}

function equivalentSumPairs(level: LevelConfig) {
  const representations = new Map<number, number[][]>();
  const addRepresentation = (values: number[]) => {
    const total = values.reduce((sum, value) => sum + value ** 2, 0);
    representations.set(total, [...(representations.get(total) ?? []), values]);
  };

  for (let first = 1; first <= 12; first += 1) {
    for (let second = first + 1; second <= 12; second += 1) {
      addRepresentation([first, second]);
      for (let third = second + 1; third <= 12; third += 1) addRepresentation([first, second, third]);
    }
  }

  const candidates = shuffle([...representations.entries()].filter(([, expressions]) => expressions.length >= 2));
  if (candidates.length < level.pairs) {
    throw new Error(`Could not generate ${level.pairs} equivalent perfect-square sums for ${level.id}.`);
  }

  return candidates.slice(0, level.pairs).map(([result, expressions], index) => {
    const [blue, green] = shuffle(expressions).slice(0, 2);
    return {
      id: `${level.id}_pair${index + 1}`,
      expression: sumExpression(blue),
      result,
      resultLabel: sumExpression(green),
    };
  });
}

export function generatePerfectSquaresPuzzle(level: LevelConfig): PuzzleCard[] {
  let pairs: PuzzlePair[];
  if (level.stage === "1") pairs = directSquarePairs(level, 0, 12);
  else if (level.stage === "2") pairs = directSquarePairs(level, 13, 25);
  else if (level.stage === "3a") pairs = twoSquarePairs(level, "sum");
  else if (level.stage === "3b") pairs = twoSquarePairs(level, "difference");
  else pairs = equivalentSumPairs(level);

  if (pairs.length !== level.pairs) throw new Error(`Could not generate ${level.pairs} perfect-square pairs for ${level.id}.`);
  return cardsForPairs(level, pairs);
}
