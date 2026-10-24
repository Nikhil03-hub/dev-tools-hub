import { useEffect, useState } from "react";

/**
 * Reactive media query. Used to render exactly ONE copy of the navigation:
 * the sidebar at >=768px, the drawer below it. Duplicating both would duplicate
 * every tool link and its data-testid.
 */
export default function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window === "undefined" ? true : window.matchMedia(query).matches));

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
