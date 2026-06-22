import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Home, KeyRound, RotateCcw, Settings, ShoppingBag, Swords, Volume2, VolumeX, X } from "lucide-react";
import DungeonGame from "./dungeon/DungeonGame";
import Quartermaster from "./quartermaster/Quartermaster";
import { allLevels, levelLabels, makeLevelConfig, stageLabels, stages, unitLabels, units } from "./game/levels";
import { generatePuzzle } from "./game/puzzleGenerator";
import {
  blankPuzzleProgress,
  exportProgressCode,
  importProgressCode,
  loadProgress,
  localStorageAvailable,
  recordLevelResult,
  setMuted,
} from "./game/progressStore";
import { calculateCoins, calculateStars, getUnitValue } from "./game/scoring";
import { findNextUnlocked, isLevelUnlocked } from "./game/unlockRules";
import type { GeometryVisual, LevelConfig, LevelResult, PlayerProgress, PuzzleCard } from "./game/types";
import { resetAllGameProgress } from "./game/resetGame";

type Screen = "map" | "game" | "result";

const bossMemorizeSeconds = 30;
const bossMatchSeconds = 15;

function playTone(muted: boolean, frequency: number, duration = 0.08) {
  if (muted) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.value = 0.045;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function formatStageDescription(stage: string, unit?: string) {
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

function MemoryMatchGame({ onExit }: { onExit: () => void }) {
  const [progress, setProgress] = useState<PlayerProgress>(() => loadProgress());
  const [screen, setScreen] = useState<Screen>("map");
  const [selectedLevel, setSelectedLevel] = useState<LevelConfig>(() => makeLevelConfig("addition", "1", "level1"));
  const [cards, setCards] = useState<PuzzleCard[]>([]);
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [turnsRemaining, setTurnsRemaining] = useState(15);
  const [turnsUsed, setTurnsUsed] = useState(0);
  const [result, setResult] = useState<LevelResult | null>(null);
  const [bossPhase, setBossPhase] = useState<"memorize" | "match">("memorize");
  const [bossSeconds, setBossSeconds] = useState(bossMemorizeSeconds);
  const [savePanelOpen, setSavePanelOpen] = useState(false);
  const [saveCodeInput, setSaveCodeInput] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [canAutoSave] = useState(() => localStorageAvailable());
  const hasEndedRef = useRef(false);

  const allLevelConfigs = useMemo(() => allLevels(), []);
  const matchedPairs = useMemo(() => new Set(cards.filter((card) => card.matched).map((card) => card.pairId)).size, [cards]);
  const pairsRemaining = selectedLevel.pairs - matchedPairs;
  const currentProgress = progress.puzzles[selectedLevel.id] ?? blankPuzzleProgress();

  function startLevel(level: LevelConfig) {
    hasEndedRef.current = false;
    setSelectedLevel(level);
    setCards(generatePuzzle(level));
    setFlippedIds([]);
    setIsResolving(false);
    setTurnsRemaining(level.maxTurns ?? 0);
    setTurnsUsed(0);
    setResult(null);
    setBossPhase(level.isBoss ? "memorize" : "match");
    setBossSeconds(level.isBoss ? bossMemorizeSeconds : 0);
    setScreen("game");
  }

  function finishLevel(completed: boolean, finalTurnsUsed = turnsUsed) {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;

    const stars = completed ? calculateStars(selectedLevel.pairs, finalTurnsUsed) : 0;
    const nextWinCount = currentProgress.wins + (completed ? 1 : 0);
    const coinsEarned = completed ? calculateCoins(selectedLevel, stars, nextWinCount) : 0;
    const finalResult = { completed, stars, turnsUsed: finalTurnsUsed, coinsEarned };
    const nextProgress = recordLevelResult(progress, selectedLevel, finalResult);
    setProgress(nextProgress);
    setResult(finalResult);
    playTone(progress.settings.muted, completed ? 660 : 180, completed ? 0.35 : 0.2);
    setTimeout(() => setScreen("result"), completed ? 650 : 1200);
  }

  function handleCardClick(card: PuzzleCard) {
    if (isResolving || card.matched || flippedIds.includes(card.id)) return;
    if (selectedLevel.isBoss && bossPhase !== "match") return;
    if (flippedIds.length >= 2) return;

    playTone(progress.settings.muted, 330);
    const nextFlipped = [...flippedIds, card.id];
    setFlippedIds(nextFlipped);

    if (nextFlipped.length !== 2) return;

    const first = cards.find((item) => item.id === nextFlipped[0]);
    if (!first) return;
    const isMatch = first.pairId === card.pairId && first.kind !== card.kind;
    const nextTurnsUsed = turnsUsed + 1;
    setTurnsUsed(nextTurnsUsed);
    setIsResolving(true);

    if (isMatch) {
      playTone(progress.settings.muted, 560, 0.12);
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

    playTone(progress.settings.muted, 180, 0.12);
    const nextTurnsRemaining = selectedLevel.isBoss ? turnsRemaining : turnsRemaining - 1;
    setTurnsRemaining(nextTurnsRemaining);
    setTimeout(
      () => {
        setFlippedIds([]);
        setIsResolving(false);
        if (!selectedLevel.isBoss && nextTurnsRemaining <= 0) finishLevel(false, nextTurnsUsed);
      },
      selectedLevel.isBoss ? 500 : getUnitValue(selectedLevel.unit) * 1000,
    );
  }

  async function copySaveCode() {
    const code = exportProgressCode(progress);
    setSaveCodeInput(code);
    try {
      await navigator.clipboard.writeText(code);
      setSaveMessage("Knight Code copied.");
    } catch {
      setSaveMessage("Knight Code ready to copy.");
    }
  }

  function restoreSaveCode() {
    try {
      const nextProgress = importProgressCode(saveCodeInput);
      setProgress(nextProgress);
      setScreen("map");
      setSaveMessage("Progress restored.");
    } catch {
      setSaveMessage("That Knight Code did not work.");
    }
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

  const nextLevel = result?.completed ? findNextUnlocked(progress, selectedLevel) : undefined;

  return (
    <main className="app">
      <header className="topbar">
        <button className="icon-button" aria-label="Return to game hall" onClick={onExit}>
          <ArrowLeft size={20} />
        </button>
        <button className="brand" onClick={() => setScreen("map")}>
          Mathknight
        </button>
        <div className="topbar-actions">
          <span className="coin-pill">${progress.coins} coins</span>
          <button
            className="icon-button"
            aria-label={progress.settings.muted ? "Unmute sounds" : "Mute sounds"}
            onClick={() => setProgress(setMuted(progress, !progress.settings.muted))}
          >
            {progress.settings.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <button
            className="icon-button"
            aria-label="Open Knight Code saves"
            onClick={() => {
              setSavePanelOpen(true);
              setSaveMessage("");
            }}
          >
            <KeyRound size={20} />
          </button>
          <button className="icon-button" aria-label="Back to menu" onClick={() => setScreen("map")}>
            <Home size={20} />
          </button>
        </div>
      </header>

      {!canAutoSave && (
        <div className="storage-warning">Local auto-save is blocked here. Use a Knight Code to back up progress.</div>
      )}

      {savePanelOpen && (
        <div className="modal-backdrop">
          <section className="save-panel" role="dialog" aria-modal="true" aria-labelledby="save-panel-title">
            <div className="save-panel-heading">
              <div>
                <p>Backup & Restore</p>
                <h2 id="save-panel-title">Knight Code</h2>
              </div>
              <button className="icon-button" aria-label="Close Knight Code saves" onClick={() => setSavePanelOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <p className="save-panel-copy">
              Progress saves automatically on this device. Keep a Knight Code as a backup or use it on another device.
            </p>
            <textarea
              aria-label="Knight Code"
              value={saveCodeInput}
              onChange={(event) => {
                setSaveCodeInput(event.target.value);
                setSaveMessage("");
              }}
              placeholder="Your Knight Code appears here"
              spellCheck={false}
            />
            {saveMessage && <div className="save-message" role="status">{saveMessage}</div>}
            <div className="save-actions">
              <button onClick={copySaveCode}>Show & Copy Code</button>
              <button onClick={restoreSaveCode} disabled={!saveCodeInput.trim()}>
                Load Code
              </button>
              <button onClick={() => setSavePanelOpen(false)}>Done</button>
            </div>
          </section>
        </div>
      )}

      {screen === "map" && (
        <section className="map-screen">
          <div className="page-heading">
            <p>Training Grounds</p>
            <h1>Arithmetic Memory Trials</h1>
          </div>
          <div className="unit-grid">
            {units.map((unit) => (
              <section className="unit-panel" key={unit}>
                <h2>{unitLabels[unit]}</h2>
                {stages.map((stage) => (
                  <div className="stage-row" key={`${unit}_${stage}`}>
                    <div className="stage-label">
                      <strong>{stageLabels[stage]}</strong>
                      <span>{formatStageDescription(stage, unit)}</span>
                    </div>
                    <div className="lesson-row">
                      {allLevelConfigs
                        .filter((level) => level.unit === unit && level.stage === stage)
                        .map((level) => {
                          const unlocked = isLevelUnlocked(progress, level);
                          const entry = progress.puzzles[level.id];
                          const nextWinCount = (entry?.wins ?? 0) + 1;
                          const minimumReward = calculateCoins(level, 1, nextWinCount);
                          const maximumReward = calculateCoins(level, 5, nextWinCount);
                          return (
                            <button
                              data-testid={`level-${level.id}`}
                              className={`lesson-button ${unlocked ? "" : "locked"} ${entry?.completed ? "complete" : ""}`}
                              key={level.id}
                              disabled={!unlocked}
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
                              <small>{unlocked ? `$${minimumReward}-$${maximumReward}` : "Locked"}</small>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </section>
            ))}
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
                return (
                  <button
                    data-testid={`card-${card.id}`}
                    data-pair-id={card.pairId}
                    data-card-kind={card.kind}
                    className={`card ${visible ? "flipped" : ""} ${card.matched ? "matched" : ""} ${card.kind}`}
                    key={card.id}
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
              <span>Best: {Math.max(currentProgress.bestStars, result.stars)} stars</span>
            </div>
            <div className="result-actions">
              <button onClick={() => startLevel(selectedLevel)}>Retry</button>
              {nextLevel && <button onClick={() => startLevel(nextLevel as LevelConfig)}>Next Trial</button>}
              <button onClick={() => setScreen("map")}>Training Grounds</button>
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

type GameDestination = "hub" | "memory" | "battle" | "quartermaster";

export default function App() {
  const [destination, setDestination] = useState<GameDestination>("hub");

  function startNewGame() {
    const confirmed = window.confirm(
      "Start a new game? This will permanently reset the dungeon, deck, coins, and all Training Grounds progress.",
    );
    if (!confirmed) return;
    resetAllGameProgress();
    window.location.reload();
  }

  if (destination === "memory") return <MemoryMatchGame onExit={() => setDestination("hub")} />;
  if (destination === "battle") return <DungeonGame onExit={() => setDestination("hub")} />;
  if (destination === "quartermaster") return <Quartermaster onExit={() => setDestination("hub")} onTraining={() => setDestination("memory")} />;

  return (
    <main className="game-hub">
      <header className="hub-header">
        <div>
          <p>Mathknight</p>
          <h1>Choose Your Path</h1>
        </div>
        <button className="new-game-button" onClick={startNewGame}>
          <RotateCcw size={18} /> New Game
        </button>
      </header>
      <section className="hub-destinations" aria-label="Game destinations">
        <button className="hub-destination battle-destination" onClick={() => setDestination("battle")}>
          <Swords size={30} />
          <span><strong>Dungeon Battle</strong><small>Build expressions. Counter monsters.</small></span>
        </button>
        <button className="hub-destination memory-destination" onClick={() => setDestination("memory")}>
          <span className="hub-grid-icon" aria-hidden="true">2+3</span>
          <span><strong>Training Grounds</strong><small>Match arithmetic pairs. Earn coins.</small></span>
        </button>
        <button className="hub-destination" onClick={() => setDestination("quartermaster")}>
          <ShoppingBag size={30} />
          <span><strong>Quartermaster</strong><small>Spend coins on permanent upgrades.</small></span>
        </button>
        <button className="hub-destination" disabled>
          <Settings size={30} />
          <span><strong>Settings</strong><small>Coming later</small></span>
        </button>
      </section>
    </main>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
