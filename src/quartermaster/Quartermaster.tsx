import { ArrowLeft, FlaskConical, HeartPulse, HelpCircle, RotateCcw, Scissors, ShieldPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { allLevels, stageLabels, stages, unitLabels, units } from "../game/levels";
import { loadProgress, saveProgress } from "../game/progressStore";
import { isLevelUnlocked } from "../game/unlockRules";
import type { PlayerProgress, Stage, Unit } from "../game/types";
import { increaseRunHealth, loadPermanentLoadout, printedEnergyCost, savePermanentLoadout, syncRunDeck, type PermanentLoadout } from "./quartermasterStore";

type SelectionMode = "bottle" | "remove" | null;

const resetPrices: Record<Unit, Record<Stage, number>> = {
  addition: { "1": 50, "2": 75, "3a": 100, "3b": 100, "4": 150 },
  subtraction: { "1": 60, "2": 90, "3a": 120, "3b": 120, "4": 180 },
  multiplication: { "1": 80, "2": 120, "3a": 160, "3b": 160, "4": 240 },
  division: { "1": 100, "2": 150, "3a": 200, "3b": 200, "4": 300 },
  fractions: { "1": 120, "2": 180, "3a": 240, "3b": 240, "4": 360 },
};

export default function Quartermaster({ onExit, onTraining }: { onExit: () => void; onTraining: () => void }) {
  const [progress, setProgress] = useState<PlayerProgress>(loadProgress);
  const [loadout, setLoadout] = useState<PermanentLoadout>(loadPermanentLoadout);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const levels = useMemo(allLevels, []);
  const bottleUpgradeCost = 100 * (loadout.bottleUpgradeCount + 1);
  const removalCost = 50 * (loadout.removalPurchases + 1);
  const mendingCost = 50 * (loadout.mendingUpgradeCount + 1);
  const nextMendingIncrease = loadout.mendingUpgradeCount + 2;
  const growCost = 100 * (loadout.growPurchases + 1);

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

  function selectBottle(deckIndex: number) {
    if (!afford(50)) return;
    const selected = loadout.deck[deckIndex];
    if (!selected) return;
    const nextDeck = [...loadout.deck];
    nextDeck.splice(deckIndex, 1, loadout.bottledCard);
    spend(50);
    saveLoadout({ ...loadout, deck: nextDeck, bottledCard: selected });
    syncRunDeck((deck) => {
      const next = [...deck];
      const runIndex = next.findIndex((card) => card.id === selected.id);
      if (runIndex >= 0) next.splice(runIndex, 1, loadout.bottledCard);
      return next;
    });
    setSelectionMode(null);
  }

  function removeCard(deckIndex: number) {
    if (!afford(removalCost)) return;
    const selected = loadout.deck[deckIndex];
    if (!selected) return;
    const nextDeck = [...loadout.deck];
    nextDeck.splice(deckIndex, 1);
    spend(removalCost);
    saveLoadout({ ...loadout, deck: nextDeck, removalPurchases: loadout.removalPurchases + 1 });
    syncRunDeck((deck) => {
      const next = [...deck];
      const runIndex = next.findIndex((card) => card.id === selected.id);
      if (runIndex >= 0) next.splice(runIndex, 1);
      return next;
    });
    setSelectionMode(null);
  }

  function resetTraining(unit: Unit, stage: Stage) {
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

  const selectableCards = loadout.deck
    .map((card, deckIndex) => ({ card, deckIndex }))
    .filter(({ card }) => selectionMode !== "bottle" || printedEnergyCost(card) <= loadout.bottleMaxCost);

  return (
    <main className="quartermaster-screen">
      <header className="quartermaster-header">
        <button className="icon-button" aria-label="Return to game hall" onClick={onExit}><ArrowLeft size={20} /></button>
        <div><p>Permanent Upgrades</p><h1>Quartermaster</h1></div>
        <strong>${progress.coins} coins</strong>
      </header>

      {selectionMode && (
        <section className="quartermaster-picker">
          <div><p>{selectionMode === "bottle" ? "Choose a card that fits the bottle." : "Choose a card to remove forever."}</p><button onClick={() => setSelectionMode(null)}>Cancel</button></div>
          <div className="quartermaster-card-grid">
            {selectableCards.map(({ card, deckIndex }) => (
              <button key={`${card.id}-${deckIndex}`} onClick={() => selectionMode === "bottle" ? selectBottle(deckIndex) : removeCard(deckIndex)}>
                <strong>{card.label}</strong><span>{printedEnergyCost(card)} printed Energy</span><small>{card.rarity}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="quartermaster-options">
        <button className="quartermaster-option" onClick={() => setSelectionMode("bottle")}>
          <FlaskConical size={28} /><span><strong>Change Bottled Card</strong><small>Max {loadout.bottleMaxCost} Energy Cost</small></span><b>$50</b>
        </button>
        <button className="quartermaster-option" onClick={upgradeBottle}>
          <FlaskConical size={28} /><span><strong>Upgrade Bottle</strong><small>Max Energy Cost {loadout.bottleMaxCost} → {loadout.bottleMaxCost + 1}</small></span><b>${bottleUpgradeCost}</b>
        </button>
        <button className="quartermaster-option locked" disabled>
          <HelpCircle size={28} /><span><strong>Locked</strong><small>Requires Level 4</small></span><b>???</b>
        </button>
        <button className="quartermaster-option" onClick={() => setSelectionMode("remove")}>
          <Scissors size={28} /><span><strong>Remove a Card</strong><small>Permanently thin your base deck</small></span><b>${removalCost}</b>
        </button>
        <button className="quartermaster-option" onClick={upgradeMending}>
          <HeartPulse size={28} /><span><strong>Upgrade Mending</strong><small>Heal {loadout.mendingHealing} → {loadout.mendingHealing + nextMendingIncrease} after battle</small></span><b>${mendingCost}</b>
        </button>
        <button className="quartermaster-option" onClick={grow}>
          <ShieldPlus size={28} /><span><strong>Grow</strong><small>Maximum HP {loadout.maxHealth} → {loadout.maxHealth + 10}</small></span><b>${growCost}</b>
        </button>
      </section>

      <section className="training-reset-section">
        <div className="section-heading"><RotateCcw size={22} /><div><p>Prize Restoration</p><h2>Reset Training Grounds</h2></div></div>
        {units.map((unit) => (
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
