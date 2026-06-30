import type { LevelConfig, LevelResult, PlayerProgress, PuzzleProgress, RunDifficulty, TrainingSpeed } from "./types";

const storageKey = "mathknight.memoryMatch.progress.v1";
const saveCodePrefix = "MK2";

type FullGameSave = {
  version: 2;
  entries: Record<string, string>;
};

export const defaultProgress: PlayerProgress = {
  schemaVersion: 1,
  coins: 0,
  settings: {
    muted: false,
    musicVolume: 0.7,
    effectsVolume: 0.8,
    trainingSpeed: "varies",
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
    if (!isCurrentProgress(parsed)) return structuredClone(defaultProgress);
    const trainingSpeed = ["slowest", "slow", "varies", "fast", "fastest"].includes(parsed.settings.trainingSpeed)
      ? parsed.settings.trainingSpeed
      : "varies";
    return { ...parsed, settings: { ...parsed.settings, trainingSpeed } };
  } catch {
    return structuredClone(defaultProgress);
  }
}

function isCurrentProgress(progress: PlayerProgress) {
  return progress?.schemaVersion === 1
    && typeof progress.coins === "number"
    && typeof progress.settings?.muted === "boolean"
    && typeof progress.settings?.musicVolume === "number"
    && typeof progress.settings?.effectsVolume === "number"
    && ["normal", "elite", "impossible"].includes(progress.run?.difficulty)
    && typeof progress.run?.normalCompleted === "boolean"
    && typeof progress.run?.trainingIncomeByLevel === "object"
    && typeof progress.run?.deferredTrainingIncome === "number"
    && typeof progress.puzzles === "object";
}

export function saveProgress(progress: PlayerProgress) {
  writeLocalProgress(progress);
}

export function exportProgressCode(_progress: PlayerProgress = loadProgress()) {
  const entries: Record<string, string> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith("mathknight.") || key.endsWith(".test")) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  const save: FullGameSave = { version: 2, entries };
  return `${saveCodePrefix}-${encodeSavePayload(JSON.stringify(save))}`;
}

export function importProgressCode(code: string): PlayerProgress {
  const trimmed = code.trim();
  if (trimmed.startsWith(`${saveCodePrefix}-`)) {
    const parsed = JSON.parse(decodeSavePayload(trimmed.slice(saveCodePrefix.length + 1))) as FullGameSave;
    if (parsed.version !== 2 || !parsed.entries || Object.entries(parsed.entries).some(([key, value]) => !key.startsWith("mathknight.") || typeof value !== "string")) {
      throw new Error("This save code is not a valid Mathknight save.");
    }
    const currentKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("mathknight.")) currentKeys.push(key);
    }
    currentKeys.forEach((key) => window.localStorage.removeItem(key));
    Object.entries(parsed.entries).forEach(([key, value]) => window.localStorage.setItem(key, value));
    return loadProgress();
  }

  throw new Error("This save code is not a valid Mathknight save.");
}

function encodeSavePayload(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary);
}

function decodeSavePayload(value: string) {
  const binary = window.atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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

export function setTrainingSpeed(progress: PlayerProgress, trainingSpeed: TrainingSpeed) {
  const next = { ...progress, settings: { ...progress.settings, trainingSpeed } };
  saveProgress(next);
  return next;
}
