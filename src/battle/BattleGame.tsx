import { ArrowLeft, HeartPulse, Shield, Swords, Volume2, VolumeX, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { playBattleSound, startBattleMusic, stopBattleMusic } from "./battleAudio";
import { cardById, cardsEligibleForRewards } from "./cardCatalog";
import { loadPermanentLoadout } from "../quartermaster/quartermasterStore";
import {
  applyCardUpgrade, applyDamage, canApplyUpgrade, drawHand, evaluateExpression, expressionEnergy, expressionUpgradeEffects,
  makeCatalogEntry, migrateBattleCard, resolveExpressionTokens, rollAny, rollEnemyIntent, shuffle, type BattleCard,
} from "./battleEngine";

type BattlePhase = "playing" | "resolving" | "victory" | "defeat" | "reward" | "upgrade";
type BattleState = ReturnType<typeof createBattle>;
type BattleSession = {
  battle: BattleState;
  selectedCards: BattleCard[];
  bottleUsed: boolean;
  phase: BattlePhase;
  message: string;
  error: string;
  turn: number;
  chosenReward: BattleCard | null;
  rewards: BattleCard[];
};

const battleSessionKey = "mathknight.battle.session.v1";
const runDeckKey = "mathknight.dungeon.runDeck.v1";
const runHealthKey = "mathknight.dungeon.runHealth.v1";
const enemyMaxHealth = 30;
const maxEnergy = 3;

function loadRunDeck() {
  try {
    const raw = window.localStorage.getItem(runDeckKey);
    if (!raw) return loadPermanentLoadout().deck;
    return (JSON.parse(raw) as BattleCard[]).map(migrateBattleCard);
  } catch {
    return loadPermanentLoadout().deck;
  }
}

function saveRunDeck(deck: BattleCard[]) {
  window.localStorage.setItem(runDeckKey, JSON.stringify(deck));
}

function resetRunDeck() {
  saveRunDeck(loadPermanentLoadout().deck);
}

function loadRunHealth(maxHealth: number) {
  const savedHealth = Number(window.localStorage.getItem(runHealthKey));
  return savedHealth > 0 ? Math.min(maxHealth, savedHealth) : maxHealth;
}

function saveRunHealth(health: number) {
  window.localStorage.setItem(runHealthKey, String(health));
}

function createBattle() {
  const loadout = loadPermanentLoadout();
  const opening = drawHand(shuffle(loadRunDeck()), []);
  return {
    ...opening,
    bottledCard: loadPermanentLoadout().bottledCard,
    playerHealth: loadRunHealth(loadout.maxHealth),
    playerMaxHealth: loadout.maxHealth,
    mendingHealing: loadout.mendingHealing,
    playerArmor: 0,
    enemyHealth: enemyMaxHealth,
    enemyArmor: 0,
    enemyIntent: rollEnemyIntent(),
    enemyStunned: false,
    weakenNext: 0,
  };
}

function createBattleSession(): BattleSession {
  const rewardPool = shuffle(cardsEligibleForRewards()).slice(0, 3).map((definition) => makeCatalogEntry(definition.name));
  return {
    battle: createBattle(),
    selectedCards: [],
    bottleUsed: false,
    phase: "playing",
    message: "The moss brute raises its club.",
    error: "",
    turn: 1,
    chosenReward: null,
    rewards: rewardPool,
  };
}

function loadBattleSession() {
  try {
    const raw = window.localStorage.getItem(battleSessionKey);
    if (!raw) return createBattleSession();
    const parsed = JSON.parse(raw) as BattleSession;
    if (!parsed.battle?.hand || !parsed.rewards || typeof parsed.turn !== "number") return createBattleSession();
    return {
      ...parsed,
      battle: {
        ...parsed.battle,
        hand: parsed.battle.hand.map(migrateBattleCard),
        drawPile: parsed.battle.drawPile.map(migrateBattleCard),
        discardPile: parsed.battle.discardPile.map(migrateBattleCard),
        bottledCard: migrateBattleCard(parsed.battle.bottledCard),
        playerArmor: parsed.battle.playerArmor ?? 0,
        enemyArmor: parsed.battle.enemyArmor ?? 0,
        enemyStunned: parsed.battle.enemyStunned ?? false,
        weakenNext: parsed.battle.weakenNext ?? 0,
        playerMaxHealth: parsed.battle.playerMaxHealth ?? loadPermanentLoadout().maxHealth,
        mendingHealing: parsed.battle.mendingHealing ?? loadPermanentLoadout().mendingHealing,
      },
      selectedCards: parsed.selectedCards.map(migrateBattleCard),
      rewards: parsed.rewards.map(migrateBattleCard),
      chosenReward: parsed.chosenReward ? migrateBattleCard(parsed.chosenReward) : null,
      phase: parsed.phase === "resolving" ? "playing" : parsed.phase,
    };
  } catch {
    return createBattleSession();
  }
}

function clearBattleSession() {
  window.localStorage.removeItem(battleSessionKey);
}

export default function BattleGame({ onExit, onComplete }: { onExit: () => void; onComplete: (won: boolean) => void }) {
  const restoredSession = useMemo(loadBattleSession, []);
  const [battle, setBattle] = useState(restoredSession.battle);
  const [selectedCards, setSelectedCards] = useState<BattleCard[]>(restoredSession.selectedCards);
  const [bottleUsed, setBottleUsed] = useState(restoredSession.bottleUsed);
  const [phase, setPhase] = useState<BattlePhase>(restoredSession.phase);
  const [message, setMessage] = useState(restoredSession.message);
  const [error, setError] = useState(restoredSession.error);
  const [turn, setTurn] = useState(restoredSession.turn);
  const [chosenReward, setChosenReward] = useState<BattleCard | null>(restoredSession.chosenReward);
  const [rewards] = useState<BattleCard[]>(restoredSession.rewards);
  const [musicOn, setMusicOn] = useState(true);
  const [impact, setImpact] = useState<"enemy" | "hero" | "counter" | "victory" | "defeat" | null>(null);
  const [pileView, setPileView] = useState<"deck" | "discard" | null>(null);
  const [runDeck, setRunDeck] = useState<BattleCard[]>(loadRunDeck);
  const energyUsed = useMemo(() => expressionEnergy(selectedCards), [selectedCards]);
  const consumedEnergy = battle.hand.filter((card) => card.consumedThisTurn).length;
  const availableEnergy = maxEnergy + consumedEnergy;
  const upgradeEffects = useMemo(() => expressionUpgradeEffects(selectedCards), [selectedCards]);
  const weakenStacks = battle.weakenNext + upgradeEffects.weaken;
  const weakenPerStack = Math.max(1, Math.round(battle.enemyIntent * 0.1));
  const displayedIntent = battle.enemyStunned
    ? 0
    : Math.max(0, battle.enemyIntent - weakenPerStack * weakenStacks);
  const previewResult = useMemo(() => {
    try {
      return evaluateExpression(selectedCards, { turn, level: 1 });
    } catch {
      return null;
    }
  }, [selectedCards, turn]);
  const counterReady = previewResult !== null && previewResult === displayedIntent;
  const expressionItems = useMemo(() => {
    try {
      return resolveExpressionTokens(selectedCards, { turn, level: 1 }).map((token) => ({
        label: token.kind === "number" ? String(token.value) : token.kind === "left" ? "(" : token.kind === "right" ? ")" : token.operator ?? "",
        sourceIds: token.sourceIds,
      }));
    } catch {
      return selectedCards.map((card) => ({ label: card.lockedValue === undefined ? card.label : `^${card.lockedValue}`, sourceIds: [card.id] }));
    }
  }, [selectedCards, turn]);
  const viewedPile = pileView === "deck"
    ? [...battle.drawPile].sort((left, right) => cardSequence(left) - cardSequence(right))
    : [...battle.discardPile].reverse();

  useEffect(() => () => stopBattleMusic(), []);

  useEffect(() => {
    const session: BattleSession = { battle, selectedCards, bottleUsed, phase, message, error, turn, chosenReward, rewards };
    window.localStorage.setItem(battleSessionKey, JSON.stringify(session));
  }, [battle, selectedCards, bottleUsed, phase, message, error, turn, chosenReward, rewards]);

  function wakeAudio() {
    if (musicOn) startBattleMusic();
  }

  function addCard(card: BattleCard, bottled = false) {
    if (phase !== "playing" || selectedCards.some((selected) => selected.id === card.id)) return;
    const remainingEnergy = availableEnergy - energyUsed;
    const playedCard = card.label === "L" ? { ...card, energy: 1 }
      : card.label === "()" ? { ...card, label: "(", token: "(" } : card;
    if (energyUsed + playedCard.energy > availableEnergy) {
      setError("Not enough energy for that card.");
      return;
    }
    setSelectedCards((current) => [...current, playedCard]);
    if (card.label === "()") {
      const closingCard: BattleCard = { ...card, id: `${card.id}-close`, label: ")", token: ")", energy: 0, generatedById: card.id };
      setBattle((current) => ({ ...current, hand: [...current.hand, closingCard] }));
    }
    wakeAudio();
    playBattleSound("card");
    if (bottled) setBottleUsed(true);
    setError("");
  }

  function removeCard(card: BattleCard) {
    if (phase !== "playing") return;
    setSelectedCards((current) => current.filter((selected) => selected.id !== card.id));
    wakeAudio();
    playBattleSound("card");
    if (card.id === battle.bottledCard.id) setBottleUsed(false);
    setError("");
  }

  function removeExpressionItem(sourceIds: string[]) {
    if (phase !== "playing") return;
    const removedOpenIds = selectedCards.filter((card) => sourceIds.includes(card.id) && card.label === "(").map((card) => card.id);
    setSelectedCards((current) => current.filter((card) => !sourceIds.includes(card.id) && !removedOpenIds.includes(card.generatedById ?? "")));
    if (removedOpenIds.length > 0) {
      setBattle((current) => ({ ...current, hand: current.hand.filter((card) => !removedOpenIds.includes(card.generatedById ?? "")) }));
    }
    if (sourceIds.includes(battle.bottledCard.id)) setBottleUsed(false);
    playBattleSound("card");
    setError("");
  }

  function cycleCard(card: BattleCard) {
    if (phase !== "playing" || selectedCards.some((selected) => selected.id === card.id)) return;
    const replacement = drawHand(battle.drawPile, battle.discardPile, 1);
    setBattle((current) => ({
      ...current,
      hand: [...current.hand.filter((item) => item.id !== card.id), ...replacement.hand],
      drawPile: replacement.drawPile,
      discardPile: [...replacement.discardPile, card],
    }));
    playBattleSound("card");
  }

  function toggleConsumable(card: BattleCard) {
    if (phase !== "playing" || selectedCards.some((selected) => selected.id === card.id)) return;
    setBattle((current) => ({
      ...current,
      hand: current.hand.map((item) => item.id === card.id ? { ...item, consumedThisTurn: !item.consumedThisTurn } : item),
    }));
    playBattleSound("card");
  }

  function submitExpression() {
    if (phase !== "playing") return;
    let value: number;
    try {
      value = evaluateExpression(selectedCards, { turn, level: 1 });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Try a different expression.");
      return;
    }

    if (!Number.isFinite(value)) {
      const divisionCard = selectedCards.find((card) => card.label === "/");
      if (!divisionCard || !window.confirm("Dividing by zero will win this battle, but the division card will be lost forever. Continue?")) return;
      const nextDeck = runDeck.filter((card) => card.id !== divisionCard.id);
      saveRunDeck(nextDeck);
      setRunDeck(nextDeck);
    }

    setError("");
    setPhase("resolving");
    const countered = value === displayedIntent;
    const criticalHit = rollAny(upgradeEffects.critAttempts, 0.2);
    const baseDamage = countered ? displayedIntent : value;
    const outgoingDamage = Math.round(baseDamage * (criticalHit ? 1.5 : 1));
    const enemyHit = applyDamage(battle.enemyHealth, battle.enemyArmor, outgoingDamage);
    const armorAfterExpression = battle.playerArmor + upgradeEffects.armor;
    const playerHit = countered || enemyHit.health === 0
      ? { health: battle.playerHealth, armor: armorAfterExpression, damage: 0 }
      : applyDamage(battle.playerHealth, armorAfterExpression, displayedIntent);
    const reflectedDamage = upgradeEffects.reflecting ? Math.round(playerHit.damage * 0.5) : 0;
    const reflectedHit = reflectedDamage > 0 ? applyDamage(enemyHit.health, enemyHit.armor, reflectedDamage) : enemyHit;
    const stunnedNext = rollAny(upgradeEffects.bashAttempts, 0.1);
    setMessage(countered
      ? `Perfect counter! ${outgoingDamage} damage reflected${criticalHit ? " with a critical hit" : ""}.`
      : `You strike for ${enemyHit.damage}${criticalHit ? " with a critical hit" : ""}. The brute answers for ${playerHit.damage}${reflectedDamage ? ` and suffers ${reflectedDamage} reflected` : ""}.`);
    wakeAudio();
    setImpact(countered ? "counter" : "enemy");
    playBattleSound(countered ? "counter" : "enemy-hit");
    setBattle((current) => ({ ...current, enemyHealth: reflectedHit.health, enemyArmor: reflectedHit.armor, playerArmor: armorAfterExpression }));
    window.setTimeout(() => setImpact(null), 360);

    if (playerHit.damage > 0) {
      window.setTimeout(() => {
        setImpact("hero");
        playBattleSound("hero-hit");
        setBattle((current) => ({ ...current, playerHealth: playerHit.health, playerArmor: playerHit.armor }));
        window.setTimeout(() => setImpact(null), 360);
      }, 500);
    }

    window.setTimeout(() => {
      if (reflectedHit.health === 0) {
        const healedHealth = Math.min(battle.playerMaxHealth, playerHit.health + battle.mendingHealing);
        const healingReceived = healedHealth - playerHit.health;
        saveRunHealth(healedHealth);
        setBattle((current) => ({ ...current, playerHealth: healedHealth }));
        stopBattleMusic();
        playBattleSound("victory");
        setImpact("victory");
        setPhase("victory");
        setMessage(
          healingReceived > 0
            ? `The moss brute falls. Mending Charm restores ${healingReceived} HP.`
            : "The moss brute falls. Your health is already full.",
        );
        return;
      }
      if (playerHit.health === 0) {
        stopBattleMusic();
        playBattleSound("defeat");
        setImpact("defeat");
        setPhase("defeat");
        setMessage("The dungeon returns you to its entrance.");
        return;
      }
      const nextDraw = drawHand(battle.drawPile, [...battle.discardPile, ...battle.hand.filter((card) => !card.generatedById)]);
      setBattle((current) => ({
        ...current,
        ...nextDraw,
        enemyIntent: rollEnemyIntent(),
        enemyStunned: stunnedNext,
        weakenNext: upgradeEffects.weaken,
        playerArmor: playerHit.armor,
      }));
      setSelectedCards([]);
      setBottleUsed(false);
      setTurn((current) => current + 1);
      setPhase("playing");
      setMessage("A new hand is drawn. The brute prepares another swing.");
    }, 900);
  }

  function finishRoom(won: boolean) {
    if (!won) {
      resetRunDeck();
      saveRunHealth(loadPermanentLoadout().maxHealth);
    }
    clearBattleSession();
    onComplete(won);
  }

  function claimReward() {
    if (!chosenReward) {
      finishRoom(true);
      return;
    }
    if (chosenReward.kind === "upgrade") {
      setPhase("upgrade");
      return;
    }
    const nextDeck = [...runDeck, chosenReward];
    saveRunDeck(nextDeck);
    setRunDeck(nextDeck);
    finishRoom(true);
  }

  function applyRewardUpgrade(target: BattleCard) {
    if (!chosenReward) return;
    const nextDeck = chosenReward.catalogId === "card-removal"
      ? runDeck.filter((card) => card.id !== target.id)
      : runDeck.map((card) => card.id === target.id ? applyCardUpgrade(card, chosenReward.catalogId) : card);
    saveRunDeck(nextDeck);
    setRunDeck(nextDeck);
    finishRoom(true);
  }

  if (phase === "upgrade" && chosenReward) {
    const removable = chosenReward.catalogId === "card-removal";
    const eligibleCards = removable ? runDeck : runDeck.filter((card) => canApplyUpgrade(card, chosenReward.catalogId));
    return (
      <main className="battle-game reward-screen">
        <div className="reward-panel upgrade-target-panel">
          <p>{removable ? "Card Removal" : "Apply Upgrade"}</p>
          <h1>{removable ? "Choose a card to remove" : `Choose a card for ${chosenReward.label}`}</h1>
          <div className="pile-card-grid">
            {eligibleCards.map((card) => <CardButton key={card.id} card={card} onClick={() => applyRewardUpgrade(card)} disabled={false} preview />)}
          </div>
          {eligibleCards.length === 0 && <p>No valid targets are available.</p>}
          <div className="battle-actions"><button onClick={() => setPhase("reward")}>Back</button><button onClick={onExit}>Game Hall</button></div>
        </div>
      </main>
    );
  }

  if (phase === "reward") {
    return (
      <main className="battle-game reward-screen">
        <div className="reward-panel">
          <p>Battle Spoils</p><h1>Choose one card</h1>
          <div className="reward-cards">
            {rewards.map((card) => (
              <button className={`reward-option ${card.kind === "upgrade" ? "upgrade" : ""} rarity-${card.rarity.toLowerCase()} ${chosenReward?.id === card.id ? "chosen" : ""}`} key={card.id} onClick={() => setChosenReward(card)}>
                <strong>{card.label}</strong><span>{card.kind === "upgrade" ? card.type : `${card.energy} energy`}</span><small>{cardById.get(card.catalogId)?.displayDescription ?? card.effect}</small>
              </button>
            ))}
          </div>
          <div className="battle-actions">
            <button onClick={claimReward}>{chosenReward ? `Choose ${chosenReward.label}` : "Continue without a card"}</button>
            <button onClick={onExit}>Game Hall</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`battle-game ${phase === "victory" ? "battle-victory" : phase === "defeat" ? "battle-defeat" : ""}`}>
      <header className="battle-topbar">
        <button className="icon-button" aria-label="Return to game hall" onClick={onExit} disabled={phase === "resolving"}><ArrowLeft size={20} /></button>
        <div><p>Dungeon Level 1 · Room 1</p><strong>Overgrown Gate</strong></div>
        <div className="battle-topbar-actions">
          <span>Turn {turn}</span>
          <button
            className="icon-button"
            aria-label={musicOn ? "Mute battle music" : "Play battle music"}
            onClick={() => {
              if (musicOn) stopBattleMusic(); else startBattleMusic();
              setMusicOn((current) => !current);
            }}
          >
            {musicOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
      </header>

      <div className="item-bar" aria-label="Equipped items">
        <div className="item-icon" tabIndex={0} aria-label={`Mending Charm: Restores up to ${battle.mendingHealing} missing HP after each victorious fight`}>
          <HeartPulse size={21} />
          <span className="item-tooltip"><strong>Mending Charm</strong>Restores up to {battle.mendingHealing} missing HP after each victorious fight.</span>
        </div>
      </div>

      {pileView && (
        <div className="modal-backdrop">
          <section className="pile-panel" role="dialog" aria-modal="true" aria-labelledby="pile-title">
            <div className="pile-panel-heading">
              <div><p>Card Pile</p><h2 id="pile-title">{pileView === "deck" ? "Deck" : "Discard"}</h2></div>
              <button className="icon-button" aria-label="Close card pile" onClick={() => setPileView(null)}><X size={20} /></button>
            </div>
            <p>{pileView === "deck" ? "Earliest acquired to latest acquired." : "Most recently discarded first."}</p>
            <div className="pile-card-grid">
              {viewedPile.map((card) => <CardButton key={card.id} card={card} onClick={() => undefined} disabled={false} preview />)}
            </div>
          </section>
        </div>
      )}

      <section className={`battlefield ${impact === "counter" ? "counter-flash" : ""} ${impact === "victory" ? "victory-flash" : ""} ${impact === "defeat" ? "defeat-flash" : ""}`}>
        <Combatant
          name="Mathknight"
          sprite="♞"
          health={battle.playerHealth}
          maxHealth={battle.playerMaxHealth}
          armor={battle.playerArmor + (phase === "playing" ? upgradeEffects.armor : 0)}
          hit={impact === "hero"}
        />
        <div className="combat-center">
          <div className="enemy-intent"><span>{battle.enemyStunned ? "Enemy is stunned" : "Enemy intends to attack"}</span><strong><Swords size={22} /> {displayedIntent}</strong></div>
          <p className="combat-message">{message}</p>
        </div>
        <Combatant name="Moss Brute" sprite="♜" health={battle.enemyHealth} maxHealth={enemyMaxHealth} armor={battle.enemyArmor} enemy hit={impact === "enemy" || impact === "counter"} />
      </section>

      {phase === "victory" || phase === "defeat" ? (
        <section className={`battle-result ${phase}`}>
          <p>{phase === "victory" ? "Victory" : "Defeated"}</p><h1>{message}</h1>
          <div className="battle-actions">
            {phase === "victory" ? (
              <button onClick={() => setPhase("reward")}>Continue</button>
            ) : (
              <button onClick={() => finishRoom(false)}>Continue</button>
            )}
            <button onClick={onExit}>Game Hall</button>
          </div>
        </section>
      ) : (
        <section className="battle-controls">
          <div className="expression-builder">
            <div className="expression-energy-panel">
              <span>Energy</span>
              <strong><Zap size={17} /> {availableEnergy - energyUsed} / {availableEnergy}</strong>
            </div>
            <div className="expression-slots">
              {expressionItems.map((item, index) => <button key={`${item.sourceIds.join("-")}-${index}`} onClick={() => removeExpressionItem(item.sourceIds)} aria-label={`Remove ${item.label}`}>{item.label}</button>)}
            </div>
            <div className="expression-summary">
              <div className={`expression-result ${counterReady ? "counter-ready" : ""}`} aria-live="polite">
                <span>=</span><strong>{previewResult ?? "?"}</strong>
              </div>
              <button className="submit-attack" onClick={submitExpression} disabled={phase !== "playing"}>Submit Attack</button>
            </div>
            {error && <p className="battle-error" role="alert">{error}</p>}
          </div>

          <div className="hand-area">
            <div className="bottle-slot"><span>Bottled</span><CardButton card={battle.bottledCard} onClick={() => addCard(battle.bottledCard, true)} disabled={bottleUsed || phase !== "playing"} bottled /></div>
            <div className="hand-cards">
              {battle.hand.map((card) => (
                <div className="hand-card-slot" key={card.id}>
                  <CardButton card={card} onClick={() => addCard(card)} disabled={card.consumedThisTurn || selectedCards.some((selected) => selected.id === card.id) || phase !== "playing"} />
                  {card.upgrades.includes("cycling") && <button className="card-upgrade-action" onClick={() => cycleCard(card)}>Cycle</button>}
                  {card.upgrades.includes("consumable") && <button className="card-upgrade-action" onClick={() => toggleConsumable(card)}>{card.consumedThisTurn ? "Undo +1" : "Consume +1"}</button>}
                </div>
              ))}
            </div>
            <div className="pile-counts">
              <button onClick={() => setPileView("deck")}>Deck {battle.drawPile.length}</button>
              <button onClick={() => setPileView("discard")}>Discard {battle.discardPile.length}</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Combatant({ name, sprite, health, maxHealth, armor, enemy = false, hit = false }: { name: string; sprite: string; health: number; maxHealth: number; armor: number; enemy?: boolean; hit?: boolean }) {
  return <div className={`combatant ${enemy ? "enemy-combatant" : "hero-combatant"} ${hit ? "taking-hit" : ""}`}>
    <div className={`pixel-sprite ${enemy ? "enemy-sprite" : "hero-sprite"}`} aria-label={name}>{sprite}</div>
    <h2>{name}</h2><div className={`health-bar ${enemy ? "enemy" : ""}`}><span style={{ width: `${(health / maxHealth) * 100}%` }} /></div>
    <strong>{health} / {maxHealth} HP</strong><span className="armor-readout"><Shield size={16} /> {armor} armor</span>
  </div>;
}

function cardSequence(card: BattleCard) {
  return Number(card.id.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function CardButton({ card, onClick, disabled, bottled = false, preview = false }: { card: BattleCard; onClick: () => void; disabled: boolean; bottled?: boolean; preview?: boolean }) {
  const typeClass = card.type.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const upgradeCount = Math.min(card.upgrades.length, 5);
  return <button
    className={`battle-card ${card.kind} type-${typeClass} rarity-${card.rarity.toLowerCase()} upgrades-${upgradeCount} ${preview ? "preview" : ""}`}
    onClick={onClick}
    disabled={!preview && disabled}
  >
    <small>{card.energy}</small><strong>{card.label}</strong>
    <div className="card-upgrade-icons">
      {card.upgrades.map((upgradeId, index) => {
        const visual = upgradeVisuals[upgradeId] ?? { label: "U", category: "special" };
        return <span className={`upgrade-${visual.category}`} key={`${upgradeId}-${index}`} aria-label={cardById.get(upgradeId)?.name ?? upgradeId}>{visual.label}</span>;
      })}
    </div>
    {bottled && <em>Every turn</em>}
    <span className="card-explainer">
      <strong>{card.label}</strong>{cardById.get(card.catalogId)?.displayDescription ?? card.effect}
      {card.upgrades.map((upgradeId) => {
        const upgrade = cardById.get(upgradeId);
        return <span key={upgradeId}><b>{upgrade?.name ?? upgradeId}:</b> {upgrade?.displayDescription ?? "Card upgrade"}</span>;
      })}
    </span>
  </button>;
}

const upgradeVisuals: Record<string, { label: string; category: "defense" | "offense" | "stats" | "energy" | "special" }> = {
  armor: { label: "A", category: "defense" }, weaken: { label: "W", category: "defense" },
  crit: { label: "C", category: "offense" }, bash: { label: "B", category: "offense" },
  "1": { label: "1", category: "stats" }, "3": { label: "3", category: "stats" },
  efficiency: { label: "E", category: "energy" }, consumable: { label: "C", category: "energy" },
  cycling: { label: "C", category: "special" }, reflecting: { label: "R", category: "special" },
};
