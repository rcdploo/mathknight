import type { LevelConfig, LevelResult, PlayerProgress, PuzzleProgress, RunDifficulty } from "./types";

const storageKey = "mathknight.memoryMatch.progress.v1";
const saveCodePrefix = "MK1";

export const defaultProgress: PlayerProgress = {
  schemaVersion: 1,
  coins: 0,
  settings: {
    muted: false,
    musicVolume: 0.7,
    effectsVolume: 0.8,
  },
  run: {
    difficulty: "normal",
    normalCompleted: false,
    trainingIncomeByLevel: {},
    deferredTrainingIncome: 0,
  },
  puzzles: {},
};

export function loadProgress(): PlayerProgress {
  const raw = readLocalProgress();
  if (!raw) return structuredClone(defaultProgress);

  try {
    const parsed = JSON.parse(raw) as PlayerProgress;
    if (parsed.schemaVersion !== 1) return structuredClone(defaultProgress);
    const legacyMuted = parsed.settings?.muted ?? false;
    return {
      ...parsed,
      settings: {
        muted: legacyMuted,
        musicVolume: parsed.settings?.musicVolume ?? (legacyMuted ? 0 : .7),
        effectsVolume: parsed.settings?.effectsVolume ?? (legacyMuted ? 0 : .8),
      },
      run: {
        difficulty: parsed.run?.difficulty ?? "normal",
        normalCompleted: parsed.run?.normalCompleted ?? false,
        trainingIncomeByLevel: parsed.run?.trainingIncomeByLevel ?? {},
        deferredTrainingIncome: parsed.run?.deferredTrainingIncome ?? 0,
      },
    };
  } catch {
    return structuredClone(defaultProgress);
  }
}

export function saveProgress(progress: PlayerProgress) {
  writeLocalProgress(progress);
}

export function localStorageAvailable() {
  try {
    const testKey = `${storageKey}.test`;
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function exportProgressCode(progress: PlayerProgress) {
  const json = JSON.stringify(progress);
  return `${saveCodePrefix}-${window.btoa(json)}`;
}

export function importProgressCode(code: string): PlayerProgress {
  const trimmed = code.trim();
  const payload = trimmed.startsWith(`${saveCodePrefix}-`) ? trimmed.slice(saveCodePrefix.length + 1) : trimmed;
  const parsed = JSON.parse(window.atob(payload)) as PlayerProgress;

  if (parsed.schemaVersion !== 1 || typeof parsed.coins !== "number" || !parsed.puzzles) {
    throw new Error("This save code is not a valid Mathknight save.");
  }

  saveProgress(parsed);
  return loadProgress();
}

function readLocalProgress() {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeLocalProgress(progress: PlayerProgress) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(progress));
  } catch {
    // Save codes still work when embedded browser storage is blocked.
  }
}

export function blankPuzzleProgress(): PuzzleProgress {
  return {
    completed: false,
    bestStars: 0,
    bestTurns: null,
    wins: 0,
    attempts: 0,
    lastPlayedAt: "",
  };
}

export function recordLevelResult(progress: PlayerProgress, level: LevelConfig, result: LevelResult): PlayerProgress {
  const current = progress.puzzles[level.id] ?? blankPuzzleProgress();
  const nextEntry: PuzzleProgress = {
    completed: current.completed || result.completed,
    bestStars: result.completed ? Math.max(current.bestStars, result.stars) : current.bestStars,
    bestTurns:
      result.completed && (current.bestTurns === null || result.turnsUsed < current.bestTurns)
        ? result.turnsUsed
        : current.bestTurns,
    wins: current.wins + (result.completed ? 1 : 0),
    attempts: current.attempts + 1,
    lastPlayedAt: new Date().toISOString(),
  };

  const next = {
    ...progress,
    coins: progress.coins + result.coinsEarned,
    puzzles: {
      ...progress.puzzles,
      [level.id]: nextEntry,
    },
  };
  saveProgress(next);
  return next;
}

export function recordTrainingResult(progress: PlayerProgress, level: LevelConfig, result: LevelResult, dungeonLevel: number) {
  if (progress.run.difficulty !== "impossible" || result.coinsEarned <= 0) {
    return { progress: recordLevelResult(progress, level, result), awarded: result.coinsEarned, deferred: 0 };
  }
  const levelKey = String(dungeonLevel);
  const earned = progress.run.trainingIncomeByLevel[levelKey] ?? 0;
  const cap = 1000 + 1000 * dungeonLevel;
  const awarded = Math.min(result.coinsEarned, Math.max(0, cap - earned));
  const deferred = result.coinsEarned - awarded;
  const adjustedResult = { ...result, coinsEarned: awarded };
  const recorded = recordLevelResult(progress, level, adjustedResult);
  const next = {
    ...recorded,
    run: {
      ...recorded.run,
      trainingIncomeByLevel: { ...recorded.run.trainingIncomeByLevel, [levelKey]: earned + awarded },
      deferredTrainingIncome: recorded.run.deferredTrainingIncome + deferred,
    },
  };
  saveProgress(next);
  return { progress: next, awarded, deferred };
}

export function releaseDeferredTrainingIncome(progress: PlayerProgress) {
  const amount = progress.run.deferredTrainingIncome;
  if (amount <= 0) return { progress, amount: 0 };
  const next = { ...progress, coins: progress.coins + amount, run: { ...progress.run, deferredTrainingIncome: 0 } };
  saveProgress(next);
  return { progress: next, amount };
}

export function markNormalCompleted(progress = loadProgress()) {
  if (progress.run.normalCompleted) return progress;
  const next = { ...progress, run: { ...progress.run, normalCompleted: true } };
  saveProgress(next);
  return next;
}

export function difficultyLabel(difficulty: RunDifficulty) {
  return difficulty[0].toUpperCase() + difficulty.slice(1);
}

export function setMuted(progress: PlayerProgress, muted: boolean) {
  return setAudioSettings(progress, { effectsVolume: muted ? 0 : .8 });
}

export function setAudioSettings(progress: PlayerProgress, changes: Partial<Pick<PlayerProgress["settings"], "musicVolume" | "effectsVolume">>) {
  const settings = { ...progress.settings, ...changes };
  settings.muted = settings.effectsVolume === 0;
  const next = { ...progress, settings };
  saveProgress(next);
  return next;
}
