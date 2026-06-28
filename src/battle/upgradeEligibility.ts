import type { BattleCard } from "./battleEngine";
import { applyCardUpgrade, canApplyUpgrade } from "./battleEngine";
import { cardById } from "./cardCatalog";
import { bottleCapacityCost } from "../quartermaster/quartermasterStore";

export function upgradeIneligibilityReason(card: BattleCard, upgradeId: string, options: { bottled?: boolean; bottleMaxCost?: number } = {}) {
  const upgrade = cardById.get(upgradeId);
  const upgradeName = upgrade?.name ?? upgradeId;
  if (card.upgrades.includes(upgradeId)) return `Already has the ${upgradeName} upgrade.`;

  if (upgrade?.type === "Upgrade (Digit)" && card.kind !== "number") return "This upgrade applies to Digit cards only.";
  if (upgrade?.type === "Upgrade (Variable)" && card.kind !== "variable") return "This upgrade applies to Variable cards only.";
  if (!canApplyUpgrade(card, upgradeId)) {
    const target = upgrade?.type.match(/^Upgrade \((.+)\)$/)?.[1];
    return target && target !== "any" ? `This upgrade applies to ${target} cards only.` : `The ${upgradeName} upgrade cannot be applied to this card.`;
  }

  if (options.bottled && options.bottleMaxCost !== undefined && bottleCapacityCost(applyCardUpgrade(card, upgradeId)) > options.bottleMaxCost) {
    return "Bottle at capacity—upgrade at the Quartermaster.";
  }
  return null;
}
