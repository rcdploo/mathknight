export function formatLevelText(text: string, level: number) {
  return text
    .replace(/(\d+)\s*\*\s*Level/gi, (_, amount: string) => String(Number(amount) * level))
    .replace(/1\s+HP\s+per\s+Level/gi, `${level} HP`);
}
