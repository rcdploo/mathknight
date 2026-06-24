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
};

const loadoutKey = "mathknight.permanentLoadout.v1";
const runDeckKey = "mathknight.dungeon.runDeck.v1";
const runHealthKey = "mathknight.dungeon.runHealth.v1";

function startingLoadout(): PermanentLoadout {
  const cards = makeStartingDeck();
  const bottledIndex = cards.findIndex((card) => card.label === "+");
  const [bottledCard] = cards.splice(bottledIndex, 1);
  return {
    deck: cards, bottledCard, bottleMaxCost: 1, bottleUpgradeCount: 0, removalPurchases: 0, dungeonLevel: 1,
    mendingHealing: 10, mendingUpgradeCount: 0, maxHealth: 40, growPurchases: 0,
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
    return JSON.parse(raw) as PermanentLoadout;
  } catch {
    return startingLoadout();
  }
}

export function savePermanentLoadout(loadout: PermanentLoadout) {
  window.localStorage.setItem(loadoutKey, JSON.stringify(loadout));
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
