export type RunStats = {
  monstersSlain: number;
  damageDealt: number;
  attacksCountered: number;
  mathBroken: boolean;
};

const runStatsStorageKey = "mathknight.dungeon.runStats.v1";
const defaultRunStats: RunStats = { monstersSlain: 0, damageDealt: 0, attacksCountered: 0, mathBroken: false };

export function loadRunStats(): RunStats {
  try {
    const saved = JSON.parse(window.localStorage.getItem(runStatsStorageKey) ?? "null") as Partial<RunStats> | null;
    return saved ? { ...defaultRunStats, ...saved } : { ...defaultRunStats };
  } catch {
    return { ...defaultRunStats };
  }
}

function saveRunStats(stats: RunStats) {
  window.localStorage.setItem(runStatsStorageKey, JSON.stringify(stats));
}

export function recordAttackResult(damage: number, countered: boolean) {
  const current = loadRunStats();
  saveRunStats({
    ...current,
    damageDealt: Number.isFinite(damage) ? current.damageDealt + Math.max(0, damage) : current.damageDealt,
    attacksCountered: current.attacksCountered + (countered ? 1 : 0),
    mathBroken: current.mathBroken || !Number.isFinite(damage),
  });
}

export function recordMonsterSlain() {
  const current = loadRunStats();
  saveRunStats({ ...current, monstersSlain: current.monstersSlain + 1 });
}
