import sourceRows from "./cardCatalog.json";

export type CardRarity = "Starter" | "Common" | "Uncommon" | "Rare";
export type CardType =
  | "Digit" | "Combo" | "Operator" | "Variable" | "Upgrade"
  | "Upgrade (Digit)" | "Upgrade (Variable)" | "Upgrade (any)";

export type CardDefinition = {
  id: string;
  name: string;
  type: CardType;
  rarity: CardRarity;
  energyCost: number | "X" | null;
  energyCostRaw: string;
  effect: string;
  shopCostRaw: string;
  isUpgrade: boolean;
};

type SourceRow = {
  "Card Name": string;
  Type: CardType;
  Rarity: CardRarity;
  "Energy Cost": string;
  Effect: string;
  "Median Purchase Cost at Shop": string;
};

function cardId(name: string) {
  const aliases: Record<string, string> = { "+": "plus", "-": "minus", "x": "multiply", "/": "divide", "()": "parentheses", "^X": "power-x" };
  return aliases[name] ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function energyCost(raw: string): number | "X" | null {
  if (raw === "X") return "X";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export const cardCatalog: CardDefinition[] = (sourceRows as SourceRow[]).map((row) => ({
  id: cardId(row["Card Name"]),
  name: row["Card Name"],
  type: row.Type,
  rarity: row.Rarity,
  energyCost: energyCost(row["Energy Cost"]),
  energyCostRaw: row["Energy Cost"],
  effect: row.Effect,
  shopCostRaw: row["Median Purchase Cost at Shop"],
  isUpgrade: row.Type.startsWith("Upgrade"),
}));

export const cardByName = new Map(cardCatalog.map((card) => [card.name, card]));
export const cardById = new Map(cardCatalog.map((card) => [card.id, card]));

export function cardsEligibleForRewards() {
  return cardCatalog.filter((card) => card.rarity !== "Starter");
}
