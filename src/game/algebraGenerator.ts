import type { LevelConfig, PuzzleCard, Stage } from "./types";

type Term = { coefficient: number; variable: boolean; sign: 1 | -1 };
const variables = ["x", "y", "n", "m", "t"];

function randomInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function choice<T>(items: T[]) { return items[randomInt(0, items.length - 1)]; }
function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(0, index); [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function formatTerms(terms: Term[], variable: string) {
  return terms.map((term, index) => {
    const value = `${term.coefficient}${term.variable ? variable : ""}`;
    if (index === 0) return term.sign === -1 ? `-${value}` : value;
    return `${term.sign === 1 ? "+" : "−"} ${value}`;
  }).join(" ");
}

function evaluateTerms(terms: Term[], solution: number) {
  return terms.reduce((total, term) => total + term.sign * term.coefficient * (term.variable ? solution : 1), 0);
}

function stage1(variable: string, solution: number) {
  for (let guard = 0; guard < 500; guard += 1) {
    const coefficient = randomInt(1, 9); const constant = randomInt(1, 9); const sign = choice<1 | -1>([1, -1]);
    const right = coefficient * solution + sign * constant;
    if (right >= 1 && right <= 9) return `${coefficient}${variable} ${sign === 1 ? "+" : "−"} ${constant} = ${right}`;
  }
  throw new Error("Could not generate Stage 1 algebra equation.");
}

function stage2(variable: string, solution: number) {
  for (let guard = 0; guard < 1500; guard += 1) {
    const termCount = randomInt(4, 5);
    const kinds = shuffle([true, true, false, false, ...(termCount === 5 ? [Math.random() < 0.5] : [])]);
    const terms = kinds.map((isVariable) => ({ coefficient: randomInt(1, 9), variable: isVariable, sign: choice<1 | -1>([1, -1]) }));
    const variableCoefficient = terms.filter((term) => term.variable).reduce((total, term) => total + term.sign * term.coefficient, 0);
    if (variableCoefficient === 0) continue;
    const right = evaluateTerms(terms, solution);
    if (right >= 1 && right <= 9) return `${formatTerms(terms, variable)} = ${right}`;
  }
  throw new Error("Could not generate Stage 2 algebra equation.");
}

function stage3(variable: string, solution: number) {
  for (let guard = 0; guard < 1200; guard += 1) {
    const a = randomInt(1, 9); const c = randomInt(1, 9); const b = randomInt(1, 9);
    const d = (a - c) * solution + b;
    if (d < 1 || d > 9 || a === c) continue;
    if (Math.random() < 0.5 && b >= 2) {
      const first = randomInt(1, b - 1); const second = b - first;
      return `${a}${variable} + ${first} + ${second} = ${c}${variable} + ${d}`;
    }
    return `${a}${variable} + ${b} = ${c}${variable} + ${d}`;
  }
  throw new Error("Could not generate Stage 3 algebra equation.");
}

function stage4(variable: string, solution: number) {
  for (let guard = 0; guard < 2500; guard += 1) {
    const a = randomInt(1, 9); const c = randomInt(1, 9); const denominator = randomInt(2, 9); const e = randomInt(1, 9);
    if (a === c * denominator) continue;
    const b = denominator * (c * solution + e) - a * solution;
    if (b < 1 || b > 9) continue;
    const fraction = `(${a}${variable} + ${b})/${denominator}`;
    const other = `${c}${variable} + ${e}`;
    return Math.random() < 0.5 ? `${fraction} = ${other}` : `${other} = ${fraction}`;
  }
  throw new Error("Could not generate Stage 4 algebra equation.");
}

function stage5(variable: string, solution: number) {
  for (let guard = 0; guard < 4000; guard += 1) {
    const a = randomInt(1, 9); const b = randomInt(1, 9); const c = randomInt(1, 9);
    const leftDenominator = randomInt(2, 9); const rightDenominator = randomInt(2, 9);
    if (a * rightDenominator === c * leftDenominator) continue;
    const numerator = (a * solution + b) * rightDenominator;
    if (numerator % leftDenominator !== 0) continue;
    const e = numerator / leftDenominator - c * solution;
    if (e < 1 || e > 9 || leftDenominator === rightDenominator) continue;
    return `(${a}${variable} + ${b})/${leftDenominator} = (${c}${variable} + ${e})/${rightDenominator}`;
  }
  throw new Error("Could not generate Stage 5 algebra equation.");
}

function makeEquation(stage: Stage, variable: string, solution: number) {
  if (stage === "1") return stage1(variable, solution);
  if (stage === "2") return stage2(variable, solution);
  if (stage === "3a") return stage3(variable, solution);
  if (stage === "3b") return stage4(variable, solution);
  return stage5(variable, solution);
}

export function generateAlgebraPuzzle(level: LevelConfig): PuzzleCard[] {
  const usedAnswers = new Set<string>();
  const cards: PuzzleCard[] = [];
  const levelVariables = shuffle(variables).slice(0, 2);
  for (let index = 0; index < level.pairs; index += 1) {
    let guard = 0;
    while (guard < 500) {
      const variable = levelVariables[index % levelVariables.length]; const solution = randomInt(1, 9); const answer = `${variable} = ${solution}`;
      if (!usedAnswers.has(answer)) {
        const equation = makeEquation(level.stage, variable, solution);
        usedAnswers.add(answer);
        const pairId = `${level.id}_pair${index + 1}`;
        cards.push({ id: `${pairId}_expression`, pairId, kind: "expression", label: equation, matched: false });
        cards.push({ id: `${pairId}_result`, pairId, kind: "result", label: answer, matched: false });
        break;
      }
      guard += 1;
    }
  }
  return shuffle(cards);
}
