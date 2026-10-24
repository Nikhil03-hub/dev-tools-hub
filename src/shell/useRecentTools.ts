import { useEffect, useState } from "react";

const KEY = "dth.recent";
const MAX_STORED = 8;

/** Tool ids only — never input, never a URL, never anything the user pasted. */
export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_STORED);
  } catch {
    return [];
  }
}

function writeRecent(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX_STORED)));
  } catch {
    /* storage refused: the in-memory list still works for this session */
  }
}

/** Records the active tool on every visit. Recency only, no counts, no history. */
export default function useRecentTools(activeToolId: string | null): string[] {
  const [recent, setRecent] = useState<string[]>(() => readRecent());

  useEffect(() => {
    if (!activeToolId) return;
    setRecent((prev) => {
      if (prev[0] === activeToolId) return prev;
      const next = [activeToolId, ...prev.filter((id) => id !== activeToolId)].slice(0, MAX_STORED);
      writeRecent(next);
      return next;
    });
  }, [activeToolId]);

  return recent;
}
