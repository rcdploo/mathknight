import type { LevelConfig, LevelResult, PlayerProgress, PuzzleProgress } from "./types";

const storageKey = "mathknight.memoryMatch.progress.v1";
const saveCodePrefix = "MK1";

export const defaultProgress: PlayerProgress = {
  schemaVersion: 1,
  coins: 0,
  settings: {
    muted: false,
  },
  puzzles: {},
};

export function loadProgress(): PlayerProgress {
  const raw = readLocalProgress();
  if (!raw) return structuredClone(defaultProgress);

  try {
    const parsed = JSON.parse(raw) as PlayerProgress;
    if (parsed.schemaVersion !== 1) return structuredClone(defaultProgress);
    return {
      ...defaultProgress,
      ...parsed,
      settings: { ...defaultProgress.settings, ...parsed.settings },
      puzzles: parsed.puzzles ?? {},
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

  const next = {
    ...defaultProgress,
    ...parsed,
    settings: { ...defaultProgress.settings, ...parsed.settings },
    puzzles: parsed.puzzles,
  };
  saveProgress(next);
  return next;
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

export function setMuted(progress: PlayerProgress, muted: boolean) {
  const next = { ...progress, settings: { ...progress.settings, muted } };
  saveProgress(next);
  return next;
}

export function resetProgress() {
  const next = structuredClone(defaultProgress);
  saveProgress(next);
  return next;
}
