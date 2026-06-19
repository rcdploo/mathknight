export type BattleCard = {
  id: string;
  label: string;
  token: string;
  kind: "number" | "operator";
  energy: number;
};

export type DrawState = {
  hand: BattleCard[];
  drawPile: BattleCard[];
  discardPile: BattleCard[];
};

let nextCardId = 0;

export function makeCard(label: string, kind: BattleCard["kind"], energy: number): BattleCard {
  nextCardId += 1;
  return { id: `battle-card-${nextCardId}`, label, token: label, kind, energy };
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

export function applyDamage(health: number, armor: number, incomingDamage: number) {
  const damage = Math.max(0, incomingDamage - armor);
  return { health: Math.max(0, health - damage), damage };
}

export function rollEnemyIntent() {
  return 4 + Math.floor(Math.random() * 7);
}

export function evaluateExpression(cards: BattleCard[]) {
  if (cards.length === 0) throw new Error("Choose some cards first.");
  if (cards[0].kind !== "number" || cards[cards.length - 1].kind !== "number") {
    throw new Error("Expressions must begin and end with a number.");
  }
  for (let index = 1; index < cards.length; index += 1) {
    if (cards[index].kind === cards[index - 1].kind) {
      throw new Error("Place an operator between every pair of numbers.");
    }
  }

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

  cards.forEach((card) => {
    if (card.kind === "number") {
      values.push(Number(card.token));
      return;
    }
    while (
      operators.length > 0 &&
      (precedence[operators[operators.length - 1]] > precedence[card.token] ||
        (precedence[operators[operators.length - 1]] === precedence[card.token] && card.token !== "^"))
    ) applyOperator();
    operators.push(card.token);
  });
  while (operators.length > 0) applyOperator();
  if (values.length !== 1 || Number.isNaN(values[0])) throw new Error("Invalid expression.");
  return values[0];
}
