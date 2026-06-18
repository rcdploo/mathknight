import { getLevelId, levelKinds, makeLevelConfig, stages, units } from "./levels";
import type { LevelConfig, LevelKind, PlayerProgress, Stage } from "./types";

function isCompleted(progress: PlayerProgress, id: string) {
  return progress.puzzles[id]?.completed ?? false;
}

function stageAvailable(progress: PlayerProgress, stage: Stage) {
  if (stage === "1" || stage === "2") return true;

  const anyStage2Boss = units.some((unit) => isCompleted(progress, getLevelId(unit, "2", "boss")));
  if (stage === "3a" || stage === "3b") return anyStage2Boss;

  return units.some(
    (unit) => isCompleted(progress, getLevelId(unit, "3a", "boss")) || isCompleted(progress, getLevelId(unit, "3b", "boss")),
  );
}

function samePathUnlocked(progress: PlayerProgress, level: LevelConfig) {
  if (level.kind === "level1") return true;
  if (level.kind === "level2") return isCompleted(progress, getLevelId(level.unit, level.stage, "level1")) || globalKindUnlocked(progress, "level2");
  if (level.kind === "level3") return isCompleted(progress, getLevelId(level.unit, level.stage, "level2")) || globalKindUnlocked(progress, "level3");
  return isCompleted(progress, getLevelId(level.unit, level.stage, "level3"));
}

function globalKindUnlocked(progress: PlayerProgress, kind: Extract<LevelKind, "level2" | "level3">) {
  const prerequisite = kind === "level2" ? "level2" : "level3";
  return units.some((unit) =>
    stages.some((stage) => stageAvailable(progress, stage) && isCompleted(progress, getLevelId(unit, stage, prerequisite))),
  );
}

export function isLevelUnlocked(progress: PlayerProgress, level: LevelConfig) {
  return stageAvailable(progress, level.stage) && samePathUnlocked(progress, level);
}

export function findNextUnlocked(progress: PlayerProgress, current: LevelConfig) {
  const currentKindIndex = levelKinds.indexOf(current.kind);
  const candidates = [
    ...levelKinds.slice(currentKindIndex + 1).map((kind) => makeLevelConfig(current.unit, current.stage, kind)),
    ...stages.flatMap((stage) =>
      units.flatMap((unit) => levelKinds.map((kind) => makeLevelConfig(unit, stage, kind))),
    ),
  ];

  return candidates.find((level) => !isCompleted(progress, level.id) && isLevelUnlocked(progress, level));
}
