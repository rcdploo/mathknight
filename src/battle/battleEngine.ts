import { cardByName, type CardDefinition, type CardRarity, type CardType } from "./cardCatalog";

export type BattleCard = {
  id: string;
  label: string;
  token: string;
  kind: "number" | "operator" | "combo" | "variable" | "power" | "parenthesis" | "upgrade";
  energy: number;
  catalogId: string;
  type: CardType;
  rarity: CardRarity;
  effect: string;
  shopCostRaw: string;
  upgrades: string[];
  lockedValue?: number;
  generatedById?: string;
  consumedThisTurn?: boolean;
};

export type DrawState = {
  hand: BattleCard[];
  drawPile: BattleCard[];
  discardPile: BattleCard[];
};

let nextCardId = 0;

export function makeCard(label: string, kind: BattleCard["kind"], energy: number): BattleCard {
  nextCardId += 1;
  const definition = cardByName.get(label);
  return {
    id: `battle-card-${nextCardId}`,
    label,
    token: label,
    kind,
    energy,
    catalogId: definition?.id ?? label,
    type: definition?.type ?? (kind === "number" ? "Digit" : "Operator"),
    rarity: definition?.rarity ?? "Starter",
    effect: definition?.effect ?? label,
    shopCostRaw: definition?.shopCostRaw ?? "",
    upgrades: [],
  };
}

function cardKind(definition: CardDefinition): BattleCard["kind"] {
  if (definition.isUpgrade) return "upgrade";
  if (definition.name === "^X") return "power";
  if (definition.name === "()") return "parenthesis";
  if (definition.type === "Digit") return "number";
  if (definition.type === "Combo") return "combo";
  if (definition.type === "Variable") return "variable";
  return "operator";
}

export function makeCatalogCard(name: string) {
  const definition = cardByName.get(name);
  if (!definition || definition.isUpgrade) throw new Error(`Unknown playable card: ${name}`);
  return makeCard(definition.name, cardKind(definition), typeof definition.energyCost === "number" ? definition.energyCost : 0);
}

export function makeCatalogEntry(name: string) {
  const definition = cardByName.get(name);
  if (!definition) throw new Error(`Unknown catalog entry: ${name}`);
  return makeCard(definition.name, cardKind(definition), typeof definition.energyCost === "number" ? definition.energyCost : 0);
}

export function makeStartingDeck() {
  return [
    ...Array.from({ length: 4 }, () => makeCard("1", "number", 0)),
    ...Array.from({ length: 3 }, () => makeCard("2", "number", 0)),
    ...Array.from({ length: 2 }, () => makeCard("3", "number", 1)),
    makeCard("4", "number", 1),
    makeCard("+", "operator", 1),
    makeCard("+", "operator", 1),
  ];
}

export function makeBottledPlus() {
  return makeCard("+", "operator", 1);
}

export function migrateBattleCard(card: BattleCard): BattleCard {
  const definition = cardByName.get(card.label);
  return {
    ...card,
    catalogId: card.catalogId ?? definition?.id ?? card.label,
    type: card.type ?? definition?.type ?? (card.kind === "number" ? "Digit" : "Operator"),
    rarity: card.rarity ?? definition?.rarity ?? "Starter",
    effect: card.effect ?? definition?.effect ?? card.label,
    shopCostRaw: card.shopCostRaw ?? definition?.shopCostRaw ?? "",
    upgrades: card.upgrades ?? [],
  };
}

export function shuffle<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function drawHand(drawPile: BattleCard[], discardPile: BattleCard[], handSize = 5): DrawState {
  let available = [...drawPile];
  let discard = [...discardPile];
  const hand: BattleCard[] = [];
  while (hand.length < handSize && (available.length > 0 || discard.length > 0)) {
    if (available.length === 0) {
      available = shuffle(discard);
      discard = [];
    }
    const card = available.shift();
    if (card) hand.push(card);
  }
  return { hand, drawPile: available, discardPile: discard };
}

