// In-memory hand-off between the home page and a tool. Deliberately NOT state,
// NOT storage and NOT the URL: pasted text must never be persisted or shared.
// Reading is destructive, so a tool applies a payload exactly once.
export interface Handoff {
  text: string;
  hint?: "base64" | "url";
}

const store = new Map<string, Handoff>();

export function setHandoff(toolId: string, text: string, hint?: Handoff["hint"]): void {
  store.set(toolId, hint ? { text, hint } : { text });
}

export function takeHandoff(toolId: string): Handoff | null {
  const value = store.get(toolId) ?? null;
  if (value) store.delete(toolId);
  return value;
}
