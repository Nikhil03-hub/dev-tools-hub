// Pure fuzzy matching for the command palette. No DOM, no React: the palette
// ranks with this and the unit tests pin the scoring bands.
// Bands come from docs/v3/tasks/P1_foundation.md (T-107).

export interface SearchItem {
  id: string;
  text: string;
  keywords?: string[];
  group: string;
}

const BAND = {
  exactPrefix: 100,
  wordPrefix: 80,
  keywordPrefix: 70,
  substring: 50,
  subsequence: 20,
} as const;

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}

export function scoreMatch(query: string, item: SearchItem): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const text = item.text.toLowerCase();

  if (text.startsWith(q)) return BAND.exactPrefix;

  // A word boundary is any position after a space, hyphen or slash.
  const words = text.split(/[\s\-/]+/);
  if (words.some((w) => w.startsWith(q) && w !== text)) return BAND.wordPrefix;
  if (words.length > 1 && words[0].startsWith(q)) return BAND.exactPrefix;

  if ((item.keywords ?? []).some((k) => k.toLowerCase().startsWith(q))) return BAND.keywordPrefix;
  if (text.includes(q)) return BAND.substring;
  if (isSubsequence(q, text)) return BAND.subsequence;
  return 0;
}

/**
 * Score desc, then recency, then the caller's order. An empty query returns
 * recent items first and everything else in input order, so the palette opens
 * on what you used last rather than on an alphabetical wall.
 */
export function rankItems<T extends SearchItem>(query: string, items: T[], recentIds: string[] = []): T[] {
  const q = query.trim();
  if (!q) {
    const recentRank = new Map(recentIds.map((id, i) => [id, i]));
    return items
      .map((item, index) => ({ item, index, recent: recentRank.get(item.id) }))
      .sort((a, b) => {
        const ar = a.recent ?? Number.MAX_SAFE_INTEGER;
        const br = b.recent ?? Number.MAX_SAFE_INTEGER;
        if (ar !== br) return ar - br;
        return a.index - b.index;
      })
      .map((entry) => entry.item);
  }

  const recentRank = new Map(recentIds.map((id, i) => [id, i]));
  return items
    .map((item, index) => ({
      item,
      index,
      score: scoreMatch(q, item),
      recent: recentRank.get(item.id) ?? Number.MAX_SAFE_INTEGER,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.recent - b.recent || a.index - b.index)
    .map((entry) => entry.item);
}
