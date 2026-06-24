import { cardById } from "../battle/cardCatalog";
import { makeStartingDeck, type BattleCard } from "../battle/battleEngine";

export type PermanentLoadout = {
  deck: BattleCard[];
  bottledCard: BattleCard;
  bottleMaxCost: number;
  bottleUpgradeCount: number;
  removalPurchases: number;
  dungeonLevel: number;
  mendingHealing: number;
  mendingUpgradeCount: number;
  maxHealth: number;
  growPurchases: number;
  resourcefulnessUses: number;
  resourcefulnessUpgradeCount: number;
  heroicWillUses: number;
  heroicWillUpgradeCount: number;
};

const loadoutKey = "mathknight.permanentLoadout.v1";
const quartermasterVisitedKey = "mathknight.quartermaster.visited.v1";
const dungeonKey = "mathknight.dungeon.level1.v4";
const runDeckKey = "mathknight.dungeon.runDeck.v1";
const runHealthKey = "mathknight.dungeon.runHealth.v1";

function startingLoadout(): PermanentLoadout {
  const cards = makeStartingDeck();
  const bottledIndex = cards.findIndex((card) => card.label === "+");
  const [bottledCard] = cards.splice(bottledIndex, 1);
  return {
    deck: cards, bottledCard, bottleMaxCost: 1, bottleUpgradeCount: 0, removalPurchases: 0, dungeonLevel: 1,
    mendingHealing: 10, mendingUpgradeCount: 0, maxHealth: 40, growPurchases: 0,
    resourcefulnessUses: 1, resourcefulnessUpgradeCount: 0, heroicWillUses: 1, heroicWillUpgradeCount: 0,
  };
}

export function loadPermanentLoadout(): PermanentLoadout {
  try {
    const raw = window.localStorage.getItem(loadoutKey);
    if (!raw) {
      const initial = startingLoadout();
      savePermanentLoadout(initial);
      return initial;
    }
    const loadout = JSON.parse(raw) as PermanentLoadout;
    let savedDungeonLevel = 1;
    try {
      const dungeon = JSON.parse(window.localStorage.getItem(dungeonKey) ?? "null") as { level?: number } | null;
      savedDungeonLevel = dungeon?.level ?? 1;
    } catch {
      // A damaged dungeon map should not invalidate permanent upgrades.
    }
    const normalized = {
      ...loadout,
      resourcefulnessUses: loadout.resourcefulnessUses ?? 1,
      resourcefulnessUpgradeCount: loadout.resourcefulnessUpgradeCount ?? 0,
      heroicWillUses: loadout.heroicWillUses ?? 1,
      heroicWillUpgradeCount: loadout.heroicWillUpgradeCount ?? 0,
    };
    const reachedDungeonLevel = Math.max(normalized.dungeonLevel, savedDungeonLevel);
    if (reachedDungeonLevel !== normalized.dungeonLevel) {
      const migrated = { ...normalized, dungeonLevel: reachedDungeonLevel };
      savePermanentLoadout(migrated);
      return migrated;
    }
    return normalized;
  } catch {
    return startingLoadout();
  }
}

const characterStats = {
  1: { maxHealth: 40, energy: 3, handSize: 5 },
  2: { maxHealth: 60, energy: 4, handSize: 5 },
  3: { maxHealth: 100, energy: 5, handSize: 6 },
  4: { maxHealth: 160, energy: 6, handSize: 6 },
  5: { maxHealth: 250, energy: 7, handSize: 7 },
} as const;

export function characterStatsForLevel(level: number, loadout = loadPermanentLoadout()) {
  const base = characterStats[Math.max(1, Math.min(5, level)) as keyof typeof characterStats];
  return { ...base, maxHealth: base.maxHealth + loadout.growPurchases * 10 };
}

export function savePermanentLoadout(loadout: PermanentLoadout) {
  window.localStorage.setItem(loadoutKey, JSON.stringify(loadout));
}

export function markQuartermasterVisited() {
  window.localStorage.setItem(quartermasterVisitedKey, "true");
}

export function hasVisitedQuartermaster() {
  return window.localStorage.getItem(quartermasterVisitedKey) === "true";
}

export function printedEnergyCost(card: BattleCard, maxEnergy = 3) {
  const definition = cardById.get(card.catalogId);
  if (definition?.energyCost === "X") return maxEnergy;
  if (card.label === "L") return Math.ceil(loadPermanentLoadout().dungeonLevel / 10);
  return typeof definition?.energyCost === "number" ? definition.energyCost : card.energy;
}

export function syncRunDeck(transform: (deck: BattleCard[]) => BattleCard[]) {
  try {
    const raw = window.localStorage.getItem(runDeckKey);
    const deck = raw ? JSON.parse(raw) as BattleCard[] : loadPermanentLoadout().deck;
    window.localStorage.setItem(runDeckKey, JSON.stringify(transform(deck)));
  } catch {
    window.localStorage.setItem(runDeckKey, JSON.stringify(loadPermanentLoadout().deck));
  }
}

export function increaseRunHealth(amount: number, maxHealth: number) {
  const current = Number(window.localStorage.getItem(runHealthKey));
  const next = Math.min(maxHealth, (current > 0 ? current : maxHealth - amount) + amount);
  window.localStorage.setItem(runHealthKey, String(next));
}
