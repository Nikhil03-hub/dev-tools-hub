import { Bug, Braces, KeyRound, Regex, Clock, Binary } from "lucide-react";

// Explicit icon map. Never `import * as icons from "lucide-react"`: that pulls
// every icon into the bundle (~141 kB gzip) and breaks the size budget.
// A tool's `icon` string in meta.ts must be a key of this object.
export const ICONS = { Bug, Braces, KeyRound, Regex, Clock, Binary } as const;
