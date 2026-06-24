import { cardById } from "./cardCatalog";
import type { BattleCard } from "./battleEngine";
import { itemCatalog, loadRunItems, type ItemDefinition } from "./itemCatalog";
import { generateShopCard, generateShopUpgrade } from "./rewardGenerator";

export type ShopSlot =
  | { position: string; type: "card"; card: BattleCard; price: number; sold: boolean }
  | { position: string; type: "upgrade"; card: BattleCard; price: number; sold: boolean }
  | { position: string; type: "item"; item: ItemDefinition; price: number; sold: boolean }
  | { position: "S1"; type: "sustenance"; price: number; sold: false }
  | { position: "S2"; type: "random-reward"; price: number; sold: boolean }
  | { position: "S3"; type: "remove-card"; price: number; sold: boolean };

const cardPositions: Array<[string, 1 | 2 | 3]> = [["C1", 1], ["C2", 1], ["C3", 2], ["C4", 2], ["C5", 3], ["C6", 3]];

function numericPrice(raw: string) {
  return Number(raw.replace(/[^0-9]/g, "")) || 0;
}

function cardPrice(card: BattleCard) {
  return numericPrice(card.shopCostRaw) + card.upgrades.reduce((sum, id) => sum + numericPrice(cardById.get(id)?.shopCostRaw ?? ""), 0);
}

function generateShop(level: number): ShopSlot[] {
  const owned = new Set(loadRunItems());
  const availableItems = itemCatalog.filter((item) => !owned.has(item.id)).sort(() => Math.random() - .5);
  return [
    ...cardPositions.map(([position, rewardSlot]) => {
      const card = generateShopCard(level, rewardSlot).card;
      return { position, type: "card" as const, card, price: cardPrice(card), sold: false };
    }),
    ...["U1", "U2", "U3"].map((position) => {
      const card = generateShopUpgrade(level);
      return { position, type: "upgrade" as const, card, price: numericPrice(card.shopCostRaw), sold: false };
    }),
    ...["I1", "I2", "I3", "I4"].map((position, index) => {
      const item = availableItems[index % availableItems.length];
      return { position, type: "item" as const, item, price: item.cost, sold: false };
    }),
    { position: "S1", type: "sustenance", price: 50, sold: false },
    { position: "S2", type: "random-reward", price: 75 * level, sold: false },
    { position: "S3", type: "remove-card", price: 100, sold: false },
  ];
}

export function loadShop(shopId: string, level: number) {
  const key = `mathknight.dungeon.shop.${shopId}.v1`;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "") as ShopSlot[];
    if (parsed.length !== 16) throw new Error("Invalid shop");
    return {
      key,
      slots: parsed,
    };
  } catch {
    const slots = generateShop(level);
    window.localStorage.setItem(key, JSON.stringify(slots));
    return { key, slots };
  }
}

export function saveShop(key: string, slots: ShopSlot[]) {
  window.localStorage.setItem(key, JSON.stringify(slots));
}
