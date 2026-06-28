import type { LevelConfig, LevelKind, Stage, Unit } from "./types";

const unitValues: Record<Unit, number> = {
  addition: 1,
  subtraction: 2,
  multiplication: 3,
  division: 4,
  fractions: 5,
  geometry: 5,
  algebra: 6,
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
  const base = (3 + 2 * unitValues[level.unit]) * levelValues[level.kind] * stageValues[level.stage] * stars;
  const previousWins = Math.max(0, winCountIncludingCurrent - 1);
  return Math.floor(base / 2 ** previousWins);
}
