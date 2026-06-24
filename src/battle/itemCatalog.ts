import source from "./Items.csv?raw";
import { applyCardUpgrade, canApplyUpgrade, makeCatalogEntry, shuffle, type BattleCard } from "./battleEngine";
import { cardsEligibleForRewards } from "./cardCatalog";

export type ItemRarity = "Common" | "Uncommon" | "Rare";
export type ItemDefinition = {
  id: string;
  name: string;
  rarity: ItemRarity;
  tags: string[];
  cost: number;
  effect: string;
};

const itemKey = "mathknight.dungeon.runItems.v1";
const usageKey = "mathknight.dungeon.itemUsage.v1";
const runDeckKey = "mathknight.dungeon.runDeck.v1";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function idFor(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const itemCatalog: ItemDefinition[] = parseCsv(source).slice(1).map(([name, rarity, tags, cost, effect]) => ({
  id: idFor(name),
  name,
  rarity: rarity as ItemRarity,
  tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
  cost: Number(cost),
  effect,
}));

export const itemById = new Map(itemCatalog.map((item) => [item.id, item]));

export function loadRunItems() {
  try {
    const ids = JSON.parse(window.localStorage.getItem(itemKey) ?? "[]") as string[];
    return ids.filter((id) => itemById.has(id));
  } catch {
    return [];
  }
}

export function saveRunItems(ids: string[]) {
  window.localStorage.setItem(itemKey, JSON.stringify([...new Set(ids)]));
}

export function addRunItem(id: string) {
  const next = [...new Set([...loadRunItems(), id])];
  saveRunItems(next);
  applyAcquisitionBonus(id);
  return next;
}

export function resetRunItems() {
  saveRunItems([]);
}

type ItemUsage = { items: Record<string, number>; tags: Record<string, number> };

function loadUsage(): ItemUsage {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(usageKey) ?? "{}") as Partial<ItemUsage>;
    return { items: parsed.items ?? {}, tags: parsed.tags ?? {} };
  } catch {
    return { items: {}, tags: {} };
  }
}

function saveUsage(usage: ItemUsage) {
  window.localStorage.setItem(usageKey, JSON.stringify(usage));
}

export function surfaceItems(count: number, excludeOwned = true) {
  const usage = loadUsage();
  const owned = new Set(loadRunItems());
  const pool = itemCatalog.filter((item) => !excludeOwned || !owned.has(item.id));
  const selected: ItemDefinition[] = [];
  const rarityWeight: Record<ItemRarity, number> = { Common: 10, Uncommon: 4, Rare: 1.5 };

  while (selected.length < count && selected.length < pool.length) {
    const candidates = pool.filter((item) => !selected.some((chosen) => chosen.id === item.id));
    const weights = candidates.map((item) => {
      const tagPenalty = item.tags.reduce((sum, tag) => sum + (usage.tags[tag] ?? 0), 0);
      return rarityWeight[item.rarity] / (1 + (usage.items[item.id] ?? 0) * 2 + tagPenalty * 0.65);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = Math.random() * total;
    let picked = candidates[candidates.length - 1];
    for (let index = 0; index < candidates.length; index += 1) {
      roll -= weights[index];
      if (roll <= 0) {
        picked = candidates[index];
        break;
      }
    }
    selected.push(picked);
    usage.items[picked.id] = (usage.items[picked.id] ?? 0) + 1;
    picked.tags.forEach((tag) => {
      usage.tags[tag] = (usage.tags[tag] ?? 0) + 1;
    });
  }
  saveUsage(usage);
  return selected;
}

export function hasItem(items: string[], id: string) {
  return items.includes(id);
}

export function itemSymbol(item: ItemDefinition) {
  return item.name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function loadDeck() {
  try {
    return JSON.parse(window.localStorage.getItem(runDeckKey) ?? "[]") as BattleCard[];
  } catch {
    return [];
  }
}

function saveDeck(deck: BattleCard[]) {
  window.localStorage.setItem(runDeckKey, JSON.stringify(deck));
}

function applyAcquisitionBonus(id: string) {
  if (id === "grab-bag") {
    const cards = shuffle(cardsEligibleForRewards()).slice(0, 3).map((definition) => makeCatalogEntry(definition.name));
    saveDeck([...loadDeck(), ...cards]);
  }
  if (id === "whetstone") {
    let deck = loadDeck();
    const upgrades = shuffle(["armor", "weaken", "bash", "crit", "reflecting", "efficiency"]);
    for (const upgrade of upgrades) {
      const target = shuffle(deck.filter((card) => canApplyUpgrade(card, upgrade)))[0];
      if (!target) continue;
      deck = deck.map((card) => card.id === target.id ? applyCardUpgrade(card, upgrade) : card);
      if (deck.reduce((count, card) => count + card.upgrades.length, 0) >= loadDeck().reduce((count, card) => count + card.upgrades.length, 0) + 2) break;
    }
    saveDeck(deck);
  }
  if (id === "forge") {
    const deck = loadDeck();
    const sacrifice = shuffle(deck.filter((card) => card.upgrades.length > 0))[0];
    if (!sacrifice) return;
    saveDeck(deck.filter((card) => card.id !== sacrifice.id));
    const bonusItems = surfaceItems(2);
    saveRunItems([...new Set([...loadRunItems(), ...bonusItems.map((item) => item.id)])]);
  }
}
