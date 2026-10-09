/** Lowercase without accents, so "joao" finds "João". */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Every word typed appears in the name (any order, accents and case ignored). */
export function matchesName(name: string, term: string): boolean {
  const words = foldText(term).split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const folded = foldText(name);
  return words.every((word) => folded.includes(word));
}
