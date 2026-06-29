import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, LockKeyhole } from "lucide-react";
import { allLevels, levelLabels, makeLevelConfig, stageLabels, stages, unitLabels, units } from "../game/levels";
import { generatePuzzle } from "../game/puzzleGenerator";
import {
  blankPuzzleProgress,
  loadProgress,
  recordTrainingResult,
} from "../game/progressStore";
import { calculateCoins, calculateStars, getUnitValue } from "../game/scoring";
import { findNextUnlocked, getLevelUnlockState, getStageUnlockState, getUnitUnlockState, totalStars } from "../game/unlockRules";
import type { GeometryVisual, LevelConfig, LevelResult, PlayerProgress, PuzzleCard } from "../game/types";
import { loadPermanentLoadout } from "../quartermaster/quartermasterStore";

type Screen = "map" | "game" | "result";
type GameMode = "playing" | "reviewing";

const bossMemorizeSeconds = 30;
const bossMatchSeconds = 15;
const matchBorderColors = ["#f0ca73", "#6cb5a1", "#73c8dc", "#d77bb5", "#d77a66", "#9ea56c", "#b69be4", "#e39d5c", "#8fd3a9", "#b8c7d9"];

function playTone(effectsVolume: number, frequency: number, duration = 0.08) {
  if (loadProgress().settings.muted || effectsVolume <= 0) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.value = 0.045 * effectsVolume;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function formatStageDescription(stage: string, unit?: string) {
  if (unit === "perfectSquares") {
    const perfectSquaresDescriptions: Record<string, string> = {
      "1": "Perfect squares from 0–12",
      "2": "Perfect squares from 13–25",
      "3a": "Sums of two squares from 2–25",
      "3b": "Differences of two squares from 2–25",
      "4": "Equivalent sums of 2–3 squares from 1–10",
    };
    return perfectSquaresDescriptions[stage];
  }
  if (unit === "geometry") {
    const geometryDescriptions: Record<string, string> = {
      "1": "Rectangles & triangle perimeter",
      "2": "Triangles & parallelograms",
      "3a": "Circles & obtuse triangles",
      "3b": "Trapezoids & hexagons",
      "4": "L-shaped figures",
    };
    return geometryDescriptions[stage];
  }
  if (unit === "algebra") {
    const algebraDescriptions: Record<string, string> = {
      "1": "Two-step equations",
      "2": "Combine like terms",
      "3a": "Variables on both sides",
      "3b": "One fractional side",
      "4": "Fractions on both sides",
    };
    return algebraDescriptions[stage];
  }
  const descriptions: Record<string, string> = {
    "1": "1 digit with 1 digit",
    "2": "1 digit with 10-19",
    "3a": "10-19 with 10-19",
    "3b": "1 digit with 20-99",
    "4": "10-19 with 20-99",
  };
  return descriptions[stage];
}

function formatStars(stars: number) {
  return `${"★".repeat(stars)}${"☆".repeat(5 - stars)}`;
}

export default function TrainingGrounds({ onExit, onDungeon }: { onExit: () => void; onDungeon: () => void }) {
  const [progress, setProgress] = useState<PlayerProgress>(() => loadProgress());
  const [screen, setScreen] = useState<Screen>("map");
  const [gameMode, setGameMode] = useState<GameMode>("playing");
  const [selectedLevel, setSelectedLevel] = useState<LevelConfig>(() => makeLevelConfig("addition", "1", "level1"));
  const [cards, setCards] = useState<PuzzleCard[]>([]);
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [turnsRemaining, setTurnsRemaining] = useState(15);
  const [turnsUsed, setTurnsUsed] = useState(0);
  const [result, setResult] = useState<LevelResult | null>(null);
  const [deferredThisResult, setDeferredThisResult] = useState(0);
  const [bossPhase, setBossPhase] = useState<"memorize" | "match">("memorize");
  const [bossSeconds, setBossSeconds] = useState(bossMemorizeSeconds);
  const [dungeonLevel] = useState(() => loadPermanentLoadout().dungeonLevel);
  const [expandedUnits, setExpandedUnits] = useState<Set<(typeof units)[number]>>(
    () => new Set(units.filter((unit) => getUnitUnlockState(loadProgress(), unit).unlocked)),
  );
  const hasEndedRef = useRef(false);

  const allLevelConfigs = useMemo(() => allLevels(), []);
  const earnedStars = totalStars(progress);
  const matchColorByPair = useMemo(() => {
    const colorByPair = new Map<string, string>();
    cards.forEach((card) => {
      if (!colorByPair.has(card.pairId)) colorByPair.set(card.pairId, matchBorderColors[colorByPair.size % matchBorderColors.length]);
    });
    return colorByPair;
  }, [cards]);
  const matchedPairs = useMemo(() => new Set(cards.filter((card) => card.matched).map((card) => card.pairId)).size, [cards]);
  const pairsRemaining = selectedLevel.pairs - matchedPairs;
  const currentProgress = progress.puzzles[selectedLevel.id] ?? blankPuzzleProgress();

  function toggleUnit(unit: (typeof units)[number]) {
    if (!getUnitUnlockState(progress, unit).unlocked) return;
    setExpandedUnits((current) => {
      const next = new Set(current);
      if (next.has(unit)) next.delete(unit);
      else next.add(unit);
      return next;
    });
  }

  function startLevel(level: LevelConfig) {
    if (progress.run.difficulty === "impossible" && progress.puzzles[level.id]?.completed) return;
    hasEndedRef.current = false;
    setSelectedLevel(level);
    setCards(generatePuzzle(level));
    setFlippedIds([]);
    setIsResolving(false);
    setTurnsRemaining(level.maxTurns ?? 0);
    setTurnsUsed(0);
    setResult(null);
    setDeferredThisResult(0);
    setBossPhase(level.isBoss ? "memorize" : "match");
    setBossSeconds(level.isBoss ? bossMemorizeSeconds : 0);
    setGameMode("playing");
    setScreen("game");
  }

  function goBack() {
    if (screen === "game") {
      setScreen(gameMode === "reviewing" ? "result" : "map");
      setGameMode("playing");
      return;
    }
    if (screen === "result") {
      setScreen("map");
      return;
    }
    onExit();
  }

  function finishLevel(completed: boolean, finalTurnsUsed = turnsUsed) {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;

    const stars = completed ? calculateStars(selectedLevel.pairs, finalTurnsUsed, selectedLevel.kind) : 0;
    const nextWinCount = currentProgress.wins + (completed ? 1 : 0);
    const coinsEarned = completed ? calculateCoins(selectedLevel, stars, nextWinCount) : 0;
    const rawResult = { completed, stars, turnsUsed: finalTurnsUsed, coinsEarned };
    const recorded = recordTrainingResult(progress, selectedLevel, rawResult, dungeonLevel);
    const finalResult = { ...rawResult, coinsEarned: recorded.awarded };
    setProgress(recorded.progress);
    setDeferredThisResult(recorded.deferred);
    setResult(finalResult);
    playTone(progress.settings.effectsVolume, completed ? 660 : 180, completed ? 0.35 : 0.2);
    setTimeout(() => setScreen("result"), completed ? 650 : 1200);
  }

  function handleCardClick(card: PuzzleCard) {
    if (isResolving || card.matched || flippedIds.includes(card.id)) return;
    if (selectedLevel.isBoss && bossPhase !== "match") return;
    if (flippedIds.length >= 2) return;

    playTone(progress.settings.effectsVolume, 330);
    const nextFlipped = [...flippedIds, card.id];
    setFlippedIds(nextFlipped);

    if (nextFlipped.length !== 2) return;

    const first = cards.find((item) => item.id === nextFlipped[0]);
    if (!first) return;
    const isMatch = first.pairId === card.pairId && first.kind !== card.kind;
    const bothGreenTiles = first.kind === "result" && card.kind === "result";
    const nextTurnsUsed = turnsUsed + 1;
    setTurnsUsed(nextTurnsUsed);
    setIsResolving(true);

    if (isMatch) {
      playTone(progress.settings.effectsVolume, 560, 0.12);
      setTimeout(() => {
        const nextCards = cards.map((item) => (item.pairId === card.pairId ? { ...item, matched: true } : item));
        setCards(nextCards);
        setFlippedIds([]);
        setIsResolving(false);
        const nextMatchedPairs = new Set(nextCards.filter((item) => item.matched).map((item) => item.pairId)).size;
        if (nextMatchedPairs === selectedLevel.pairs) finishLevel(true, nextTurnsUsed);
      }, 350);
      return;
    }

    playTone(progress.settings.effectsVolume, 180, 0.12);
    const nextTurnsRemaining = selectedLevel.isBoss ? turnsRemaining : turnsRemaining - 1;
    setTurnsRemaining(nextTurnsRemaining);
    setTimeout(
      () => {
        setFlippedIds([]);
        setIsResolving(false);
        if (!selectedLevel.isBoss && nextTurnsRemaining <= 0) finishLevel(false, nextTurnsUsed);
      },
      selectedLevel.isBoss ? 500 : getUnitValue(selectedLevel.unit) * 1000 * (bothGreenTiles ? 0.5 : 1),
    );
  }

  useEffect(() => {
    if (!selectedLevel.isBoss || screen !== "game" || hasEndedRef.current) return;

    const timer = window.setInterval(() => {
      setBossSeconds((seconds) => {
        if (seconds > 1) return seconds - 1;
        if (bossPhase === "memorize") {
          setBossPhase("match");
          return bossMatchSeconds;
        }
        finishLevel(false, turnsUsed);
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [bossPhase, screen, selectedLevel.isBoss, turnsUsed]);

  const nextLevel = result?.completed ? findNextUnlocked(progress, selectedLevel, dungeonLevel) : undefined;
  const impossibleIncomeCap = 1000 + 1000 * dungeonLevel;
  const impossibleIncomeEarned = progress.run.trainingIncomeByLevel[String(dungeonLevel)] ?? 0;

  return (
    <main className="app">
      <header className="topbar">
        <div className="training-header-title">
          <p>Mathknight</p>
          <h1>Training Grounds</h1>
        </div>
        <div className="topbar-actions">
          <span className="star-total" aria-label={`${earnedStars} total stars`}>
            <strong>★</strong> {earnedStars} stars
          </span>
          <span className="coin-pill">${progress.coins} coins</span>
        </div>
      </header>

      {progress.run.difficulty === "impossible" && <div className="impossible-training-banner">
        <strong>Impossible income limit — Level {dungeonLevel}</strong>
        <span>${impossibleIncomeEarned} / ${impossibleIncomeCap} earned</span>
        <small>${Math.max(0, impossibleIncomeCap - impossibleIncomeEarned)} available · ${progress.run.deferredTrainingIncome} banked for the next dungeon level</small>
      </div>}


      {screen === "map" && (
        <section className="map-screen">
          <p className="training-map-instruction">Complete lessons to earn Gold. Solving in fewer moves earns a bigger reward</p>
          <div className="unit-grid">
            {units.map((unit) => {
              const unitUnlockState = getUnitUnlockState(progress, unit);
              const expanded = unitUnlockState.unlocked && expandedUnits.has(unit);
              return (
              <section className={`unit-panel ${unitUnlockState.unlocked ? "" : "unit-locked"}`} key={unit}>
                <button
                  className="unit-toggle"
                  type="button"
                  disabled={!unitUnlockState.unlocked}
                  aria-expanded={expanded}
                  onClick={() => toggleUnit(unit)}
                >
                  <span>
                    {unitUnlockState.unlocked
                      ? expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />
                      : <LockKeyhole size={18} />}
                    <strong>{unitLabels[unit]}</strong>
                  </span>
                  {!unitUnlockState.unlocked && <small>Locked: {unitUnlockState.reason}</small>}
                </button>
                {expanded && stages.map((stage) => {
                  const stageUnlockState = getStageUnlockState(progress, unit, stage);
                  return (
                    <div className="stage-row" key={`${unit}_${stage}`}>
                      <div className="stage-label">
                        <strong>
                          {stageLabels[stage]}
                          {!stageUnlockState.unlocked && (
                            <small className="stage-lock">Locked: {stageUnlockState.reason}</small>
                          )}
                        </strong>
                        <span>{formatStageDescription(stage, unit)}</span>
                      </div>
                    <div className="lesson-row">
                      {allLevelConfigs
                        .filter((level) => level.unit === unit && level.stage === stage)
                        .map((level) => {
                          const unlockState = getLevelUnlockState(progress, level, dungeonLevel);
                          const unlocked = unlockState.unlocked;
                          const entry = progress.puzzles[level.id];
                          const replayLocked = progress.run.difficulty === "impossible" && Boolean(entry?.completed);
                          const nextWinCount = (entry?.wins ?? 0) + 1;
                          const minimumReward = calculateCoins(level, 1, nextWinCount);
                          const maximumReward = calculateCoins(level, 5, nextWinCount);
                          return (
                            <button
                              data-testid={`level-${level.id}`}
                              className={`lesson-button ${unlocked && !replayLocked ? "" : "locked"} ${entry?.completed ? "complete" : ""}`}
                              key={level.id}
                              disabled={!unlocked || replayLocked}
                              onClick={() => startLevel(level)}
                            >
                              <span className="lesson-title-row">
                                <span>{levelLabels[level.kind]}</span>
                                {entry?.completed && (
                                  <span className="lesson-stars" aria-label={`${entry.bestStars} out of 5 stars`}>
                                    {Array.from({ length: 5 }, (_, index) => (
                                      <span
                                        className={`lesson-star ${index < entry.bestStars ? "filled" : "empty"}`}
                                        aria-hidden="true"
                                        key={index}
                                      >
                                        {index < entry.bestStars ? "\u2605" : "\u2606"}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </span>
                              <small>
                                {replayLocked
                                  ? "Completed · No replay on Impossible"
                                  : unlocked
                                  ? `$${minimumReward}-$${maximumReward}`
                                  : unlockState.reason === "Requires Dungeon Level 3"
                                    ? "Locked: Requires Dungeon Level 3+"
                                    : "Locked"}
                              </small>
                            </button>
                          );
                        })}
                    </div>
                    </div>
                  );
                })}
              </section>
              );
            })}
          </div>
        </section>
      )}

      {screen === "game" && (
        <section className="game-screen">
          <div className="hud">
            <div>
              <p>{`${unitLabels[selectedLevel.unit]} / ${stageLabels[selectedLevel.stage]}`}</p>
              <h1>{levelLabels[selectedLevel.kind]}</h1>
            </div>
            {selectedLevel.isBoss ? (
              <div className={`timer ${bossSeconds <= 5 ? "danger" : ""}`}>
                <span>{bossPhase === "memorize" ? "Study" : "Match"}</span>
                <strong>{bossSeconds}s</strong>
              </div>
            ) : (
              <div className={`turns ${turnsRemaining <= 5 ? "danger" : turnsRemaining <= 10 ? "warning" : ""}`}>
                <span>Turns Remaining</span>
                <strong>{turnsRemaining}</strong>
              </div>
            )}
            <div className="pairs-pill">{pairsRemaining} pairs left</div>
          </div>

          <div className="board-wrap">
            <div className="board" style={{ gridTemplateColumns: `repeat(${selectedLevel.columns}, minmax(64px, 1fr))` }}>
              {cards.map((card) => {
                const visible = card.matched || flippedIds.includes(card.id) || (selectedLevel.isBoss && bossPhase === "memorize");
                const cardStyle = card.matched
                  ? ({ "--match-color": matchColorByPair.get(card.pairId) } as CSSProperties)
                  : undefined;
                return (
                  <button
                    data-testid={`card-${card.id}`}
                    data-pair-id={card.pairId}
                    data-card-kind={card.kind}
                    className={`card ${visible ? "flipped" : ""} ${card.matched ? "matched" : ""} ${card.kind}`}
                    key={card.id}
                    style={cardStyle}
                    onClick={() => handleCardClick(card)}
                  >
                    <span className="card-front">{card.geometry ? <GeometryCardVisual geometry={card.geometry} /> : card.label}</span>
                    <span className="card-back">?</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {screen === "result" && result && (
        <section className="result-screen">
          <div className="result-panel">
            <p>{result.completed ? "Trial Complete" : "Trial Failed"}</p>
            <h1>{result.completed ? "Victory Recorded" : "Return to Training"}</h1>
            <div className="result-stats">
              <span className="star-rating" aria-label={`${result.stars} out of 5 stars`}>
                {formatStars(result.stars)}
              </span>
              <span>{result.turnsUsed} turns used</span>
              <span>${result.coinsEarned} coins earned</span>
              {deferredThisResult > 0 && <span>${deferredThisResult} banked for the next dungeon level</span>}
              <span>Best: {Math.max(currentProgress.bestStars, result.stars)} stars</span>
            </div>
            <div className="result-actions">
              {!(progress.run.difficulty === "impossible" && result.completed) && <button onClick={() => startLevel(selectedLevel)}>Retry</button>}
              {nextLevel && !(progress.run.difficulty === "impossible" && progress.puzzles[nextLevel.id]?.completed) && <button onClick={() => startLevel(nextLevel as LevelConfig)}>Next Trial</button>}
              {result.completed && <button onClick={() => { setGameMode("reviewing"); setScreen("game"); }}>View Results</button>}
              <button onClick={onDungeon}>Back to Dungeon</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function GeometryCardVisual({ geometry }: { geometry: GeometryVisual }) {
  const shapes: Record<GeometryVisual["shape"], React.ReactNode> = {
    rectangle: <rect x="27" y="20" width="66" height="50" />,
    triangle: <><polygon points="18,70 60,16 102,70" /><line className="geometry-height" x1="60" y1="16" x2="60" y2="70" /></>,
    "obtuse-triangle": <><polygon points="12,70 102,70 82,20" /><line className="geometry-height" x1="82" y1="20" x2="82" y2="70" /></>,
    parallelogram: <><polygon points="32,18 102,18 88,70 18,70" /><line className="geometry-height" x1="32" y1="18" x2="32" y2="70" /></>,
    circle: <circle cx="60" cy="45" r="30" />,
    trapezoid: <><polygon points="38,18 82,18 103,70 17,70" /><line className="geometry-height" x1="38" y1="18" x2="38" y2="70" /></>,
    hexagon: <polygon points="35,14 85,14 108,45 85,76 35,76 12,45" />,
    "l-shape": <polygon points="20,12 96,12 96,42 62,42 62,76 20,76" />,
  };
  const positions = {
    top: [60, 10], bottom: [60, 87], left: [8, 47], right: [112, 47], inside: [60, 50],
    "cutout-horizontal": [79, 35], "cutout-vertical": [70, 59],
  } as const;
  return (
    <svg className="geometry-card-visual" viewBox="0 0 120 92" aria-label={`${geometry.shape} with measurements ${geometry.measurements.map((item) => item.label).join(", ")}`}>
      <g className="geometry-shape">{shapes[geometry.shape]}</g>
      {geometry.measurements.map((measurement, index) => {
        const [x, y] = positions[measurement.position];
        return <text x={x} y={y} key={`${measurement.label}-${index}`}>{measurement.label}</text>;
      })}
    </svg>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
