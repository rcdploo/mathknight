export type Unit = "addition" | "subtraction" | "multiplication" | "division" | "fractions";
export type Stage = "1" | "2" | "3a" | "3b" | "4";
export type LevelKind = "level1" | "level2" | "level3" | "boss";
export type CardKind = "expression" | "result";

export type LevelConfig = {
  id: string;
  unit: Unit;
  stage: Stage;
  kind: LevelKind;
  pairs: number;
  rows: number;
  columns: number;
  maxTurns: number | null;
  isBoss: boolean;
};

export type PuzzleCard = {
  id: string;
  pairId: string;
  kind: CardKind;
  label: string;
  matched: boolean;
};

export type PuzzlePair = {
  id: string;
  expression: string;
  result: number;
  resultLabel?: string;
};

export type PuzzleProgress = {
  completed: boolean;
  bestStars: number;
  bestTurns: number | null;
  wins: number;
  attempts: number;
  lastPlayedAt: string;
};

export type PlayerProgress = {
  schemaVersion: 1;
  coins: number;
  settings: {
    muted: boolean;
  };
  puzzles: Record<string, PuzzleProgress>;
};

export type LevelResult = {
  completed: boolean;
  stars: number;
  turnsUsed: number;
  coinsEarned: number;
};
