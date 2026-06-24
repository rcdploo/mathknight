import { cardById } from "./cardCatalog";
import type { BattleCard } from "./battleEngine";

export default function GameCard({
  card, onClick, disabled = false, bottled = false, preview = false, forced = false, price, badge,
}: {
  card: BattleCard;
  onClick: () => void;
  disabled?: boolean;
  bottled?: boolean;
  preview?: boolean;
  forced?: boolean;
  price?: number;
  badge?: string;
}) {
  const typeClass = card.type.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const upgradeCount = Math.min(card.upgrades.length, 5);
  return <button
    className={`battle-card ${card.kind} type-${typeClass} rarity-${card.rarity.toLowerCase()} upgrades-${upgradeCount} ${preview ? "preview" : ""} ${forced ? "forced" : ""}`}
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
    {forced && <em>Required</em>}
    {bottled && <em>Bottled</em>}
    {badge && <em>{badge}</em>}
    {price !== undefined && <b className="card-price">${price}</b>}
    <span className="card-explainer">
      <strong>{card.label}</strong>{cardById.get(card.catalogId)?.displayDescription ?? card.effect}
      {card.upgrades.map((upgradeId) => {
        const upgrade = cardById.get(upgradeId);
        return <span key={upgradeId}><b>{upgrade?.name ?? upgradeId}:</b> {upgrade?.displayDescription ?? "Card upgrade"}</span>;
      })}
      {bottled && <span><b>Bottled:</b> Available every turn.</span>}
    </span>
  </button>;
}

const upgradeVisuals: Record<string, { label: string; category: "defense" | "offense" | "stats" | "energy" | "special" | "healing" }> = {
  armor: { label: "A", category: "defense" }, weaken: { label: "W", category: "defense" },
  crit: { label: "C", category: "offense" }, bash: { label: "B", category: "offense" },
  "1": { label: "1", category: "stats" }, "3": { label: "3", category: "stats" },
  efficiency: { label: "E", category: "energy" }, consumable: { label: "C", category: "energy" },
  cycling: { label: "C", category: "special" }, reflecting: { label: "R", category: "special" },
  healing: { label: "H", category: "healing" },
};
