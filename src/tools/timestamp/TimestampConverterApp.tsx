import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Copy, Download, Search, Trash2 } from "lucide-react";
import type { Command } from "../../components/CommandPalette";
import type { ToolHandle } from "../../lib/toolHandle";
import { copyText, downloadText } from "../../lib/clipboard";
import { toast } from "../../lib/toastBus";
import {
  buildPresets,
  buildTimezoneRows,
  getLocalTimeZone,
  listTimeZones,
  parseEpoch,
  parseHumanDateTime,
  toEpochOutput,
  type EpochUnitMode,
} from "../../lib/timestamp";
import PresetButtons from "./components/PresetButtons";
import TimezoneResultList from "./components/TimezoneResultList";
import TimezonePicker from "./components/TimezonePicker";

type Mode = "fromEpoch" | "fromDate";

const PRESETS = buildPresets();

const UNIT_OPTIONS: { id: EpochUnitMode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "seconds", label: "Seconds" },
  { id: "milliseconds", label: "Milliseconds" },
];

// Same "static action button" idiom as Load sample in JSON/JWT/Regex: it
// reads the clock once, at the moment it's clicked, and writes a plain
// epoch value into ordinary state. Nothing here ticks — a frozen/mocked
// Date in tests controls this exactly like it controls the presets below,
// with no separate test-only code path.
function readNowAsEpochSeconds(): number {
  return Math.floor(PRESETS.find((p) => p.id === "now")!.getInstant().ms / 1000);
}