export function expressionEnergy(cards: BattleCard[]) {
  return cards.reduce((total, card) => total + card.energy, 0);
}

export type ExpressionContext = { turn: number; level: number };
type ResolvedToken = { kind: "number" | "operator" | "left" | "right" | "power"; value?: number; operator?: string; sourceIds: string[] };

function upgradedValue(card: BattleCard, value: number) {
  return card.upgrades.includes("1") || card.upgrades.includes("plus-1") ? value + 1 : value;
}

function isPrime(value: number) {
  if (!Number.isInteger(value) || value < 2) return false;
  for (let divisor = 2; divisor <= Math.sqrt(value); divisor += 1) if (value % divisor === 0) return false;
  return true;
}

export function resolveExpressionTokens(cards: BattleCard[], context: ExpressionContext): ResolvedToken[] {
  const tokens: ResolvedToken[] = [];
  const resolvedNumbers: number[] = [];
  const operatorCount = cards.filter((card) => card.type === "Operator" && card.label !== "()").length
    + cards.filter((card) => card.label === "(" || card.label === "()").length;
  const upgradedCount = cards.reduce((count, card) => count + (card.upgrades.length > 0 ? 1 : 0), 0);

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (card.kind === "combo") {
      const digit = cards[index + 1];
      if (!digit || digit.kind !== "number") throw new Error(`${card.label} must be followed by a digit card.`);
      const tens = Number(card.label[0]) * 10;
      const value = tens + upgradedValue(digit, Number(digit.token));
      tokens.push({ kind: "number", value, sourceIds: [card.id, digit.id] });
      resolvedNumbers.push(value);
      index += 1;
      continue;
    }
    if (card.kind === "number") {
      const value = upgradedValue(card, Number(card.token));
      tokens.push({ kind: "number", value, sourceIds: [card.id] });
      resolvedNumbers.push(value);
      continue;
    }
    if (card.kind === "variable") {
      let value = 0;
      if (card.label === "T") value = context.turn;
      else if (card.label === "L") value = context.level;
      else if (card.label === "2o") value = 2 * operatorCount;
      else if (card.label === "o^2") value = operatorCount ** 2;
      else if (card.label === "3p") value = 3 * resolvedNumbers.filter(isPrime).length;
      else if (card.label === "2e") value = 2 * resolvedNumbers.filter((number) => number % 2 === 0).length;
      else if (card.label === "2U") value = 2 * upgradedCount;
      else if (card.label === "U^2") value = upgradedCount ** 2;
      if (card.upgrades.includes("3") || card.upgrades.includes("plus-3")) value += 3;
      tokens.push({ kind: "number", value, sourceIds: [card.id] });
      resolvedNumbers.push(value);
      continue;
    }
    if (card.kind === "power") {
      tokens.push({ kind: "power", value: card.lockedValue ?? card.energy, sourceIds: [card.id] });
      continue;
    }
    if (card.kind === "parenthesis") {
      tokens.push({ kind: card.label === ")" ? "right" : "left", sourceIds: [card.id] });
      continue;
    }
    tokens.push({ kind: "operator", operator: card.token === "x" ? "×" : card.token, sourceIds: [card.id] });
  }
  return tokens;
}

export function applyDamage(health: number, armor: number, incomingDamage: number) {
  const damage = Math.max(0, incomingDamage - armor);
  return { health: Math.max(0, health - damage), armor: Math.max(0, armor - incomingDamage), damage };
}

export type ExpressionUpgradeEffects = {
  armor: number;
  weaken: number;
  bashAttempts: number;
  critAttempts: number;
  reflecting: boolean;
};

