import type { LevelConfig, PuzzleCard, PuzzlePair, Stage } from "./types";
import { generateGeometryPuzzle } from "./geometryGenerator";
import { generateAlgebraPuzzle } from "./algebraGenerator";

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

function advancedLesson(level: LevelConfig) {
  return level.kind === "level3" || level.kind === "boss";
}

function withoutTinySingleDigits(range: [number, number], advanced: boolean): [number, number] {
  if (!advanced) return range;
  const [min, max] = range;
  if (max > 9) return range;
  return [Math.max(2, min), max];
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

type FractionForm = "mixed" | "unsimplified" | "simplified" | "percentage" | "decimal";
const fractionForms = new Set<FractionForm>(["mixed", "unsimplified", "simplified"]);
const commonDenominators = new Set([2, 3, 4, 5, 6, 8, 10, 12]);

function gcd(left: number, right: number): number {
  return right === 0 ? Math.abs(left) : gcd(right, left % right);
}

function fractionRanges(level: LevelConfig) {
  const stage = level.stage;
  const advanced = advancedLesson(level);
  const range = stageRanges[stage];
  const left = withoutTinySingleDigits(range.left, advanced);
  const right = withoutTinySingleDigits(range.right, advanced);
  const leftSize = left[1] - left[0];
  const rightSize = right[1] - right[0];
  if (right[1] > left[1] || rightSize > leftSize) return { numerator: right, denominator: left };
  return { numerator: left, denominator: right };
}

function conciseNumber(value: number) {
  return String(Number(value.toFixed(4)));
}

function makeFractionRepresentations(level: LevelConfig) {
  const ranges = fractionRanges(level);
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const numerator = randomInt(Math.max(1, ranges.numerator[0]), ranges.numerator[1]);
    const denominator = randomInt(Math.max(1, ranges.denominator[0]), ranges.denominator[1]);
    if (numerator <= denominator || numerator % denominator === 0) continue;
    const divisor = gcd(numerator, denominator);
    const reducedNumerator = numerator / divisor;
    const reducedDenominator = denominator / divisor;
    if (!commonDenominators.has(reducedDenominator)) continue;

    let unsimplified: string | undefined;
    if (divisor > 1) unsimplified = `${numerator}/${denominator}`;
    if (!unsimplified) {
      for (let scale = 2; scale <= 8; scale += 1) {
        const scaledNumerator = reducedNumerator * scale;
        const scaledDenominator = reducedDenominator * scale;
        if (scaledNumerator >= ranges.numerator[0] && scaledNumerator <= ranges.numerator[1] && scaledDenominator >= ranges.denominator[0] && scaledDenominator <= ranges.denominator[1]) {
          unsimplified = `${scaledNumerator}/${scaledDenominator}`;
          break;
        }
      }
    }

    const whole = Math.floor(reducedNumerator / reducedDenominator);
    const remainder = reducedNumerator % reducedDenominator;
    const value = reducedNumerator / reducedDenominator;
    return {
      value,
      labels: {
        mixed: `${whole} ${remainder}/${reducedDenominator}`,
        unsimplified,
        simplified: `${reducedNumerator}/${reducedDenominator}`,
        percentage: `${conciseNumber(value * 100)}%`,
        decimal: conciseNumber(value),
      } as Record<FractionForm, string | undefined>,
    };
  }
  throw new Error(`Could not generate a familiar fraction for ${level.id}.`);
}

function formPair(fractionCardCount: number): [FractionForm, FractionForm] {
  const choices: Record<number, Array<[FractionForm, FractionForm]>> = {
    0: [["percentage", "decimal"]],
    1: [["unsimplified", "percentage"], ["simplified", "percentage"], ["simplified", "decimal"]],
    2: [["mixed", "unsimplified"], ["mixed", "simplified"], ["unsimplified", "simplified"]],
  };
  return choices[fractionCardCount][randomInt(0, choices[fractionCardCount].length - 1)];
}

function generateFractionPuzzle(level: LevelConfig): PuzzleCard[] {
  const totalCards = level.pairs * 2;
  const targetFractionCards = randomInt(Math.ceil(totalCards * 0.5), Math.floor(totalCards * 0.75));
  const fractionCounts = Array.from({ length: level.pairs }, () => 0);
  for (let count = 0; count < targetFractionCards; count += 1) {
    const eligible = fractionCounts.map((value, index) => ({ value, index })).filter(({ value }) => value < 2);
    fractionCounts[eligible[randomInt(0, eligible.length - 1)].index] += 1;
  }

  const pairs: PuzzlePair[] = [];
  const usedValues = new Set<string>();
  for (let index = 0; index < level.pairs; index += 1) {
    let guard = 0;
    while (guard < 800) {
      const representation = makeFractionRepresentations(level);
      const valueKey = representation.value.toFixed(8);
      const [blueForm, greenForm] = formPair(fractionCounts[index]);
      const blue = representation.labels[blueForm];
      const green = representation.labels[greenForm];
      if (!usedValues.has(valueKey) && blue && green && blue !== green) {
        usedValues.add(valueKey);
        pairs.push({ id: `${level.id}_pair${index + 1}`, expression: blue, result: representation.value, resultLabel: green });
        break;
      }
      guard += 1;
    }
    if (pairs.length !== index + 1) throw new Error(`Could not generate fraction pair ${index + 1} for ${level.id}.`);
  }

  return shuffle(pairs.flatMap((pair) => [
    { id: `${pair.id}_expression`, pairId: pair.id, kind: "expression" as const, label: pair.expression, matched: false },
    { id: `${pair.id}_result`, pairId: pair.id, kind: "result" as const, label: pair.resultLabel ?? String(pair.result), matched: false },
  ]));
}

function makePair(level: LevelConfig, index: number): PuzzlePair {
  const range = stageRanges[level.stage];
  const advanced = advancedLesson(level);
  const leftRange = withoutTinySingleDigits(range.left, advanced);
  const subtractionLeftRange: [number, number] = level.unit === "subtraction" && level.stage === "1" && advanced
    ? [leftRange[0], Math.max(leftRange[1], level.pairs + 1)]
    : leftRange;
  let left = randomInt(...subtractionLeftRange);
  let right = randomInt(...withoutTinySingleDigits(range.right, advanced));
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

  if (level.unit === "division") {
    const divisor = Math.max(1, left);
    const quotient = right;
    left = divisor * quotient;
    right = divisor;
    result = quotient;
    symbol = "÷";
  }

  return {
    id: `${level.id}_pair${index}`,
    expression: `${left} ${symbol} ${right}`,
    result,
  };
}

export function generatePuzzle(level: LevelConfig): PuzzleCard[] {
  if (level.unit === "algebra") return generateAlgebraPuzzle(level);
  if (level.unit === "geometry") return generateGeometryPuzzle(level);
  if (level.unit === "fractions") return generateFractionPuzzle(level);
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
        label: pair.resultLabel ?? String(pair.result),
        matched: false,
      },
    ]),
  );
}
