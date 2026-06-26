import { Coins, Heart, Layers3, Shield, Sparkles, X, Zap } from "lucide-react";
import { useState } from "react";
import { itemById, itemSymbol, loadRunItems } from "../battle/itemCatalog";
import GameCard from "../battle/GameCard";
import { loadProgress } from "../game/progressStore";
import { characterStatsForLevel, loadPermanentLoadout, loadRunBottle, loadRunDeck } from "../quartermaster/quartermasterStore";

const dungeonStorageKey = "mathknight.dungeon.level1.v6";
const runHealthKey = "mathknight.dungeon.runHealth.v1";

type SavedDungeon = {
  level?: number;
  activeNodeId?: string | null;
  completedIds?: string[];
  nodes?: Array<{ id: string; step: number }>;
};

export type RunPosition = { level: number; room: number };

export function loadRunPosition(): RunPosition {
  try {
    const dungeon = JSON.parse(window.localStorage.getItem(dungeonStorageKey) ?? "null") as SavedDungeon | null;
    const level = dungeon?.level ?? loadPermanentLoadout().dungeonLevel ?? 1;
    const nodes = dungeon?.nodes ?? [];
    const active = nodes.find((node) => node.id === dungeon?.activeNodeId);
    const completed = new Set(dungeon?.completedIds ?? []);
    const deepestCompleted = nodes.reduce((deepest, node) => completed.has(node.id) ? Math.max(deepest, node.step) : deepest, 0);
    return { level, room: Math.floor(active?.step ?? deepestCompleted) };
  } catch {
    return { level: loadPermanentLoadout().dungeonLevel ?? 1, room: 0 };
  }
}

export default function RunOverview({ position }: { position?: RunPosition }) {
  const [open, setOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);

  const runPosition = position ?? loadRunPosition();
  const loadout = loadPermanentLoadout();
  const stats = characterStatsForLevel(runPosition.level, loadout);
  const savedHealth = Number(window.localStorage.getItem(runHealthKey));
  const health = savedHealth > 0 ? Math.min(savedHealth, stats.maxHealth) : stats.maxHealth;
  const gold = loadProgress().coins;
  const deck = loadRunDeck();
  const bottle = loadRunBottle();
  const items = loadRunItems().flatMap((id) => {
    const item = itemById.get(id);
    return item ? [item] : [];
  });

  function close() {
    setOpen(false);
    setDeckOpen(false);
  }

  return <>
    <button className="run-overview-trigger" onClick={() => setOpen(true)}>
      <Shield size={18} /> Run Overview
    </button>
    {open && <div className="modal-backdrop run-overview-backdrop">
      <section className="run-overview-panel" role="dialog" aria-modal="true" aria-labelledby="run-overview-title">
        <div className="run-overview-heading">
          <div><p>Current Expedition</p><h2 id="run-overview-title">Run Overview</h2></div>
          <button className="icon-button" aria-label="Close run overview" onClick={close}><X size={20} /></button>
        </div>

        <div className="run-progress-banner">
          <div><span>Dungeon Level</span><strong>{runPosition.level}</strong></div>
          <div className="run-progress-divider" aria-hidden="true" />
          <div><span>Room</span><strong>{runPosition.room} <small>/ 10</small></strong></div>
        </div>

        <div className="run-stat-grid">
          <div><Heart size={19} /><span>Health</span><strong>{health} / {stats.maxHealth}</strong></div>
          <div><Zap size={19} /><span>Energy</span><strong>{stats.energy}</strong></div>
          <div><Layers3 size={19} /><span>Hand Size</span><strong>{stats.handSize}</strong></div>
          <div><Coins size={19} /><span>Gold</span><strong>${gold}</strong></div>
        </div>

        <section className="run-items-section">
          <div className="run-section-title"><Sparkles size={17} /><h3>Items</h3><span>{items.length}</span></div>
          <div className="run-item-list">
            <div className="run-item" tabIndex={0}>
              <b>MC</b><span><strong>Mending Charm</strong><small>Restores up to {loadout.mendingHealing} missing HP after each victory.</small></span>
            </div>
            {items.map((item) => <div className={`run-item rarity-${item.rarity.toLowerCase()}`} tabIndex={0} key={item.id}>
              <b>{itemSymbol(item)}</b><span><strong>{item.name}</strong><small>{item.effect}</small></span>
            </div>)}
            {items.length === 0 && <p className="run-empty-copy">No additional items collected yet.</p>}
          </div>
        </section>

        <button className="run-deck-toggle" onClick={() => setDeckOpen((current) => !current)}>
          <Layers3 size={18} /> {deckOpen ? "Hide Full Deck" : "View Full Deck"} <span>{deck.length + 1} cards</span>
        </button>

        {deckOpen && <section className="run-deck-section">
          <div className="run-bottled-card">
            <span>Bottled</span>
            <GameCard card={bottle} bottled preview onClick={() => undefined} level={runPosition.level} />
          </div>
          <div className="run-deck-grid">
            {deck.map((card) => <GameCard card={card} preview onClick={() => undefined} level={runPosition.level} key={card.id} />)}
          </div>
        </section>}
      </section>
    </div>}
  </>;
}
