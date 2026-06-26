import source from "./Items.csv?raw";
import { canApplyUpgrade, shuffle, type BattleCard } from "./battleEngine";
import { generateCombatRewards } from "./rewardGenerator";
import { loadProgress, saveProgress } from "../game/progressStore";

export type ItemRarity = "Common" | "Uncommon" | "Rare" | "Boss";
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
const bossShownKey = "mathknight.dungeon.bossItemsShown.v1";
const pendingItemChoiceKey = "mathknight.dungeon.pendingItemChoice.v1";

export type PendingItemChoice =
  | { kind: "upgrades"; itemId: string; upgrades: string[] }
  | { kind: "rewards"; itemId: string; rewardSets: BattleCard[][] }
  | { kind: "aluminum"; itemId: "aluminum"; remaining: number; selectedIds: string[] }
  | { kind: "fresh-paint"; itemId: "fresh-paint"; remaining: number; selectedIds: string[] }
  | { kind: "forge"; itemId: "forge"; itemIds?: string[] };

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

export function addRunItem(id: string, level = 1) {
  const next = [...new Set([...loadRunItems(), id])];
  saveRunItems(next);
  applyAcquisitionBonus(id, level);
  window.dispatchEvent(new Event("mathknight-item-choice"));
  return next;
}

export function resetRunItems() {
  saveRunItems([]);
  savePendingItemChoice(null);
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
  const pool = itemCatalog.filter((item) => item.rarity !== "Boss" && (!excludeOwned || !owned.has(item.id)));
  const selected: ItemDefinition[] = [];
  const rarityWeight: Record<ItemRarity, number> = { Common: 10, Uncommon: 4, Rare: 1.5, Boss: 0 };

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

export function surfaceBossItems(count = 2) {
  const shown = new Set<string>(JSON.parse(window.localStorage.getItem(bossShownKey) ?? "[]") as string[]);
  const owned = new Set(loadRunItems());
  const available = itemCatalog.filter((item) => item.rarity === "Boss" && !shown.has(item.id) && !owned.has(item.id));
  const shuffled = shuffle(available);
  const selected: ItemDefinition[] = [];
  for (const item of shuffled) {
    if (selected.some((chosen) => chosen.tags.some((tag) => item.tags.includes(tag)))) continue;
    selected.push(item);
    if (selected.length === count) break;
  }
  if (selected.length < count) {
    for (const item of shuffled) {
      if (selected.some((chosen) => chosen.id === item.id)) continue;
      selected.push(item);
      if (selected.length === count) break;
    }
  }
  return selected;
}

export function markBossItemsShown(ids: string[]) {
  const shown = new Set<string>(JSON.parse(window.localStorage.getItem(bossShownKey) ?? "[]") as string[]);
  window.localStorage.setItem(bossShownKey, JSON.stringify([...shown, ...ids]));
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

function savePendingItemChoice(choice: PendingItemChoice | null) {
  if (!choice) window.localStorage.removeItem(pendingItemChoiceKey);
  else window.localStorage.setItem(pendingItemChoiceKey, JSON.stringify(choice));
}

function randomLegalUpgrades(count: number) {
  const deck = loadDeck();
  return shuffle(["armor", "plus-1", "plus-3", "cycling", "consumable", "efficiency", "bash", "weaken", "crit", "reflecting", "healing", "initiative"])
    .filter((upgrade) => deck.some((card) => canApplyUpgrade(card, upgrade)))
    .slice(0, count);
}

function applyAcquisitionBonus(id: string, level: number) {
  if (id === "grab-bag") {
    savePendingItemChoice({ kind: "rewards", itemId: id, rewardSets: Array.from({ length: 3 }, () => generateCombatRewards(level).map((reward) => reward.card)) });
  }
  if (id === "whetstone") {
    savePendingItemChoice({ kind: "upgrades", itemId: id, upgrades: randomLegalUpgrades(2) });
  }
  if (id === "smithy") {
    savePendingItemChoice({ kind: "upgrades", itemId: id, upgrades: randomLegalUpgrades(3) });
  }
  if (id === "tiny-chest") {
    const progress = loadProgress();
    saveProgress({ ...progress, coins: progress.coins + 500 });
    savePendingItemChoice({ kind: "rewards", itemId: id, rewardSets: [generateCombatRewards(level).map((reward) => reward.card)] });
  }
  if (id === "aluminum") {
    savePendingItemChoice({ kind: "aluminum", itemId: id, remaining: 3, selectedIds: [] });
  }
  if (id === "fresh-paint") {
    savePendingItemChoice({ kind: "fresh-paint", itemId: id, remaining: 3, selectedIds: [] });
  }
  if (id === "forge") {
    savePendingItemChoice({ kind: "forge", itemId: id });
  }
}

export function loadPendingItemChoice() {
  try {
    return JSON.parse(window.localStorage.getItem(pendingItemChoiceKey) ?? "null") as PendingItemChoice | null;
  } catch {
    return null;
  }
}

export function updatePendingItemChoice(choice: PendingItemChoice | null) {
  savePendingItemChoice(choice);
}
