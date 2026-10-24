export default function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="focus-ring inline-flex items-center gap-2 rounded-md text-[13px] text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={`relative flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors ${
          checked ? "border-accent bg-accent" : "border-border bg-raised"
        }`}
      >
        <span
          className={`absolute h-2.5 w-2.5 rounded-full transition-transform ${
            checked ? "translate-x-[15px] bg-on-accent" : "translate-x-[3px] bg-ink-faint"
          }`}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}
