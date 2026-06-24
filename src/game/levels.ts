import type { LevelConfig, LevelKind, Stage, Unit } from "./types";

export const units: Unit[] = ["addition", "subtraction", "multiplication", "division", "fractions", "geometry", "algebra"];
export const stages: Stage[] = ["1", "2", "3a", "3b", "4"];
export const levelKinds: LevelKind[] = ["level1", "level2", "level3", "boss"];

export const unitLabels: Record<Unit, string> = {
  addition: "Addition",
  subtraction: "Subtraction",
  multiplication: "Multiplication",
  division: "Division",
  fractions: "Fractions, Decimals & Percents",
  geometry: "2D Area & Perimeter",
  algebra: "Single-Variable Algebra",
};

export const stageLabels: Record<Stage, string> = {
  "1": "Trial 1",
  "2": "Trial 2",
  "3a": "Trial 3A",
  "3b": "Trial 3B",
  "4": "Trial 4",
};

export const levelLabels: Record<LevelKind, string> = {
  level1: "Lesson 1",
  level2: "Lesson 2",
  level3: "Lesson 3",
  boss: "Speed Challenge",
};

const levelShape: Record<LevelKind, Pick<LevelConfig, "pairs" | "rows" | "columns" | "maxTurns" | "isBoss">> = {
  level1: { pairs: 6, rows: 3, columns: 4, maxTurns: 15, isBoss: false },
  level2: { pairs: 8, rows: 4, columns: 4, maxTurns: 20, isBoss: false },
  level3: { pairs: 10, rows: 5, columns: 4, maxTurns: 25, isBoss: false },
  boss: { pairs: 8, rows: 4, columns: 4, maxTurns: null, isBoss: true },
};

export function getLevelId(unit: Unit, stage: Stage, kind: LevelKind) {
  return `${unit}_stage${stage}_${kind}`;
}

export function makeLevelConfig(unit: Unit, stage: Stage, kind: LevelKind): LevelConfig {
  return {
    id: getLevelId(unit, stage, kind),
    unit,
    stage,
    kind,
    ...levelShape[kind],
  };
}

export function allLevels() {
  return units.flatMap((unit) =>
    stages.flatMap((stage) => levelKinds.map((kind) => makeLevelConfig(unit, stage, kind))),
  );
}
