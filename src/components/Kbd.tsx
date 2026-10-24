/**
 * A keyboard hint. `⌘` is shown on Apple platforms and "Ctrl" everywhere else,
 * so the same component never lies about the shortcut on a Windows machine.
 */
const IS_APPLE = typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

export default function Kbd({ keys }: { keys: string[] }) {
  const shown = keys.map((k) => (k === "mod" ? (IS_APPLE ? "⌘" : "Ctrl") : k));
  return (
    <kbd className="kbd">
      {shown.map((k, i) => (
        <span key={`${k}-${i}`}>{k}</span>
      ))}
    </kbd>
  );
}
