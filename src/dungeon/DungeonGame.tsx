import { Crown, Flag, Gem, HelpCircle, ShoppingBag, Skull, Swords } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import BattleGame from "../battle/BattleGame";
import { addRunItem, itemSymbol, loadRunItems, surfaceItems, type ItemDefinition } from "../battle/itemCatalog";
import { applyCardUpgrade, canApplyUpgrade, type BattleCard } from "../battle/battleEngine";
import { generateCombatRewards } from "../battle/rewardGenerator";
import { loadShop, saveShop, type ShopSlot } from "../battle/shopGenerator";
import { generateMonster, nextDungeonStage, type DungeonRoom, type DungeonStage, type GeneratedMonster } from "../battle/monsterGenerator";
import { loadProgress, saveProgress } from "../game/progressStore";
import { loadPermanentLoadout, savePermanentLoadout } from "../quartermaster/quartermasterStore";

type RoomType = "start" | "battle" | "elite" | "treasure" | "shop" | "mystery" | "boss";
type DungeonNode = { id: string; step: number; lane: number; type: RoomType; next: string[]; monster?: GeneratedMonster; resolvedType?: "battle" | "shop" | "treasure" };
type DungeonState = {
  stage: DungeonStage;
  nodes: DungeonNode[];
  completedIds: string[];
  availableIds: string[];
  activeNodeId: string | null;
  view: "map" | "battle" | "event";
  notice: string;
};

const dungeonStorageKey = "mathknight.dungeon.level1.v4";
const mapWidth = 1160;
const mapHeight = 480;

function shuffle<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function generateLaneRooms() {
  const flexibleRoom = Math.random() < 0.5 ? "mystery" : "battle";
  const rareRoll = Math.random();
  const rareRoom = rareRoll < 0.5 ? "mystery" : rareRoll < 0.75 ? "shop" : "elite";
  const laneRooms: RoomType[] = [];
  laneRooms[1] = "battle";
  const earlyRooms: RoomType[] = shuffle(["battle", flexibleRoom]);
  laneRooms[2] = earlyRooms[0];
  laneRooms[3] = earlyRooms[1];
  const middleRooms: RoomType[] = shuffle(["elite", "shop", "battle", "mystery"]);
  [4, 6, 7, 8].forEach((step, index) => {
    laneRooms[step] = middleRooms[index];
  });
  laneRooms[5] = "treasure";
  laneRooms[9] = rareRoom;
  return laneRooms;
}

function roomNumberForMonster(step: number): DungeonRoom {
  return step === 10 ? "Boss" : step as DungeonRoom;
}

function shouldGenerateMonster(type: RoomType) {
  return type === "battle" || type === "elite" || type === "boss";
}

function generateDungeon(stage: DungeonStage): DungeonState {
  const laneRooms = [generateLaneRooms(), generateLaneRooms(), generateLaneRooms()];
  const usedTypeNames: string[] = [];
  const makeMonster = (type: RoomType, step: number) => {
    if (!shouldGenerateMonster(type)) return undefined;
    const monster = generateMonster(stage, roomNumberForMonster(step), usedTypeNames);
    usedTypeNames.push(monster.type.name);
    return monster;
  };
  const nodes: DungeonNode[] = [{ id: "start", step: 0, lane: 1, type: "start", next: ["room-1-0", "room-1-1", "room-1-2"] }];
  for (let step = 1; step <= 9; step += 1) {
    for (let lane = 0; lane < 3; lane += 1) {
      const type = laneRooms[lane][step];
      const next = step === 9
        ? ["boss"]
        : [lane, ...(Math.random() < 0.62 ? [lane + (Math.random() < 0.5 ? -1 : 1)] : [])]
            .filter((nextLane, index, lanes) => nextLane >= 0 && nextLane <= 2 && lanes.indexOf(nextLane) === index)
            .map((nextLane) => `room-${step + 1}-${nextLane}`);
      nodes.push({ id: `room-${step}-${lane}`, step, lane, type, next, monster: makeMonster(type, step) });
    }
  }
  nodes.push({ id: "boss", step: 10, lane: 1, type: "boss", next: [], monster: makeMonster("boss", 10) });
  return {
    stage,
    nodes,
    completedIds: ["start"],
    availableIds: ["room-1-0", "room-1-1", "room-1-2"],
    activeNodeId: null,
    view: "map",
    notice: "Choose a connected room and press deeper into the dungeon.",
  };
}

