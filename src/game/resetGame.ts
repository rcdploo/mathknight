import { defaultProgress, loadProgress, saveProgress } from "./progressStore";
import type { RunDifficulty } from "./types";

export function resetAllGameProgress(difficulty: RunDifficulty) {
  const previous = loadProgress();
  const preservedInstructions: Array<[string, string]> = [];
  const mathknightKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("mathknight.")) {
      mathknightKeys.push(key);
      if (key.startsWith("mathknight.instructions.seen.")) {
        const value = window.localStorage.getItem(key);
        if (value !== null) preservedInstructions.push([key, value]);
      }
    }
  }
  mathknightKeys.forEach((key) => window.localStorage.removeItem(key));
  preservedInstructions.forEach(([key, value]) => window.localStorage.setItem(key, value));
  saveProgress({
    ...structuredClone(defaultProgress),
    settings: previous.settings,
    puzzles: {},
    run: {
      difficulty,
      normalCompleted: previous.run.normalCompleted,
      trainingIncomeByLevel: {},
      deferredTrainingIncome: 0,
    },
  });
}
