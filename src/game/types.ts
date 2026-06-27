export type Unit = "addition" | "subtraction" | "multiplication" | "division" | "fractions" | "geometry" | "algebra";
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
  geometry?: GeometryVisual;
};

export type GeometryVisual = {
  shape: "rectangle" | "triangle" | "obtuse-triangle" | "parallelogram" | "circle" | "trapezoid" | "hexagon" | "l-shape";
  measurements: Array<{ label: string; position: "top" | "bottom" | "left" | "right" | "inside" | "cutout-horizontal" | "cutout-vertical" }>;
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
    musicVolume: number;
    effectsVolume: number;
  };
  puzzles: Record<string, PuzzleProgress>;
};

export type LevelResult = {
  completed: boolean;
  stars: number;
  turnsUsed: number;
  coinsEarned: number;
};
