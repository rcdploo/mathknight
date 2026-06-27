import { defaultProgress, loadProgress, saveProgress } from "./progressStore";
import type { RunDifficulty } from "./types";

export function resetAllGameProgress(difficulty: RunDifficulty) {
  const previous = loadProgress();
  const mathknightKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("mathknight.")) mathknightKeys.push(key);
  }
  mathknightKeys.forEach((key) => window.localStorage.removeItem(key));
  saveProgress({
    ...structuredClone(defaultProgress),
    settings: previous.settings,
    puzzles: difficulty === "normal" ? {} : previous.puzzles,
    run: {
      difficulty,
      normalCompleted: previous.run.normalCompleted,
      trainingIncomeByLevel: difficulty === "normal" ? {} : previous.run.trainingIncomeByLevel,
      deferredTrainingIncome: difficulty === "normal" ? 0 : previous.run.deferredTrainingIncome,
    },
  });
}
