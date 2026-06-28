import { cardById, cardDescription } from "./cardCatalog";
import type { BattleCard } from "./battleEngine";

export default function GameCard({
  card, onClick, disabled = false, bottled = false, preview = false, forced = false, played = false, price, badge, level,
}: {
  card: BattleCard;
  onClick: () => void;
  disabled?: boolean;
  bottled?: boolean;
  preview?: boolean;
  forced?: boolean;
  played?: boolean;
  price?: number;
  badge?: string;
  level?: number;
}) {
  const typeClass = card.type.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const upgradeCount = Math.min(card.upgrades.length, 5);
  return <button
    className={`battle-card ${card.kind} type-${typeClass} rarity-${card.rarity.toLowerCase()} upgrades-${upgradeCount} ${preview ? "preview" : ""} ${forced ? "forced" : ""} ${played ? "played" : ""}`}
    onClick={onClick}
    disabled={!preview && disabled}
  >
    <small>{card.energy}</small>
    <strong className={card.immolatedFrom !== undefined ? "immolated-value" : undefined}>
      {card.immolatedFrom !== undefined
        ? <><span className="immolated-old-value">{card.immolatedFrom}</span><span className="immolated-new-value">{card.label}</span></>
        : card.label}
    </strong>
    {card.immolatedFrom !== undefined && <span className="card-immolation-marker" aria-label="Immolation reduced this card" title="Immolation">I</span>}
    {card.kind === "upgrade" && <span className="upgrade-card-label">Upgrade</span>}
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
      <strong>{card.label}</strong>{level === undefined ? cardDescription(card.catalogId, card.label, card.effect) : levelText(cardDescription(card.catalogId, card.label, card.effect), level)}
      {card.upgrades.map((upgradeId) => {
        const upgrade = cardById.get(upgradeId);
        const description = upgrade?.displayDescription ?? "Card upgrade";
        return <span key={upgradeId}><b>{upgrade?.name ?? upgradeId}:</b> {level === undefined ? description : levelText(description, level)}</span>;
      })}
      {bottled && <span><b>Bottled:</b> Available every turn.</span>}
      {card.immolatedFrom !== undefined && <span><b>Immolation:</b> {card.immolatedFrom} was reduced to {card.label}.</span>}
    </span>
  </button>;
}

function levelText(text: string, level: number) {
  return text
    .replace(/(\d+)\s*\*\s*Level/gi, (_, amount: string) => String(Number(amount) * level))
    .replace(/1\s+HP\s+per\s+Level/gi, `${level} HP`);
}

const upgradeVisuals: Record<string, { label: string; category: "defense" | "offense" | "stats" | "energy" | "special" | "healing" }> = {
  armor: { label: "A", category: "defense" }, weaken: { label: "W", category: "defense" },
  crit: { label: "C", category: "offense" }, bash: { label: "B", category: "offense" },
  "1": { label: "1", category: "stats" }, "3": { label: "3", category: "stats" },
  efficiency: { label: "E", category: "energy" }, consumable: { label: "C", category: "energy" },
  cycling: { label: "C", category: "special" }, reflecting: { label: "R", category: "special" },
  healing: { label: "H", category: "healing" },
  initiative: { label: "I", category: "offense" },
};
