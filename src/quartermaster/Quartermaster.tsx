import { FlaskConical, HeartPulse, RefreshCw, RotateCcw, ShieldCheck, ShieldPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import GameCard from "../battle/GameCard";
import { allLevels, stageLabels, stages, unitLabels, units } from "../game/levels";
import { difficultyLabel, loadProgress, saveProgress } from "../game/progressStore";
import { isLevelUnlocked } from "../game/unlockRules";
import type { PlayerProgress, Stage, Unit } from "../game/types";
import { bottleCapacityCost, increaseRunHealth, loadPermanentLoadout, loadRunBottle, loadRunDeck, markQuartermasterVisited, savePermanentLoadout, saveRunBottle, syncRunDeck, type PermanentLoadout } from "./quartermasterStore";

type SelectionMode = "bottle" | null;

const resetPrices: Record<Unit, Record<Stage, number>> = {
  addition: { "1": 50, "2": 75, "3a": 100, "3b": 100, "4": 150 },
  subtraction: { "1": 60, "2": 90, "3a": 120, "3b": 120, "4": 180 },
  multiplication: { "1": 80, "2": 120, "3a": 160, "3b": 160, "4": 240 },
  division: { "1": 100, "2": 150, "3a": 200, "3b": 200, "4": 300 },
  fractions: { "1": 120, "2": 180, "3a": 240, "3b": 240, "4": 360 },
  geometry: { "1": 120, "2": 180, "3a": 240, "3b": 240, "4": 360 },
  perfectSquares: { "1": 140, "2": 210, "3a": 280, "3b": 280, "4": 420 },
  algebra: { "1": 140, "2": 210, "3a": 280, "3b": 280, "4": 420 },
};

export default function Quartermaster({ onExit, onTraining }: { onExit: () => void; onTraining: () => void }) {
  const [progress, setProgress] = useState<PlayerProgress>(loadProgress);
  const [loadout, setLoadout] = useState<PermanentLoadout>(loadPermanentLoadout);
  const [activeDeck, setActiveDeck] = useState(loadRunDeck);
  const [runBottle, setRunBottle] = useState(loadRunBottle);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const levels = useMemo(allLevels, []);
  const bottleUpgradeCost = 100 * (loadout.bottleUpgradeCount + 1);
  const mendingCost = 50 * (loadout.mendingUpgradeCount + 1);
  const nextMendingIncrease = loadout.mendingUpgradeCount + 2;
  const growCost = 100 * (loadout.growPurchases + 1);
  const resourcefulnessCost = loadout.resourcefulnessUpgradeCount === 0 ? 250 : 500;
  const canUpgradeResourcefulness = loadout.dungeonLevel >= 2 && loadout.resourcefulnessUpgradeCount < 2;
  const canUpgradeHeroicWill = loadout.dungeonLevel >= 4 && loadout.heroicWillUpgradeCount < 1;

  useEffect(() => {
    markQuartermasterVisited();
  }, []);

  function afford(cost: number) {
    if (progress.coins >= cost) return true;
    if (window.confirm(`You need $${cost - progress.coins} more. Go to the Training Grounds?`)) onTraining();
    return false;
  }

  function spend(cost: number) {
    const next = { ...progress, coins: progress.coins - cost };
    saveProgress(next);
    setProgress(next);
  }

  function saveLoadout(next: PermanentLoadout) {
    savePermanentLoadout(next);
    setLoadout(next);
  }

  function upgradeBottle() {
    if (!afford(bottleUpgradeCost)) return;
    spend(bottleUpgradeCost);
    saveLoadout({ ...loadout, bottleMaxCost: loadout.bottleMaxCost + 1, bottleUpgradeCount: loadout.bottleUpgradeCount + 1 });
  }

  function upgradeMending() {
    if (!afford(mendingCost)) return;
    spend(mendingCost);
    saveLoadout({
      ...loadout,
      mendingHealing: loadout.mendingHealing + nextMendingIncrease,
      mendingUpgradeCount: loadout.mendingUpgradeCount + 1,
    });
  }

  function grow() {
    if (!afford(growCost)) return;
    const nextMaxHealth = loadout.maxHealth + 10;
    spend(growCost);
    increaseRunHealth(10, nextMaxHealth);
    saveLoadout({ ...loadout, maxHealth: nextMaxHealth, growPurchases: loadout.growPurchases + 1 });
  }

  function upgradeResourcefulness() {
    if (!canUpgradeResourcefulness || !afford(resourcefulnessCost)) return;
    spend(resourcefulnessCost);
    saveLoadout({
      ...loadout,
      resourcefulnessUses: loadout.resourcefulnessUses + 1,
      resourcefulnessUpgradeCount: loadout.resourcefulnessUpgradeCount + 1,
    });
  }

  function upgradeHeroicWill() {
    if (!canUpgradeHeroicWill || !afford(1000)) return;
    spend(1000);
    saveLoadout({ ...loadout, heroicWillUses: 2, heroicWillUpgradeCount: 1 });
  }

  function selectBottle(selected: PermanentLoadout["bottledCard"]) {
    if (!afford(50)) return;
    spend(50);
    let nextActiveDeck = activeDeck;
    syncRunDeck((deck) => {
      const next = [...deck];
      const runIndex = next.findIndex((card) => card.id === selected.id);
      if (runIndex >= 0) next.splice(runIndex, 1, runBottle);
      nextActiveDeck = next;
      return next;
    });
    saveRunBottle(selected);
    setRunBottle(selected);
    setActiveDeck(nextActiveDeck);
    setSelectionMode(null);
  }

  function resetTraining(unit: Unit, stage: Stage) {
    if (progress.run.difficulty !== "normal") return;
    const cost = resetPrices[unit][stage];
    if (!afford(cost)) return;
    const puzzleIds = levels.filter((level) => level.unit === unit && level.stage === stage).map((level) => level.id);
    const puzzles = { ...progress.puzzles };
    puzzleIds.forEach((id) => {
      const entry = puzzles[id];
      if (entry) puzzles[id] = { ...entry, wins: 0 };
    });
    const next = { ...progress, coins: progress.coins - cost, puzzles };
    saveProgress(next);
    setProgress(next);
  }

  const bottleCandidates = [
    { card: runBottle, bottled: true },
    ...activeDeck.map((card) => ({ card, bottled: false })),
  ];

  return (
    <main className="quartermaster-screen">
      <header className="quartermaster-header">
        <div><p>Permanent Upgrades</p><h1>Quartermaster</h1></div>
        <strong>${progress.coins} coins</strong>
      </header>

      {selectionMode && (
        <section className="quartermaster-picker">
          <div><p>Choose any card using up to {loadout.bottleMaxCost} Capacity.</p><button onClick={() => setSelectionMode(null)}>Cancel</button></div>
          <div className="quartermaster-card-grid">
            {bottleCandidates.map(({ card, bottled }) => {
              const cost = bottleCapacityCost(card);
              const tooExpensive = cost > loadout.bottleMaxCost;
              return (
                <div className={`bottle-candidate ${bottled ? "current" : ""}`} key={`${card.id}-${bottled ? "bottled" : "deck"}`}>
                  <GameCard
                    card={card}
                    onClick={() => {
                      if (!bottled && !tooExpensive) selectBottle(card);
                    }}
                    disabled={tooExpensive}
                    bottled={bottled}
                    badge={tooExpensive ? `${cost} capacity: too expensive` : `${cost} capacity`}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="quartermaster-options">
        <button className="quartermaster-option" onClick={() => setSelectionMode("bottle")}>
          <FlaskConical size={28} /><span><strong>Change Bottled Card</strong><small>Max {loadout.bottleMaxCost} Capacity</small></span><b>$50</b>
        </button>
        <button className="quartermaster-option" onClick={upgradeBottle}>
          <FlaskConical size={28} /><span><strong>Upgrade Bottle</strong><small>Max Capacity {loadout.bottleMaxCost} → {loadout.bottleMaxCost + 1}</small></span><b>${bottleUpgradeCost}</b>
        </button>
        <button className={`quartermaster-option ${canUpgradeResourcefulness ? "" : "locked"}`} disabled={!canUpgradeResourcefulness} onClick={upgradeResourcefulness}>
          <RefreshCw size={28} /><span><strong>Resourcefulness</strong><small>{loadout.dungeonLevel < 2 ? "Locked: Level 2" : loadout.resourcefulnessUpgradeCount >= 2 ? "Maximum: 3 uses per fight" : `${loadout.resourcefulnessUses} → ${loadout.resourcefulnessUses + 1} uses per fight`}</small></span><b>{loadout.dungeonLevel < 2 || loadout.resourcefulnessUpgradeCount >= 2 ? "—" : `$${resourcefulnessCost}`}</b>
        </button>
        <button className={`quartermaster-option ${canUpgradeHeroicWill ? "" : "locked"}`} disabled={!canUpgradeHeroicWill} onClick={upgradeHeroicWill}>
          <ShieldCheck size={28} /><span><strong>Heroic Will</strong><small>{loadout.dungeonLevel < 4 ? "Locked: Level 4" : loadout.heroicWillUpgradeCount >= 1 ? "Maximum: 2 uses per fight" : "1 → 2 uses per fight"}</small></span><b>{loadout.dungeonLevel < 4 || loadout.heroicWillUpgradeCount >= 1 ? "—" : "$1000"}</b>
        </button>
        <button className="quartermaster-option" onClick={upgradeMending}>
          <HeartPulse size={28} /><span><strong>Upgrade Mending</strong><small>Heal {loadout.mendingHealing} → {loadout.mendingHealing + nextMendingIncrease} after battle</small></span><b>${mendingCost}</b>
        </button>
        <button className="quartermaster-option" onClick={grow}>
          <ShieldPlus size={28} /><span><strong>Grow</strong><small>Maximum HP {loadout.maxHealth} → {loadout.maxHealth + 10}</small></span><b>${growCost}</b>
        </button>
      </section>

      <section className={`training-reset-section ${progress.run.difficulty === "normal" ? "" : "locked"}`}>
        <div className="section-heading"><RotateCcw size={22} /><div><p>Prize Restoration</p><h2>Reset Training Grounds</h2></div></div>
        {progress.run.difficulty !== "normal" && (
          <p className="training-reset-unavailable">Not available at {difficultyLabel(progress.run.difficulty)} Difficulty</p>
        )}
        {progress.run.difficulty === "normal" && units.map((unit) => (
          <div className="training-reset-row" key={unit}>
            <strong>{unitLabels[unit]}</strong>
            <div>{stages.map((stage) => {
              const groupLevels = levels.filter((level) => level.unit === unit && level.stage === stage);
              const unlocked = groupLevels.some((level) => isLevelUnlocked(progress, level));
              const played = groupLevels.some((level) => (progress.puzzles[level.id]?.wins ?? 0) > 0);
              const available = unlocked && played;
              return <button className={available ? "" : "locked"} disabled={!available} key={stage} onClick={() => resetTraining(unit, stage)}>
                <span>{stageLabels[stage]}</span><small>{available ? `$${resetPrices[unit][stage]}` : unlocked ? "No decay" : "Locked"}</small>
              </button>;
            })}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