const TimestampConverterApp = forwardRef<ToolHandle, { isActive: boolean }>(function TimestampConverterApp(_props, ref) {
  const [mode, setMode] = useState<Mode>("fromEpoch");
  const [epochInput, setEpochInput] = useState("");
  const [epochUnitMode, setEpochUnitMode] = useState<EpochUnitMode>("auto");
  const [dateTimeInput, setDateTimeInput] = useState("");
  const [interpretZone, setInterpretZone] = useState(() => getLocalTimeZone());
  const [pinnedZones, setPinnedZones] = useState<string[]>(() => {
    const local = getLocalTimeZone();
    return local === "UTC" ? ["UTC"] : [local, "UTC"];
  });
  // Which "Jump to" preset (if any) produced the epoch value currently in
  // the field — drives the highlight on PresetButtons. "now" covers both
  // the toolbar Now button and the Now preset chip, since they're the same
  // action. Cleared the instant anything could make the value stop
  // matching: hand-editing either input, or changing the epoch unit (which
  // changes what the same digits mean).
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  const epochRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const allZones = useMemo(() => listTimeZones(), []);

  const isEmpty = mode === "fromEpoch" ? epochInput.trim() === "" : dateTimeInput.trim() === "";
  const epochParseResult = mode === "fromEpoch" && epochInput.trim() !== "" ? parseEpoch(epochInput, epochUnitMode) : null;
  const dateParseResult = mode === "fromDate" && dateTimeInput.trim() !== "" ? parseHumanDateTime(dateTimeInput, interpretZone) : null;
  const parseResult = mode === "fromEpoch" ? epochParseResult : dateParseResult;
  const instant = parseResult?.ok ? parseResult.data.instant : null;
  const epochOutput = instant ? toEpochOutput(instant) : null;
  const timezoneRows = instant ? buildTimezoneRows(instant, pinnedZones) : [];

  function clear() {
    setEpochInput("");
    setDateTimeInput("");
    setSelectedPresetId(null);
    toast("Cleared");
  }

  function setNow() {
    setMode("fromEpoch");
    setEpochUnitMode("seconds");
    setEpochInput(String(readNowAsEpochSeconds()));
    setSelectedPresetId("now");
    toast("Loaded current time");
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    const presetInstant = preset.getInstant();
    setMode("fromEpoch");
    setEpochUnitMode("seconds");
    setEpochInput(String(Math.floor(presetInstant.ms / 1000)));
    setSelectedPresetId(preset.id);
    toast(`Loaded: ${preset.label}`);
  }

  function addZone(zone: string) {
    setPinnedZones((zones) => (zones.includes(zone) ? zones : [...zones, zone]));
    toast(`Added ${zone}`);
  }

  function removeZone(zone: string) {
    setPinnedZones((zones) => (zones.length <= 1 ? zones : zones.filter((z) => z !== zone)));
  }

  async function copyLabeled(label: string, value: string) {
    await copyText(value);
    toast(`Copied ${label}`);
  }

  function buildResultPayload(): string {
    return JSON.stringify({ epoch: epochOutput, timezones: timezoneRows }, null, 2);
  }

  async function copyAll() {
    if (!epochOutput) return;
    await copyText(buildResultPayload());
    toast("Copied full result");
  }

  async function downloadAll() {
    if (!epochOutput) return;
    await downloadText("timestamp-conversion.json", buildResultPayload(), "application/json");
    toast("Downloaded timestamp-conversion.json");
  }

  const commands: Command[] = [
    { id: "timestamp-now", label: "Load current time (Now)", group: "Timestamp Converter", action: setNow },
    { id: "timestamp-clear", label: "Clear input", group: "Timestamp Converter", action: clear },
    {
      id: "timestamp-focus-epoch",
      label: "Focus epoch field",
      group: "Timestamp Converter",
      action: () => {
        setMode("fromEpoch");
        requestAnimationFrame(() => epochRef.current?.focus());
      },
    },
    {
      id: "timestamp-focus-date",
      label: "Focus date & time field",
      group: "Timestamp Converter",
      action: () => {
        setMode("fromDate");
        requestAnimationFrame(() => dateRef.current?.focus());
      },
    },
    { id: "timestamp-mode-epoch", label: "Switch to: convert from epoch", group: "Timestamp Converter", action: () => setMode("fromEpoch") },
    { id: "timestamp-mode-date", label: "Switch to: convert from date & time", group: "Timestamp Converter", action: () => setMode("fromDate") },
    ...PRESETS.map((p) => ({
      id: `timestamp-preset-${p.id}`,
      label: `Preset: ${p.label}`,
      group: "Timestamp Converter",
      action: () => applyPreset(p),
    })),
    ...(epochOutput
      ? [
          { id: "timestamp-copy-seconds", label: "Copy epoch seconds", group: "Timestamp Converter", action: () => copyLabeled("epoch seconds", String(epochOutput.seconds)) },
          { id: "timestamp-copy-ms", label: "Copy epoch milliseconds", group: "Timestamp Converter", action: () => copyLabeled("epoch milliseconds", String(epochOutput.milliseconds)) },
          { id: "timestamp-copy-iso", label: "Copy ISO 8601", group: "Timestamp Converter", action: () => copyLabeled("ISO 8601", epochOutput.iso) },
          { id: "timestamp-copy-all", label: "Copy full result (JSON)", group: "Timestamp Converter", action: copyAll },
          { id: "timestamp-download-all", label: "Download full result (JSON)", group: "Timestamp Converter", action: downloadAll },
        ]
      : []),
  ];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(360px,1fr)_minmax(440px,1.3fr)] lg:gap-4 lg:overflow-hidden lg:p-4">
      <section className="flex min-h-[40vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-col gap-2.5 border-b border-border-subtle p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-timestamp-now"
              onClick={setNow}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <Clock className="h-3.5 w-3.5" strokeWidth={2} />
              Now
            </button>
            <button
              type="button"
              data-testid="btn-timestamp-clear"
              onClick={clear}
              disabled={epochInput === "" && dateTimeInput === ""}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-border hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Clear
            </button>
          </div>

          <div data-testid="timestamp-mode-toggle" className="flex items-center gap-1 self-start rounded-lg border border-border-subtle bg-raised/60 p-1">
            <button
              type="button"
              data-testid="timestamp-mode-epoch"
              onClick={() => setMode("fromEpoch")}
              aria-pressed={mode === "fromEpoch"}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === "fromEpoch" ? "bg-accent/15 text-accent" : "text-ink-dim hover:text-ink"
              }`}
            >
              From epoch
            </button>
            <button
              type="button"
              data-testid="timestamp-mode-date"
              onClick={() => setMode("fromDate")}
              aria-pressed={mode === "fromDate"}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === "fromDate" ? "bg-accent/15 text-accent" : "text-ink-dim hover:text-ink"
              }`}
            >
              From date & time
            </button>
          </div>

          <div className={mode === "fromEpoch" ? "flex flex-col gap-2" : "hidden"}>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-dim" htmlFor="timestamp-epoch-input">
                Epoch value
              </label>
              <input
                id="timestamp-epoch-input"
                ref={epochRef}
                data-testid="timestamp-epoch-input"
                value={epochInput}
                onChange={(e) => {
                  setSelectedPresetId(null);
                  setEpochInput(e.target.value);
                }}
                placeholder="1735689600"
                inputMode="numeric"
                spellCheck={false}
                className="w-full rounded-lg border border-border bg-raised px-3 py-1.5 font-mono text-[13px] text-ink outline-none focus:border-accent/50 placeholder:text-ink-faint"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-ink-dim">Unit:</span>
              <div data-testid="timestamp-unit-toggle" className="flex items-center gap-1 rounded-lg border border-border-subtle bg-raised/60 p-1">
                {UNIT_OPTIONS.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    data-testid={`timestamp-unit-${u.id}`}
                    onClick={() => {
                      setSelectedPresetId(null);
                      setEpochUnitMode(u.id);
                    }}
                    aria-pressed={epochUnitMode === u.id}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      epochUnitMode === u.id ? "bg-accent/15 text-accent" : "text-ink-dim hover:text-ink"
                    }`}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
              {epochParseResult?.ok && epochUnitMode === "auto" && (
                <span data-testid="timestamp-detected-unit" className="text-[11px] text-ink-faint">
                  Auto-detected as {epochParseResult.data.detectedUnit}.
                </span>
              )}
            </div>
          </div>

          <div className={mode === "fromDate" ? "flex flex-col gap-2" : "hidden"}>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-dim" htmlFor="timestamp-datetime-input">
                Date &amp; time
              </label>
              <input
                id="timestamp-datetime-input"
                ref={dateRef}
                type="datetime-local"
                step="1"
                data-testid="timestamp-datetime-input"
                value={dateTimeInput}
                onChange={(e) => {
                  setSelectedPresetId(null);
                  setDateTimeInput(e.target.value);
                }}
                className="w-full rounded-lg border border-border bg-raised px-3 py-1.5 font-mono text-[13px] text-ink outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-dim" htmlFor="timestamp-interpret-zone">
                Interpret this date &amp; time as being in
              </label>
              <select
                id="timestamp-interpret-zone"
                data-testid="timestamp-interpret-zone"
                value={interpretZone}
                onChange={(e) => setInterpretZone(e.target.value)}
                className="w-full rounded-lg border border-border bg-raised px-3 py-1.5 text-[13px] text-ink outline-none focus:border-accent/50"
              >
                {allZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-ink-faint">
                This picks how the date &amp; time above is read — not how it's displayed. The result on the right
                shows this same instant in every timezone listed there.
              </p>
            </div>
          </div>

          {isEmpty ? (
            <div data-testid="timestamp-status" data-status="empty" className="flex items-center gap-1.5 text-xs text-ink-faint">
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
              {mode === "fromEpoch" ? "Enter an epoch value to begin" : "Pick a date & time to begin"}
            </div>
          ) : !parseResult?.ok ? (
            <div data-testid="timestamp-status" data-status="invalid" className="flex items-start gap-1.5 text-xs text-err">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
              <span>{parseResult && !parseResult.ok ? parseResult.error : ""}</span>
            </div>
          ) : (
            <div
              data-testid="timestamp-status"
              data-status="valid"
              data-epoch-seconds={epochOutput?.seconds}
              className="flex items-center gap-1.5 text-xs font-medium text-ok"
            >
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              {epochOutput?.iso}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="mb-1.5 text-xs font-medium text-ink-dim">Jump to</p>
          <PresetButtons presets={PRESETS} selectedId={selectedPresetId} onApply={applyPreset} />
        </div>
      </section>

      <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex items-center gap-1 border-b border-border-subtle p-2">
          <span className="px-2 py-1.5 text-xs font-medium text-ink-dim">Converted instant</span>
          {instant && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 pr-1">
              <button
                type="button"
                data-testid="btn-copy-timestamp-result"
                onClick={copyAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                Copy
              </button>
              <button
                type="button"
                data-testid="btn-download-timestamp-result"
                onClick={downloadAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                Download
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!instant || !epochOutput ? (
            <PanelEmpty
              text={
                isEmpty
                  ? "Enter an epoch value or pick a date & time on the left to see it converted here."
                  : "Fix the value on the left to see it converted here."
              }
            />
          ) : (
            <>
              <div data-testid="timestamp-epoch-output" className="grid grid-cols-1 gap-1.5 border-b border-border-subtle p-3 sm:grid-cols-3">
                <EpochField
                  label="Seconds"
                  value={String(epochOutput.seconds)}
                  testId="timestamp-epoch-seconds"
                  onCopy={() => copyLabeled("epoch seconds", String(epochOutput.seconds))}
                />
                <EpochField
                  label="Milliseconds"
                  value={String(epochOutput.milliseconds)}
                  testId="timestamp-epoch-milliseconds"
                  onCopy={() => copyLabeled("epoch milliseconds", String(epochOutput.milliseconds))}
                />
                <EpochField
                  label="ISO 8601"
                  value={epochOutput.iso}
                  testId="timestamp-epoch-iso"
                  onCopy={() => copyLabeled("ISO 8601", epochOutput.iso)}
                />
              </div>

              <TimezoneResultList rows={timezoneRows} pinnedZones={pinnedZones} onCopy={copyLabeled} onRemove={removeZone} />
            </>
          )}
        </div>

        <TimezonePicker allZones={allZones} pinnedZones={pinnedZones} onAdd={addZone} />
      </section>
    </main>
  );
});

export default TimestampConverterApp;

function EpochField({ label, value, testId, onCopy }: { label: string; value: string; testId: string; onCopy: () => void }) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-raised px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
        <p data-testid={`${testId}-value`} className="truncate font-mono text-[12px] text-ink">
          {value}
        </p>
      </div>
      <button
        type="button"
        data-testid={`btn-${testId}-copy`}
        onClick={onCopy}
        title={`Copy ${label}`}
        className="shrink-0 rounded-md border border-border bg-surface p-1 text-ink-dim hover:text-ink"
      >
        <Copy className="h-3 w-3" strokeWidth={2} />
      </button>
    </div>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-faint">{text}</div>;
}
