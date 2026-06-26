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
  displayDescription: string;
  shopCostRaw: string;
  isUpgrade: boolean;
};

const descriptions: Record<string, string> = {
  "1": "A digit worth 1.", "2": "A digit worth 2.", "3": "A digit worth 3.", "4": "A digit worth 4.",
  "5": "A digit worth 5.", "6": "A digit worth 6.", "7": "A digit worth 7.", "8": "A digit worth 8.", "9": "A digit worth 9.",
  "1_": "Combine with a digit to make a number from 10 to 19.",
  "2_": "Combine with a digit to make a number from 20 to 29.",
  "+": "Add two values.", "-": "Subtract the next value.", "x": "Multiply two values.",
  "/": "Divide two values. Dividing by zero wins, but destroys this card.",
  "_^2": "Combine with a digit, then square the combined value.",
  "_^3": "Combine with a digit, then cube the combined value.",
  "()": "Group part of an expression with parentheses.",
  "T": "Equals the current turn number.",
  "2o": "Equals twice the number of operators played.",
  "o^2": "Equals the square of the number of operators played.",
  "3p": "Equals three times the number of other prime values played.",
  "2e": "Equals twice the number of other even values played.",
  "2U": "Equals twice the number of upgraded cards in your whole deck.",
  "U^2": "Equals the square of the number of upgraded cards played.",
  "R": "Equals the current room number (1-10).",
  "Armor": "Gain Armor equal to this digit when played.",
  "+1": "Permanently increase a digit by 1.",
  "Card Removal": "Permanently remove one card from your deck.",
  "+3": "Permanently add 3 to a variable's value.",
  "Cycling": "Discard this card to draw a replacement.",
  "Consumable": "Discard this card for 1 Energy this turn.",
  "Efficiency": "Permanently reduce this card's Energy cost by 1.",
  "Bash": "10% chance to stun the monster next turn.",
  "Weaken": "Reduce the monster's attack by 10% for its next two turns.",
  "Crit": "20% chance to deal 1.5x damage.",
  "Reflecting": "Return half the damage you take this turn.",
  "Healing": "When used in an expression, heal 1 HP per Level.",
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
  const aliases: Record<string, string> = {
    "+": "plus",
    "-": "minus",
    "x": "multiply",
    "/": "divide",
    "()": "parentheses",
    "+1": "plus-1",
    "+3": "plus-3",
    "1_": "combo-10",
    "2_": "combo-20",
    "_^2": "combo-square",
    "_^3": "combo-cube",
  };
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
  displayDescription: descriptions[row["Card Name"]] ?? row.Effect,
  shopCostRaw: row["Median Purchase Cost at Shop"],
  isUpgrade: row.Type.startsWith("Upgrade"),
}));

export const cardByName = new Map(cardCatalog.map((card) => [card.name, card]));
export const cardById = new Map(cardCatalog.map((card) => [card.id, card]));

export function cardDescription(catalogId: string, label?: string, fallback = "") {
  const byLabel = label ? cardByName.get(label) : undefined;
  return byLabel?.displayDescription ?? cardById.get(catalogId)?.displayDescription ?? fallback;
}

export function cardsEligibleForRewards() {
  return cardCatalog.filter((card) => card.rarity !== "Starter");
}
