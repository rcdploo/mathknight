import source from "./Rewards and Shops.csv?raw";
import { cardCatalog, type CardDefinition, type CardRarity } from "./cardCatalog";
import { applyCardUpgrade, canApplyUpgrade, makeCatalogEntry, type BattleCard } from "./battleEngine";

export type RewardKind = "Card" | "Upgrade" | "Upgraded Card";
export type GeneratedReward = {
  slot: 1 | 2 | 3;
  kind: RewardKind;
  budget: number | null;
  card: BattleCard;
};

type RewardRule = {
  level: number;
  slot: 1 | 2 | 3;
  options: RewardKind[];
  valueWeights: number[];
};

const shownKey = "mathknight.dungeon.rewardUpgradeShown.v1";
const rarityValue: Record<CardRarity, number> = { Starter: 0, Common: 1, Uncommon: 2, Rare: 3 };

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += character;
  }
  values.push(value);
  return values;
}

const rewardRules: RewardRule[] = source.split(/\r?\n/).slice(2, 17).filter(Boolean).map((line) => {
  const [level, slot, options, ...weights] = parseCsvLine(line);
  return {
    level: Number(level),
    slot: Number(slot) as 1 | 2 | 3,
    options: options.split(",").map((option) => option.trim() as RewardKind),
    valueWeights: weights.slice(0, 7).map((weight) => Number(weight) || 0),
  };
});

function choice<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function weightedChoice<T>(items: T[], weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return items[index];
  }
  return items[items.length - 1];
}

function loadShownCounts() {
  try {
    return JSON.parse(window.localStorage.getItem(shownKey) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function saveShownCounts(counts: Record<string, number>) {
  window.localStorage.setItem(shownKey, JSON.stringify(counts));
}

function playableCards() {
  return cardCatalog.filter((card) => card.rarity !== "Starter" && !card.isUpgrade);
}

export function rewardUpgrades() {
  return cardCatalog.filter((card) => card.isUpgrade);
}

function attachableUpgrades() {
  return rewardUpgrades().filter((upgrade) => upgrade.id !== "card-removal");
}

function pickUpgrade(candidates: CardDefinition[], shown: Record<string, number>) {
  const picked = weightedChoice(candidates, candidates.map((upgrade) => 0.7 ** (shown[upgrade.id] ?? 0)));
  shown[picked.id] = (shown[picked.id] ?? 0) + 1;
  return picked;
}

function rollKinds(rules: RewardRule[]) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const kinds = rules.map((rule) => choice(rule.options));
    const hasUpgrade = kinds.includes("Upgrade");
    const hasCard = kinds.some((kind) => kind !== "Upgrade");
    if (hasUpgrade && hasCard) return kinds;
  }
  const fallback = rules.map((rule) => rule.options[0]);
  const upgradeSlot = rules.findIndex((rule) => rule.options.includes("Upgrade"));
  if (!fallback.includes("Upgrade") && upgradeSlot >= 0) fallback[upgradeSlot] = "Upgrade";
  return fallback;
}

function rollBudget(rule: RewardRule) {
  return weightedChoice([1, 2, 3, 4, 5, 6, 7], rule.valueWeights);
}

function makeUpgradedCard(
  rule: RewardRule,
  kind: RewardKind,
  shown: Record<string, number>,
  usedCardIds = new Set<string>(),
  usedUpgradeIds = new Set<string>(),
) {
  const budget = rollBudget(rule);
  const eligibleCards = playableCards().filter((definition) => {
    if (usedCardIds.has(definition.id)) return false;
    const card = makeCatalogEntry(definition.name);
    if (rarityValue[definition.rarity] > budget) return false;
    if (kind === "Card") return true;
    const remaining = budget - rarityValue[definition.rarity];
    return remaining > 0 && attachableUpgrades().some((upgrade) =>
      !usedUpgradeIds.has(upgrade.id)
      &&
      rarityValue[upgrade.rarity] <= remaining && canApplyUpgrade(card, upgrade.id),
    );
  });
  if (eligibleCards.length === 0) throw new Error("No unique card fits this reward slot.");
  const definition = choice(eligibleCards);
  usedCardIds.add(definition.id);
  let card = makeCatalogEntry(definition.name);
  if (kind === "Card") return { card, budget };

  let remaining = budget - rarityValue[definition.rarity];
  for (let upgradeNumber = 0; upgradeNumber < 2 && remaining > 0; upgradeNumber += 1) {
    const eligibleUpgrades = attachableUpgrades().filter((upgrade) =>
      !usedUpgradeIds.has(upgrade.id)
      &&
      rarityValue[upgrade.rarity] <= remaining
      && canApplyUpgrade(card, upgrade.id),
    );
    if (eligibleUpgrades.length === 0) break;
    const upgrade = pickUpgrade(eligibleUpgrades, shown);
    usedUpgradeIds.add(upgrade.id);
    card = applyCardUpgrade(card, upgrade.id);
    remaining -= rarityValue[upgrade.rarity];
  }
  return { card, budget };
}

export function generateCombatRewards(level: number): GeneratedReward[] {
  const rules = rewardRules.filter((rule) => rule.level === level).sort((left, right) => left.slot - right.slot);
  const originalShown = loadShownCounts();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const kinds = rollKinds(rules);
    const shown = { ...originalShown };
    const usedCardIds = new Set<string>();
    const usedUpgradeIds = new Set<string>();
    try {
      const rewards = rules.map((rule, index): GeneratedReward => {
        const kind = kinds[index];
        if (kind === "Upgrade") {
          const candidates = rewardUpgrades().filter((upgrade) => !usedUpgradeIds.has(upgrade.id));
          const upgrade = pickUpgrade(candidates, shown);
          usedUpgradeIds.add(upgrade.id);
          return { slot: rule.slot, kind, budget: null, card: makeCatalogEntry(upgrade.name) };
        }
        const generated = makeUpgradedCard(rule, kind, shown, usedCardIds, usedUpgradeIds);
        return { slot: rule.slot, kind, budget: generated.budget, card: generated.card };
      });
      saveShownCounts(shown);
      return rewards;
    } catch {
      // Try another valid category/budget combination.
    }
  }
  throw new Error("Unable to generate a unique combat reward selection.");
}

export function generateShopCard(level: number, rewardSlot: 1 | 2 | 3) {
  const rule = rewardRules.find((candidate) => candidate.level === level && candidate.slot === rewardSlot);
  if (!rule) throw new Error("Missing shop card reward rule.");
  const shown = loadShownCounts();
  const kind: RewardKind = rule.options.includes("Upgraded Card") && Math.random() < .5 ? "Upgraded Card" : "Card";
  const generated = makeUpgradedCard(rule, kind, shown);
  saveShownCounts(shown);
  return { kind, budget: generated.budget, card: generated.card };
}

export function generateShopUpgrade(level: number) {
  const targetLevel = level === 1 ? 1 : level === 2 ? 2 : 1;
  const levels = [1, 2, 3];
  const upgradeLevel = weightedChoice(levels, levels.map((candidate) => candidate === targetLevel ? 50 : 25));
  const candidates = rewardUpgrades().filter((upgrade) => rarityValue[upgrade.rarity] === upgradeLevel && upgrade.id !== "card-removal");
  const shown = loadShownCounts();
  const upgrade = pickUpgrade(candidates, shown);
  saveShownCounts(shown);
  return makeCatalogEntry(upgrade.name);
}
