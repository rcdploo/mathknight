import type { LevelConfig, LevelKind, Stage, Unit } from "./types";

const unitValues: Record<Unit, number> = {
  addition: 1,
  subtraction: 1,
  multiplication: 2,
  division: 2,
  geometry: 3,
  fractions: 3,
  perfectSquares: 4,
  algebra: 4,
};

const unitPayoutFactors: Record<Unit, number> = {
  addition: 5,
  subtraction: 6,
  multiplication: 8,
  division: 9,
  geometry: 11,
  fractions: 12,
  perfectSquares: 14,
  algebra: 15,
};

export function getUnitValue(unit: Unit) {
  return unitValues[unit];
}

const stageValues: Record<Stage, number> = {
  "1": 1,
  "2": 2,
  "3a": 3,
  "3b": 4,
  "4": 5,
};

const levelValues: Record<LevelKind, number> = {
  level1: 1,
  level2: 2,
  level3: 3,
  boss: 4,
};

export function calculateStars(pairs: number, turnsUsed: number, levelKind?: LevelKind) {
  if (levelKind === "boss") {
    if (turnsUsed <= 8) return 5;
    if (turnsUsed <= 9) return 4;
    if (turnsUsed <= 11) return 3;
    if (turnsUsed <= 14) return 2;
    return 1;
  }

  const thresholds = [
    { stars: 5, limit: Math.floor(1.5 * pairs) },
    { stars: 4, limit: Math.floor(1.75 * pairs) },
    { stars: 3, limit: Math.floor(2 * pairs) },
    { stars: 2, limit: Math.floor(2.25 * pairs) },
    { stars: 1, limit: Math.floor(2.5 * pairs) },
  ];

  return thresholds.find((threshold) => turnsUsed <= threshold.limit)?.stars ?? 1;
}

export function calculateCoins(level: LevelConfig, stars: number, winCountIncludingCurrent: number) {
  const base = unitPayoutFactors[level.unit] * levelValues[level.kind] * stageValues[level.stage] * stars;
  const previousWins = Math.max(0, winCountIncludingCurrent - 1);
  return 5 + Math.floor(base / 2 ** previousWins);
}