export function expressionUpgradeEffects(cards: BattleCard[]): ExpressionUpgradeEffects {
  let armor = 0;
  let weaken = 0;
  let bashAttempts = 0;
  let critAttempts = 0;
  let reflecting = false;
  cards.forEach((card) => {
    if (card.upgrades.includes("armor") && card.kind === "number") armor += upgradedValue(card, Number(card.token));
    if (card.upgrades.includes("weaken")) weaken += 1;
    if (card.upgrades.includes("bash")) bashAttempts += 1;
    if (card.upgrades.includes("crit")) critAttempts += 1;
    if (card.upgrades.includes("reflecting")) reflecting = true;
  });
  return { armor, weaken, bashAttempts, critAttempts, reflecting };
}

export function rollAny(attempts: number, chance: number) {
  return Array.from({ length: attempts }).some(() => Math.random() < chance);
}

export function canApplyUpgrade(card: BattleCard, upgradeId: string) {
  if (card.upgrades.includes(upgradeId)) return false;
  if (upgradeId === "armor" || upgradeId === "1") return card.kind === "number";
  if (upgradeId === "3") return card.kind === "variable";
  return true;
}

export function applyCardUpgrade(card: BattleCard, upgradeId: string): BattleCard {
  if (!canApplyUpgrade(card, upgradeId)) throw new Error("That upgrade cannot be applied to this card.");
  return {
    ...card,
    energy: upgradeId === "efficiency" ? card.energy - 1 : card.energy,
    upgrades: [...card.upgrades, upgradeId],
  };
}

export function rollEnemyIntent() {
  return 4 + Math.floor(Math.random() * 7);
}

export function evaluateExpression(cards: BattleCard[], context: ExpressionContext = { turn: 1, level: 1 }) {
  if (cards.length === 0) throw new Error("Choose some cards first.");
  const expressionTokens = resolveExpressionTokens(cards, context);
  const values: number[] = [];
  const operators: string[] = [];
  const precedence: Record<string, number> = { "+": 1, "-": 1, "×": 2, "*": 2, "÷": 2, "/": 2, "^": 3 };
  const applyOperator = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    if (operator === undefined || right === undefined || left === undefined) throw new Error("Invalid expression.");
    if (operator === "+") values.push(left + right);
    else if (operator === "-") values.push(left - right);
    else if (operator === "×" || operator === "*") values.push(left * right);
    else if (operator === "÷" || operator === "/") values.push(left / right);
    else if (operator === "^") values.push(left ** right);
    else throw new Error("Unknown operator.");
  };

  let expectsNumber = true;
  expressionTokens.forEach((token) => {
    if (token.kind === "number") {
      if (!expectsNumber) throw new Error("Place an operator between every pair of numbers.");
      values.push(token.value ?? 0);
      expectsNumber = false;
      return;
    }
    if (token.kind === "left") {
      if (!expectsNumber) throw new Error("Place an operator before an opening parenthesis.");
      operators.push("(");
      return;
    }
    if (token.kind === "right") {
      if (expectsNumber) throw new Error("A closing parenthesis needs a number before it.");
      while (operators.length > 0 && operators[operators.length - 1] !== "(") applyOperator();
      if (operators.pop() !== "(") throw new Error("Parentheses are not balanced.");
      return;
    }
    if (token.kind === "power") {
      if (expectsNumber || values.length === 0) throw new Error("^X must follow a number or parenthetical expression.");
      const base = values.pop();
      values.push((base ?? 0) ** (token.value ?? 0));
      return;
    }
    if (expectsNumber) throw new Error("Expressions cannot begin with an operator.");
    const cardToken = token.operator ?? "";
    while (
      operators.length > 0 && operators[operators.length - 1] !== "(" &&
      (precedence[operators[operators.length - 1]] > precedence[cardToken] ||
        (precedence[operators[operators.length - 1]] === precedence[cardToken] && cardToken !== "^"))
    ) applyOperator();
    operators.push(cardToken);
    expectsNumber = true;
  });
  if (expectsNumber) throw new Error("Expressions must end with a number.");
  if (operators.includes("(")) throw new Error("Parentheses are not balanced.");
  while (operators.length > 0) applyOperator();
  if (values.length !== 1 || Number.isNaN(values[0])) throw new Error("Invalid expression.");
  return values[0];
}
