import type { GeometryVisual, LevelConfig, PuzzleCard, Stage } from "./types";

type ProblemType =
  | "rectangle-area" | "rectangle-perimeter" | "triangle-perimeter"
  | "triangle-area" | "parallelogram-area" | "parallelogram-perimeter"
  | "circle-area" | "circle-perimeter" | "obtuse-triangle-area"
  | "trapezoid-area" | "trapezoid-perimeter" | "hexagon-perimeter"
  | "l-area" | "l-perimeter";

const stageProblems: Record<Stage, ProblemType[]> = {
  "1": ["rectangle-area", "rectangle-perimeter", "triangle-perimeter"],
  "2": ["triangle-area", "parallelogram-area", "parallelogram-perimeter"],
  "3a": ["circle-area", "circle-perimeter", "obtuse-triangle-area"],
  "3b": ["trapezoid-area", "trapezoid-perimeter", "hexagon-perimeter"],
  "4": ["l-area", "l-perimeter"],
};

function randomInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function choice<T>(items: T[]) { return items[randomInt(0, items.length - 1)]; }
function advancedLesson(level: LevelConfig) { return level.kind === "level3" || level.kind === "boss"; }
function singleDigitMin(advanced: boolean) { return advanced ? 2 : 1; }
function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(0, index);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function visual(shape: GeometryVisual["shape"], entries: Array<[string, GeometryVisual["measurements"][number]["position"]]>): GeometryVisual {
  return { shape, measurements: entries.map(([label, position]) => ({ label, position })) };
}

function makeProblem(type: ProblemType, advanced: boolean) {
  if (type.startsWith("rectangle")) {
    const width = randomInt(2, 9);
    const height = Math.random() < 0.25 ? width : randomInt(2, 9);
    const areaAnswer = `Area ${width * height}`;
    const perimeterAnswer = `Perimeter ${2 * (width + height)}`;
    return { answer: type.endsWith("area") ? areaAnswer : perimeterAnswer, validAnswers: [areaAnswer, perimeterAnswer], geometry: visual("rectangle", [[String(width), "bottom"], [String(height), "left"]]) };
  }
  if (type === "triangle-perimeter") {
    const a = randomInt(2, 9); const b = randomInt(2, 9); const c = randomInt(Math.abs(a - b) + 1, Math.min(9, a + b - 1));
    return { answer: `Perimeter ${a + b + c}`, geometry: visual("triangle", [[String(a), "left"], [String(b), "right"], [String(c), "bottom"]]) };
  }
  if (type === "triangle-area" || type === "obtuse-triangle-area") {
    let base = randomInt(2, 9); let height = randomInt(2, 9);
    if ((base * height) % 2 !== 0) base = Math.min(9, base + 1);
    return { answer: `Area ${(base * height) / 2}`, geometry: visual(type === "triangle-area" ? "triangle" : "obtuse-triangle", [[String(base), "bottom"], [String(height), "inside"]]) };
  }
  if (type.startsWith("parallelogram")) {
    const base = randomInt(2, 9); const side = randomInt(2, 9); const height = randomInt(2, 9);
    const area = type.endsWith("area");
    return { answer: `${area ? "Area" : "Perimeter"} ${area ? base * height : 2 * (base + side)}`, geometry: visual("parallelogram", area ? [[String(base), "bottom"], [String(height), "inside"]] : [[String(base), "bottom"], [String(side), "left"]]) };
  }
  if (type.startsWith("circle")) {
    const useRadius = Math.random() < 0.5;
    const measure = useRadius ? randomInt(singleDigitMin(advanced), 9) : choice([2, 4, 6, 8]);
    const radius = useRadius ? measure : measure / 2;
    const area = type.endsWith("area");
    const coefficient = area ? radius ** 2 : 2 * radius;
    const areaAnswer = `Area ${radius ** 2}π`;
    const perimeterAnswer = `Perimeter ${2 * radius}π`;
    return { answer: `${area ? "Area" : "Perimeter"} ${coefficient}π`, validAnswers: [areaAnswer, perimeterAnswer], geometry: visual("circle", [[`${useRadius ? "r" : "d"}=${measure}`, "inside"]]) };
  }
  if (type.startsWith("trapezoid")) {
    const template = choice([{ top: 3, bottom: 9, height: 4, side: 5 }, { top: 2, bottom: 8, height: 4, side: 5 }, { top: 5, bottom: 9, height: 3, side: 4 }]);
    const area = type.endsWith("area");
    return { answer: `${area ? "Area" : "Perimeter"} ${area ? ((template.top + template.bottom) * template.height) / 2 : template.top + template.bottom + 2 * template.side}`, geometry: visual("trapezoid", area ? [[String(template.top), "top"], [String(template.bottom), "bottom"], [String(template.height), "inside"]] : [[String(template.top), "top"], [String(template.bottom), "bottom"], [String(template.side), "left"], [String(template.side), "right"]]) };
  }
  if (type === "hexagon-perimeter") {
    const side = randomInt(singleDigitMin(advanced), 9);
    return { answer: `Perimeter ${6 * side}`, geometry: visual("hexagon", [[String(side), "bottom"]]) };
  }
  const width = randomInt(4, 9); const height = randomInt(4, 9); const cutWidth = randomInt(singleDigitMin(advanced), width - 2); const cutHeight = randomInt(singleDigitMin(advanced), height - 2);
  const area = type === "l-area";
  const answer = `${area ? "Area" : "Perimeter"} ${area ? width * height - cutWidth * cutHeight : 2 * (width + height)}`;
  return { answer, validAnswers: area ? [answer, `Perimeter ${2 * (width + height)}`] : [answer], geometry: visual("l-shape", area ? [[String(width), "bottom"], [String(height), "left"], [String(cutWidth), "cutout-horizontal"], [String(cutHeight), "cutout-vertical"]] : [[String(width), "bottom"], [String(height), "left"]]) };
}

export function generateGeometryPuzzle(level: LevelConfig): PuzzleCard[] {
  const advanced = advancedLesson(level);
  const types = stageProblems[level.stage];
  const planned = types.flatMap((type) => [type, type]);
  while (planned.length < level.pairs) planned.push(choice(types));
  const answers = new Set<string>();
  const validAnswersByGeometry: Array<Set<string>> = [];
  const cards: PuzzleCard[] = [];
  shuffle(planned).forEach((type, index) => {
    let problem = makeProblem(type, advanced);
    let guard = 0;
    const isAmbiguous = () => {
      const validAnswers = new Set("validAnswers" in problem ? problem.validAnswers : [problem.answer]);
      return [...validAnswers].some((answer) => answers.has(answer))
        || validAnswersByGeometry.some((existingValidAnswers) => existingValidAnswers.has(problem.answer));
    };
    while (isAmbiguous() && guard < 1000) { problem = makeProblem(type, advanced); guard += 1; }
    if (isAmbiguous()) throw new Error(`Could not generate unambiguous geometry pair ${index + 1} for ${level.id}.`);
    answers.add(problem.answer);
    validAnswersByGeometry.push(new Set("validAnswers" in problem ? problem.validAnswers : [problem.answer]));
    const pairId = `${level.id}_pair${index + 1}`;
    cards.push({ id: `${pairId}_expression`, pairId, kind: "expression", label: "", geometry: problem.geometry, matched: false });
    cards.push({ id: `${pairId}_result`, pairId, kind: "result", label: problem.answer, matched: false });
  });
  return shuffle(cards);
}
