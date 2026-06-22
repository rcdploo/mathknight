export function resetAllGameProgress() {
  const mathknightKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("mathknight.")) mathknightKeys.push(key);
  }
  mathknightKeys.forEach((key) => window.localStorage.removeItem(key));
}
