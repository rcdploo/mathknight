import { ArrowLeft, HeartPulse, RotateCcw, Shield, Swords, Volume2, VolumeX, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { playBattleSound, startBattleMusic, stopBattleMusic } from "./battleAudio";
import {
  applyDamage, drawHand, evaluateExpression, expressionEnergy, makeBottledPlus, makeCard,
  makeStartingDeck, rollEnemyIntent, shuffle, type BattleCard,
} from "./battleEngine";

type BattlePhase = "playing" | "resolving" | "victory" | "defeat" | "reward";
const playerMaxHealth = 40;
const enemyMaxHealth = 30;
const maxEnergy = 3;
const postBattleHealing = 10;

function createBattle() {
  const opening = drawHand(shuffle(makeStartingDeck()), []);
  return {
    ...opening,
    bottledCard: makeBottledPlus(),
    playerHealth: playerMaxHealth,
    enemyHealth: enemyMaxHealth,
    enemyIntent: rollEnemyIntent(),
  };
}

export default function BattleGame({ onExit }: { onExit: () => void }) {
  const [battle, setBattle] = useState(createBattle);
  const [selectedCards, setSelectedCards] = useState<BattleCard[]>([]);
  const [bottleUsed, setBottleUsed] = useState(false);
  const [phase, setPhase] = useState<BattlePhase>("playing");
  const [message, setMessage] = useState("The moss brute raises its club.");
  const [error, setError] = useState("");
  const [turn, setTurn] = useState(1);
  const [chosenReward, setChosenReward] = useState<BattleCard | null>(null);
  const [musicOn, setMusicOn] = useState(true);
  const [impact, setImpact] = useState<"enemy" | "hero" | "counter" | null>(null);
  const energyUsed = useMemo(() => expressionEnergy(selectedCards), [selectedCards]);

  useEffect(() => () => stopBattleMusic(), []);

  function wakeAudio() {
    if (musicOn) startBattleMusic();
  }

  function addCard(card: BattleCard, bottled = false) {
    if (phase !== "playing" || selectedCards.some((selected) => selected.id === card.id)) return;
    if (energyUsed + card.energy > maxEnergy) {
      setError("Not enough energy for that card.");
      return;
    }
    setSelectedCards((current) => [...current, card]);
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

  function submitExpression() {
    if (phase !== "playing") return;
    let value: number;
    try {
      value = evaluateExpression(selectedCards);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Try a different expression.");
      return;
    }

    setError("");
    setPhase("resolving");
    const countered = value === battle.enemyIntent;
    const enemyHit = applyDamage(battle.enemyHealth, 0, countered ? battle.enemyIntent : value);
    const playerHit = countered || enemyHit.health === 0
      ? { health: battle.playerHealth, damage: 0 }
      : applyDamage(battle.playerHealth, 0, battle.enemyIntent);
    setMessage(countered
      ? `Perfect counter! ${battle.enemyIntent} damage reflected.`
      : `You strike for ${enemyHit.damage}. The brute answers for ${playerHit.damage}.`);
    wakeAudio();
    setImpact(countered ? "counter" : "enemy");
    playBattleSound(countered ? "counter" : "enemy-hit");
    setBattle((current) => ({ ...current, enemyHealth: enemyHit.health }));
    window.setTimeout(() => setImpact(null), 360);

    if (playerHit.damage > 0) {
      window.setTimeout(() => {
        setImpact("hero");
        playBattleSound("hero-hit");
        setBattle((current) => ({ ...current, playerHealth: playerHit.health }));
        window.setTimeout(() => setImpact(null), 360);
      }, 500);
    }

    window.setTimeout(() => {
      if (enemyHit.health === 0) {
        const healedHealth = Math.min(playerMaxHealth, playerHit.health + postBattleHealing);
        const healingReceived = healedHealth - playerHit.health;
        setBattle((current) => ({ ...current, playerHealth: healedHealth }));
        setPhase("victory");
        setMessage(
          healingReceived > 0
            ? `The moss brute falls. Mending Charm restores ${healingReceived} HP.`
            : "The moss brute falls. Your health is already full.",
        );
        return;
      }
      if (playerHit.health === 0) {
        setPhase("defeat");
        setMessage("The dungeon returns you to its entrance.");
        return;
      }
      const nextDraw = drawHand(battle.drawPile, [...battle.discardPile, ...battle.hand]);
      setBattle((current) => ({ ...current, ...nextDraw, enemyIntent: rollEnemyIntent() }));
      setSelectedCards([]);
      setBottleUsed(false);
      setTurn((current) => current + 1);
      setPhase("playing");
      setMessage("A new hand is drawn. The brute prepares another swing.");
    }, 900);
  }

  function restartBattle() {
    setBattle(createBattle());
    setSelectedCards([]);
    setBottleUsed(false);
    setPhase("playing");
    setMessage("The moss brute raises its club.");
    setError("");
    setTurn(1);
    setChosenReward(null);
  }

  const rewards = useMemo(
    () => [makeCard("3", "number", 1), makeCard("4", "number", 1), makeCard("+", "operator", 1)], []);

  if (phase === "reward") {
    return (
      <main className="battle-game reward-screen">
        <div className="reward-panel">
          <p>Battle Spoils</p><h1>Choose one card</h1>
          <div className="reward-cards">
            {rewards.map((card) => (
              <button className={chosenReward?.id === card.id ? "chosen" : ""} key={card.id} onClick={() => setChosenReward(card)}>
                <strong>{card.label}</strong><span>{card.energy} energy</span>
              </button>
            ))}
          </div>
          <div className="battle-actions"><button onClick={onExit}>{chosenReward ? `Keep ${chosenReward.label}` : "Skip Reward"}</button></div>
        </div>
      </main>
    );
  }

  return (
    <main className="battle-game">
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
        <div className="item-icon" tabIndex={0} aria-label="Mending Charm: Restores up to 10 missing HP after each victorious fight">
          <HeartPulse size={21} />
          <span className="item-tooltip"><strong>Mending Charm</strong>Restores up to 10 missing HP after each victorious fight.</span>
        </div>
      </div>

      <section className={`battlefield ${impact === "counter" ? "counter-flash" : ""}`}>
        <Combatant name="Mathknight" sprite="♞" health={battle.playerHealth} maxHealth={playerMaxHealth} hit={impact === "hero"} />
        <div className="combat-center">
          <div className="enemy-intent"><span>Enemy intends to attack</span><strong><Swords size={22} /> {battle.enemyIntent}</strong></div>
          <p className="combat-message">{message}</p>
        </div>
        <Combatant name="Moss Brute" sprite="♜" health={battle.enemyHealth} maxHealth={enemyMaxHealth} enemy hit={impact === "enemy" || impact === "counter"} />
      </section>

      {phase === "victory" || phase === "defeat" ? (
        <section className="battle-result">
          <p>{phase === "victory" ? "Victory" : "Defeated"}</p><h1>{message}</h1>
          <div className="battle-actions">
            {phase === "victory" && <button onClick={() => setPhase("reward")}>Claim Card Reward</button>}
            <button onClick={restartBattle}><RotateCcw size={18} /> Fight Again</button>
            <button onClick={onExit}>Game Hall</button>
          </div>
        </section>
      ) : (
        <section className="battle-controls">
          <div className="expression-builder">
            <div><span>Your expression</span><strong>{selectedCards.map((card) => card.label).join(" ") || "Choose cards"}</strong></div>
            <div className="expression-slots">
              {selectedCards.map((card) => <button key={card.id} onClick={() => removeCard(card)} aria-label={`Remove ${card.label}`}>{card.label}</button>)}
            </div>
            <div className="expression-summary">
              <span className="energy-readout"><Zap size={17} /> {maxEnergy - energyUsed} / {maxEnergy}</span>
              <button className="submit-attack" onClick={submitExpression} disabled={phase !== "playing"}>Submit Attack</button>
            </div>
            {error && <p className="battle-error" role="alert">{error}</p>}
          </div>

          <div className="hand-area">
            <div className="bottle-slot"><span>Bottled</span><CardButton card={battle.bottledCard} onClick={() => addCard(battle.bottledCard, true)} disabled={bottleUsed || phase !== "playing"} bottled /></div>
            <div className="hand-cards">
              {battle.hand.map((card) => <CardButton key={card.id} card={card} onClick={() => addCard(card)} disabled={selectedCards.some((selected) => selected.id === card.id) || phase !== "playing"} />)}
            </div>
            <div className="pile-counts"><span>Draw {battle.drawPile.length}</span><span>Discard {battle.discardPile.length}</span></div>
          </div>
        </section>
      )}
    </main>
  );
}

function Combatant({ name, sprite, health, maxHealth, enemy = false, hit = false }: { name: string; sprite: string; health: number; maxHealth: number; enemy?: boolean; hit?: boolean }) {
  return <div className={`combatant ${enemy ? "enemy-combatant" : "hero-combatant"} ${hit ? "taking-hit" : ""}`}>
    <div className={`pixel-sprite ${enemy ? "enemy-sprite" : "hero-sprite"}`} aria-label={name}>{sprite}</div>
    <h2>{name}</h2><div className={`health-bar ${enemy ? "enemy" : ""}`}><span style={{ width: `${(health / maxHealth) * 100}%` }} /></div>
    <strong>{health} / {maxHealth} HP</strong><span className="armor-readout"><Shield size={16} /> 0 armor</span>
  </div>;
}

function CardButton({ card, onClick, disabled, bottled = false }: { card: BattleCard; onClick: () => void; disabled: boolean; bottled?: boolean }) {
  return <button className={`battle-card ${card.kind}`} onClick={onClick} disabled={disabled}>
    <small>{card.energy}</small><strong>{card.label}</strong><em>{bottled ? "Every turn" : card.kind}</em>
  </button>;
}
