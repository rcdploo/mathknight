import { getLevelId, levelKinds, makeLevelConfig, stages, units } from "./levels";
import type { LevelConfig, PlayerProgress, Stage, Unit } from "./types";

export type UnlockState = {
  unlocked: boolean;
  reason?: string;
};

const unitStarRequirements: Partial<Record<Unit, number>> = {
  division: 30,
  fractions: 50,
  geometry: 50,
  algebra: 75,
};

function isCompleted(progress: PlayerProgress, id: string) {
  return progress.puzzles[id]?.completed ?? false;
}

function levelStars(progress: PlayerProgress, id: string) {
  return progress.puzzles[id]?.bestStars ?? 0;
}

export function totalStars(progress: PlayerProgress) {
  return Object.values(progress.puzzles).reduce((total, puzzle) => total + puzzle.bestStars, 0);
}

function starsForUnits(progress: PlayerProgress, includedUnits: Unit[]) {
  const included = new Set(includedUnits);
  return Object.entries(progress.puzzles).reduce((total, [id, puzzle]) => {
    const unit = units.find((candidate) => id.startsWith(`${candidate}_stage`));
    return unit && included.has(unit) ? total + puzzle.bestStars : total;
  }, 0);
}

function starsForStages(progress: PlayerProgress, unit: Unit, includedStages: Stage[]) {
  return includedStages.reduce(
    (total, stage) =>
      total + levelKinds.reduce((stageTotal, kind) => stageTotal + levelStars(progress, getLevelId(unit, stage, kind)), 0),
    0,
  );
}

const earlyTrialDungeonGateExemptUnits: Unit[] = ["addition", "subtraction", "multiplication"];
const fullyDungeonGatedTrial4Units: Unit[] = ["multiplication", "division", "fractions", "algebra"];

function requiresDungeonLevel3(level: LevelConfig) {
  if (level.stage === "4" && fullyDungeonGatedTrial4Units.includes(level.unit)) return true;

  if (
    (level.stage === "1" || level.stage === "2")
    && earlyTrialDungeonGateExemptUnits.includes(level.unit)
  ) {
    return false;
  }

  return level.kind === "level3" || level.kind === "boss";
}

export function getUnitUnlockState(progress: PlayerProgress, unit: Unit): UnlockState {
  const requirement = unitStarRequirements[unit];
  if (!requirement) return { unlocked: true };

  const unitIndex = units.indexOf(unit);
  const earned = starsForUnits(progress, units.slice(0, unitIndex));
  return earned >= requirement
    ? { unlocked: true }
    : { unlocked: false, reason: `${requirement} Stars` };
}

export function getStageUnlockState(progress: PlayerProgress, unit: Unit, stage: Stage): UnlockState {
  if (unit === "perfectSquares") return { unlocked: true };
  if (stage === "1" || stage === "2") return { unlocked: true };

  const requirement = stage === "4" ? 15 : 7;
  const includedStages: Stage[] = stage === "4" ? ["1", "2", "3a", "3b"] : ["1", "2"];
  const earned = starsForStages(progress, unit, includedStages);
  return earned >= requirement
    ? { unlocked: true }
    : { unlocked: false, reason: `${requirement} Stars` };
}

function lessonUnlockState(progress: PlayerProgress, level: LevelConfig, dungeonLevel: number): UnlockState {
  if (level.kind === "level1") {
    return requiresDungeonLevel3(level) && dungeonLevel < 3
      ? { unlocked: false, reason: "Requires Dungeon Level 3" }
      : { unlocked: true };
  }
  if (level.kind === "level2") {
    if (!isCompleted(progress, getLevelId(level.unit, level.stage, "level1"))) {
      return { unlocked: false, reason: "Requires completing Lesson 1" };
    }
    return requiresDungeonLevel3(level) && dungeonLevel < 3
      ? { unlocked: false, reason: "Requires Dungeon Level 3" }
      : { unlocked: true };
  }
  if (level.kind === "level3") {
    if (!isCompleted(progress, getLevelId(level.unit, level.stage, "level2"))) {
      return { unlocked: false, reason: "Requires completing Lesson 2" };
    }
    return requiresDungeonLevel3(level) && dungeonLevel < 3
      ? { unlocked: false, reason: "Requires Dungeon Level 3" }
      : { unlocked: true };
  }
  if (!isCompleted(progress, getLevelId(level.unit, level.stage, "level3"))) {
    return { unlocked: false, reason: "Requires completing Lesson 3" };
  }
  return requiresDungeonLevel3(level) && dungeonLevel < 3
    ? { unlocked: false, reason: "Requires Dungeon Level 3" }
    : { unlocked: true };
}

export function getLevelUnlockState(progress: PlayerProgress, level: LevelConfig, dungeonLevel: number): UnlockState {
  if (level.unit === "perfectSquares") return { unlocked: true };

  const unitState = getUnitUnlockState(progress, level.unit);
  if (!unitState.unlocked) return unitState;

  const stageState = getStageUnlockState(progress, level.unit, level.stage);
  if (!stageState.unlocked) return stageState;

  return lessonUnlockState(progress, level, dungeonLevel);
}

export function isLevelUnlocked(progress: PlayerProgress, level: LevelConfig, dungeonLevel = 1) {
  return getLevelUnlockState(progress, level, dungeonLevel).unlocked;
}

export function findNextUnlocked(progress: PlayerProgress, current: LevelConfig, dungeonLevel = 1) {
  const currentUnitIndex = units.indexOf(current.unit);
  const candidates = units.slice(currentUnitIndex).flatMap((unit) =>
    stages.flatMap((stage) =>
      levelKinds.map((kind) => makeLevelConfig(unit, stage, kind)),
    ),
  );

  return candidates.find((level) => !isCompleted(progress, level.id) && isLevelUnlocked(progress, level, dungeonLevel));
}