function loadDungeon() {
  try {
    const raw = window.localStorage.getItem(dungeonStorageKey);
    if (!raw) return generateDungeon(1);
    return JSON.parse(raw) as DungeonState;
  } catch {
    return generateDungeon(1);
  }
}

function nodePosition(node: DungeonNode) {
  return { x: 58 + node.step * 104, y: 82 + node.lane * 145 };
}

const roomDetails: Record<RoomType, { label: string; Icon: typeof Swords }> = {
  start: { label: "Dungeon Entrance", Icon: Flag },
  battle: { label: "Monster Battle", Icon: Swords },
  elite: { label: "Elite Battle", Icon: Skull },
  treasure: { label: "Treasure Room", Icon: Gem },
  shop: { label: "Dungeon Shop", Icon: ShoppingBag },
  mystery: { label: "Unknown Room", Icon: HelpCircle },
  boss: { label: "Dungeon Boss", Icon: Crown },
};

export default function DungeonGame({ onExit }: { onExit: () => void }) {
  const [dungeon, setDungeon] = useState<DungeonState>(loadDungeon);
  const nodeById = useMemo(() => new Map(dungeon.nodes.map((node) => [node.id, node])), [dungeon.nodes]);

  useEffect(() => {
    window.localStorage.setItem(dungeonStorageKey, JSON.stringify(dungeon));
  }, [dungeon]);

  function enterRoom(node: DungeonNode) {
    if (!dungeon.availableIds.includes(node.id)) return;
    if (node.type === "mystery" && !node.resolvedType) {
      const roll = Math.random();
      const resolvedType = roll < .45 ? "battle" : roll < .8 ? "shop" : "treasure";
      setDungeon((current) => {
        const usedTypeNames = current.nodes.flatMap((candidate) => candidate.monster ? [candidate.monster.type.name] : []);
        const monster = resolvedType === "battle" ? generateMonster(current.stage, roomNumberForMonster(node.step), usedTypeNames) : undefined;
        return {
          ...current,
          nodes: current.nodes.map((candidate) => candidate.id === node.id ? { ...candidate, resolvedType, monster } : candidate),
          availableIds: [node.id],
          activeNodeId: node.id,
          view: resolvedType === "battle" ? "battle" : "event",
          notice: `The unknown room revealed a ${roomDetails[resolvedType].label.toLowerCase()}.`,
        };
      });
      return;
    }
    const effectiveType = node.resolvedType ?? node.type;
    const view = shouldGenerateMonster(effectiveType) ? "battle" : "event";
    setDungeon((current) => ({ ...current, availableIds: [node.id], activeNodeId: node.id, view, notice: `Entered ${roomDetails[effectiveType].label}.` }));
  }

  function completeRoom(won: boolean) {
    if (!won) {
      const nextDungeon = generateDungeon(dungeon.stage);
      nextDungeon.notice = "The dungeon shifted after your defeat. Choose a new path.";
      window.localStorage.setItem(dungeonStorageKey, JSON.stringify(nextDungeon));
      setDungeon(nextDungeon);
      return;
    }

    setDungeon((current) => {
      const completedNode = current.activeNodeId ? nodeById.get(current.activeNodeId) : undefined;
      if (!completedNode) return { ...current, view: "map", activeNodeId: null };
      const bossDefeated = completedNode.type === "boss";
      if (bossDefeated) {
        const nextStage = nextDungeonStage(current.stage);
        const loadout = loadPermanentLoadout();
        if (nextStage > loadout.dungeonLevel) {
          savePermanentLoadout({ ...loadout, dungeonLevel: nextStage });
        }
        const nextDungeon = generateDungeon(nextStage);
        nextDungeon.notice = nextStage === current.stage
          ? "The final boss is defeated. Stage 5 is mastered."
          : `Stage ${current.stage} conquered. Stage ${nextStage} begins.`;
        return nextDungeon;
      }
      return {
        ...current,
        completedIds: [...new Set([...current.completedIds, completedNode.id])],
        availableIds: completedNode.next,
        activeNodeId: null,
        view: "map",
        notice: "Room cleared. New paths are open.",
      };
    });
  }

  function returnToMap() {
    setDungeon((current) => ({ ...current, activeNodeId: null, view: "map", notice: "Choose a connected room and press deeper into the dungeon." }));
  }

  if (dungeon.view === "battle") {
    const activeNode = dungeon.activeNodeId ? nodeById.get(dungeon.activeNodeId) : undefined;
    if (!activeNode?.monster) return null;
    return <BattleGame onExit={returnToMap} onComplete={completeRoom} monster={activeNode.monster} roomLabel={`Stage ${dungeon.stage} / Room ${activeNode.step}`} dungeonLevel={activeNode.step} />;
  }

  if (dungeon.view === "event") {
    const activeNode = dungeon.activeNodeId ? nodeById.get(dungeon.activeNodeId) : undefined;
    if (activeNode) {
      const effectiveType = activeNode.resolvedType ?? activeNode.type;
      if (effectiveType === "shop") return <ShopRoom node={activeNode} stage={dungeon.stage} onExit={returnToMap} onComplete={() => completeRoom(true)} />;
      return <RoomEvent node={activeNode} stage={dungeon.stage} eventType={effectiveType} onExit={returnToMap} onComplete={() => completeRoom(true)} />;
    }
  }

  return (
    <main className="dungeon-map-screen">
      <header className="dungeon-map-header">
        <button className="map-back-button" onClick={onExit}>Game Hall</button>
        <div><p>Dungeon Stage {dungeon.stage}</p><h1>The Verdant Descent</h1></div>
        <span>Room 5 treasure / Room 10 boss</span>
      </header>
      <div className="dungeon-map-copy"><p>{dungeon.notice}</p></div>
      <div className="dungeon-map-scroll">
        <div className="dungeon-map" style={{ width: mapWidth, height: mapHeight }}>
          <svg className="map-connections" viewBox={`0 0 ${mapWidth} ${mapHeight}`} aria-hidden="true">
            {dungeon.nodes.flatMap((node) => node.next.map((nextId) => {
              const next = nodeById.get(nextId);
              if (!next) return null;
              const fromPosition = nodePosition(node);
              const toPosition = nodePosition(next);
              const traversed = dungeon.completedIds.includes(node.id) && (dungeon.completedIds.includes(next.id) || dungeon.availableIds.includes(next.id));
              return <line className={traversed ? "traversed" : ""} key={`${node.id}-${next.id}`} x1={fromPosition.x} y1={fromPosition.y} x2={toPosition.x} y2={toPosition.y} />;
            }))}
          </svg>
          {dungeon.nodes.map((node) => {
            const { Icon, label } = roomDetails[node.type];
            const position = nodePosition(node);
            const completed = dungeon.completedIds.includes(node.id);
            const available = dungeon.availableIds.includes(node.id);
            return (
              <button
                className={`hex-room ${node.type} ${completed ? "completed" : available ? "available" : "locked"}`}
                style={{ left: position.x, top: position.y }}
                key={node.id}
                onClick={() => enterRoom(node)}
                disabled={!available}
                aria-label={`${label}: ${completed ? "completed" : available ? "available" : "locked"}`}
              >
                <Icon size={23} />
                <span>{node.type === "battle" ? "Fight" : node.type === "mystery" ? "?" : node.type === "boss" ? "Boss" : node.type}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="map-legend">
        {(["battle", "elite", "treasure", "shop", "mystery"] as RoomType[]).map((type) => {
          const { Icon, label } = roomDetails[type];
          return <span key={type}><Icon size={15} /> {label}</span>;
        })}
      </div>
    </main>
  );
}

function RoomEvent({ node, stage, eventType, onExit, onComplete }: { node: DungeonNode; stage: DungeonStage; eventType: RoomType; onExit: () => void; onComplete: () => void }) {
  const [items] = useState<ItemDefinition[]>(() => surfaceItems(1));
  const [owned, setOwned] = useState(loadRunItems);
  const [message, setMessage] = useState(
    eventType === "treasure" ? "The chest contains a strange and useful relic."
        : "Something glints in the dark.",
  );
  const progress = loadProgress();
  const discount = owned.includes("loyalty-card") ? 0.8 : 1;

  function take(item: ItemDefinition, purchased: boolean) {
    const price = Math.round(item.cost * discount);
    const current = loadProgress();
    if (purchased && current.coins < price) {
      setMessage(`You need $${price - current.coins} more.`);
      return;
    }
    if (purchased) saveProgress({ ...current, coins: current.coins - price });
    setOwned(addRunItem(item.id));
    setMessage(`${item.name} was added to your item line.`);
    window.setTimeout(onComplete, 450);
  }

  return (
    <main className="battle-game reward-screen">
      <section className="reward-panel item-room-panel">
        <p>Stage {stage} / {roomDetails[eventType].label}</p>
        <h1>{eventType === "treasure" ? "Treasure Cache" : "Curious Discovery"}</h1>
        <p className="room-event-message">{message}</p>
        <div className="item-offers">
          {items.map((item) => {
            const price = Math.round(item.cost * discount);
            return (
              <button className={`item-offer rarity-${item.rarity.toLowerCase()}`} key={item.id} onClick={() => take(item, node.type === "shop")}>
                <span className="item-offer-symbol">{itemSymbol(item)}</span>
                <strong>{item.name}</strong>
                <small>{item.rarity} · {item.tags.join(", ")}</small>
                <p>{item.effect}</p>
                <b>{node.type === "shop" ? `$${price}` : "Take item"}</b>
              </button>
            );
          })}
        </div>
        <div className="battle-actions">
          <button onClick={onComplete}>Leave</button>
          <button onClick={onExit}>Return to map</button>
        </div>
      </section>
    </main>
  );
}

const runDeckKey = "mathknight.dungeon.runDeck.v1";
const runHealthKey = "mathknight.dungeon.runHealth.v1";

function loadRunDeckCards() {
  try {
    return JSON.parse(window.localStorage.getItem(runDeckKey) ?? "[]") as BattleCard[];
  } catch {
    return [];
  }
}

function ShopRoom({ node, stage, onExit, onComplete }: { node: DungeonNode; stage: DungeonStage; onExit: () => void; onComplete: () => void }) {
  const initial = useMemo(() => loadShop(node.id, stage), [node.id, stage]);
  const [slots, setSlots] = useState<ShopSlot[]>(initial.slots);
  const [coins, setCoins] = useState(() => loadProgress().coins);
  const [deck, setDeck] = useState(loadRunDeckCards);
  const [targetSlot, setTargetSlot] = useState<ShopSlot | null>(null);
  const [message, setMessage] = useState("Need more gold? Return to the Training Grounds to earn more.");
  const discount = loadRunItems().includes("loyalty-card") ? .8 : 1;
  const shopPositionOrder = ["C1", "C2", "C3", "I1", "C4", "C5", "C6", "I2", "U1", "U2", "U3", "I3", "S1", "S2", "S3", "I4"];
  const orderedSlots = [...slots].sort((left, right) => shopPositionOrder.indexOf(left.position) - shopPositionOrder.indexOf(right.position));

  function priceFor(slot: ShopSlot) {
    if (slot.type === "sustenance") return slot.price;
    if (slot.type === "remove-card") return slot.price * (loadPermanentLoadout().removalPurchases + 1);
    return Math.round(slot.price * discount);
  }

  function persist(nextSlots: ShopSlot[], nextDeck = deck, nextCoins = coins) {
    setSlots(nextSlots);
    saveShop(initial.key, nextSlots);
    setDeck(nextDeck);
    window.localStorage.setItem(runDeckKey, JSON.stringify(nextDeck));
    setCoins(nextCoins);
    const progress = loadProgress();
    saveProgress({ ...progress, coins: nextCoins });
  }

  function markSold(slot: ShopSlot) {
    return slots.map((entry) => entry.position === slot.position ? { ...entry, sold: true } as ShopSlot : entry);
  }

  function buy(slot: ShopSlot) {
    if (slot.sold) return;
    const price = priceFor(slot);
    if (coins < price) {
      setMessage(`You need $${price - coins} more.`);
      return;
    }
    if (slot.type === "card") {
      persist(markSold(slot), [...deck, slot.card], coins - price);
      setMessage(`${slot.card.label} was added to your deck.`);
    } else if (slot.type === "item") {
      addRunItem(slot.item.id);
      persist(markSold(slot), deck, coins - price);
      setMessage(`${slot.item.name} was added to your item line.`);
    } else if (slot.type === "sustenance") {
      const maxHealth = loadPermanentLoadout().maxHealth;
      const current = Number(window.localStorage.getItem(runHealthKey)) || maxHealth;
      window.localStorage.setItem(runHealthKey, String(Math.min(maxHealth, current + 30)));
      persist(slots, deck, coins - price);
      setMessage("Sustenance restores up to 30 HP.");
    } else if (slot.type === "random-reward") {
      const reward = generateCombatRewards(stage)[Math.floor(Math.random() * 3)].card;
      if (reward.kind === "upgrade") {
        setTargetSlot({ ...slot, type: "upgrade", card: reward } as ShopSlot);
      } else {
        persist(markSold(slot), [...deck, reward], coins - price);
        setMessage(`${reward.label} was added to your deck.`);
      }
    } else {
      setTargetSlot(slot);
    }
  }

  function chooseTarget(card: BattleCard) {
    if (!targetSlot) return;
    const price = priceFor(targetSlot);
    const nextDeck = targetSlot.type === "remove-card"
      ? deck.filter((entry) => entry.id !== card.id)
      : targetSlot.type === "upgrade"
        ? deck.map((entry) => entry.id === card.id ? applyCardUpgrade(entry, targetSlot.card.catalogId) : entry)
        : deck;
    if (targetSlot.type === "remove-card") {
      const loadout = loadPermanentLoadout();
      savePermanentLoadout({ ...loadout, removalPurchases: loadout.removalPurchases + 1 });
    }
    persist(markSold(targetSlot), nextDeck, coins - price);
    setMessage(targetSlot.type === "remove-card" ? `${card.label} was removed.` : `${targetSlot.type === "upgrade" ? targetSlot.card.label : "Upgrade"} was applied to ${card.label}.`);
    setTargetSlot(null);
  }

  if (targetSlot) {
    const eligible = targetSlot.type === "remove-card" ? deck : targetSlot.type === "upgrade" ? deck.filter((card) => canApplyUpgrade(card, targetSlot.card.catalogId)) : [];
    return <main className="battle-game reward-screen"><section className="reward-panel upgrade-target-panel">
      <p>Shop purchase</p><h1>{targetSlot.type === "remove-card" ? "Choose a card to remove" : `Choose a card for ${targetSlot.type === "upgrade" ? targetSlot.card.label : "upgrade"}`}</h1>
      <div className="shop-target-grid">{eligible.map((card) => <button key={card.id} onClick={() => chooseTarget(card)}><strong>{card.label}</strong><small>{card.rarity}</small></button>)}</div>
      <div className="battle-actions"><button onClick={() => setTargetSlot(null)}>Cancel</button></div>
    </section></main>;
  }

  return <main className="battle-game reward-screen"><section className="reward-panel dungeon-shop-panel">
    <p>Stage {stage} / Dungeon Shop</p><h1>Dungeon Merchant</h1>
    <div className="shop-balance">${coins} coins</div><p className="room-event-message">{message}</p>
    <div className="dungeon-shop-grid">
      {orderedSlots.map((slot) => <ShopOffer slot={slot} price={priceFor(slot)} onBuy={() => buy(slot)} key={slot.position} />)}
    </div>
    <div className="battle-actions"><button onClick={onComplete}>Leave shop</button><button onClick={onExit}>Return to map</button></div>
  </section></main>;
}

function ShopOffer({ slot, price, onBuy }: { slot: ShopSlot; price: number; onBuy: () => void }) {
  const name = slot.type === "card" || slot.type === "upgrade" ? slot.card.label
    : slot.type === "item" ? slot.item.name : slot.type === "sustenance" ? "Sustenance"
      : slot.type === "random-reward" ? "Random Card Reward" : "Remove a Card";
  const description = slot.type === "card" ? `${slot.card.rarity} card${slot.card.upgrades.length ? ` · ${slot.card.upgrades.join(" + ")}` : ""}`
    : slot.type === "upgrade" ? slot.card.effect : slot.type === "item" ? slot.item.effect
      : slot.type === "sustenance" ? "Heal up to 30 HP. Repeatable." : slot.type === "random-reward" ? "Generate one random combat reward." : "Permanently remove a card from your run deck.";
  const cardType = slot.type === "card" || slot.type === "upgrade" ? slot.card.type.toLowerCase() : "";
  const rarity = slot.type === "card" || slot.type === "upgrade" ? slot.card.rarity.toLowerCase() : slot.type === "item" ? slot.item.rarity.toLowerCase() : "common";
  const tone = slot.type === "item" ? "item"
    : slot.type === "upgrade" ? "upgrade"
      : slot.type === "card" ? cardType.includes("variable") ? "variable" : cardType.includes("combo") ? "combo" : cardType.includes("upgrade") ? "upgrade" : "digit"
        : "service";
  return <button className={`shop-offer tone-${tone} rarity-${rarity} ${slot.sold ? "sold" : ""}`} disabled={slot.sold} onClick={onBuy}>
    <strong>{slot.sold ? "Sold" : name}</strong>
    {(slot.type === "card" || slot.type === "upgrade") && <span>{slot.type === "upgrade" ? slot.card.type : `${slot.card.energy} energy`}</span>}
    <b>${price}</b>
    <span className="shop-offer-tooltip"><strong>{name}</strong>{description}</span>
  </button>;
}
