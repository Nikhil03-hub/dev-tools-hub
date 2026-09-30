// Minimal pub/sub so any component (including deeply nested tree rows) can
// trigger a toast without prop-drilling a callback through every layer.
type Listener = (message: string) => void;
let listener: Listener | null = null;

export function setToastListener(l: Listener | null) {
  listener = l;
}

export function toast(message: string) {
  listener?.(message);
}
