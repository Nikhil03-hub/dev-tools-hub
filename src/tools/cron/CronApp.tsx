import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Copy, Sparkles } from "lucide-react";
import { copyAndNotify } from "../../components/CopyButton";
import type { Command } from "../../components/CommandPalette";
import { CRON_PRESETS, explainCron, type CronExplanation } from "../../core/cron/cron";
import type { ToolHandle } from "../../lib/toolHandle";
import type { ToolProps } from "../../registry/types";
import { takeHandoff } from "../../shell/handoff";
import { toast } from "../../lib/toastBus";
import { useDebouncedValue } from "../../lib/useDebouncedValue";

const SAMPLE_CRON = "*/15 9-17 * * 1-5";

const FALLBACK_ZONES = ["UTC", "Europe/London", "America/New_York", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];

function zoneList(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  const names = new Set<string>(["UTC", ...FALLBACK_ZONES]);
  if (supported) {
    try {
      for (const z of supported("timeZone")) names.add(z);
    } catch {
      /* the fallbacks above are enough */
    }
  }
  return [...names].sort();
}

function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const CronApp = forwardRef<ToolHandle, ToolProps>(function CronApp(props, ref) {
  const [expr, setExpr] = useState("");
  const [timeZone, setTimeZone] = useState(localZone);
  const debounced = useDebouncedValue(expr, 150);

  const result = useMemo(() => {
    if (debounced.trim() === "") return null;
    return explainCron(debounced, { timeZone, from: new Date() });
  }, [debounced, timeZone]);

  useEffect(() => {
    if (!props.isActive) return;
    const handoff = takeHandoff("cron");
    if (handoff) setExpr(handoff.text);
  }, [props.isActive]);

  const zones = useMemo(zoneList, []);
  const explanation: CronExplanation | null = result?.ok ? result.value : null;

  function loadSample() {
    setExpr(SAMPLE_CRON);
    toast("Loaded sample expression");
  }

  function clear() {
    setExpr("");
    toast("Cleared");
  }

  const copySummary = useCallback(async () => {
    if (!explanation) {
      toast("Nothing to copy yet");
      return;
    }
    const lines = [`${explanation.description}`, "", `Time zone: ${timeZone}`, "Next runs:", ...(explanation.nextRuns.length ? explanation.nextRuns.map((r) => `  ${r}`) : ["  none found"])];
    await copyAndNotify(lines.join("\n"), "Copied the explanation");
  }, [explanation, timeZone]);

  const commands: Command[] = [
    { id: "cron-sample", label: "Load sample expression", group: "Cron Explainer", action: loadSample },
    { id: "cron-clear", label: "Clear expression", group: "Cron Explainer", action: clear },
    ...(explanation ? [{ id: "cron-copy", label: "Copy output", group: "Cron Explainer", action: copySummary }] : []),
    { id: "cron-tz-utc", label: "Show runs in UTC", group: "Cron Explainer", action: () => setTimeZone("UTC") },
  ];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  const invalid = result !== null && !result.ok;

  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(360px,1fr)_minmax(420px,1.1fr)] lg:gap-4 lg:overflow-hidden lg:p-4">
      <section className="flex min-h-[40vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-col gap-2.5 border-b border-border-subtle p-3">
          <label htmlFor="cron-field" className="text-xs font-medium text-ink-dim">
            Cron expression
          </label>
          <input
            id="cron-field"
            data-testid="cron-input"
            type="text"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Cron expression"
            placeholder="*/15 9-17 * * 1-5"
            className="focus-ring w-full rounded-lg border border-border bg-canvas px-3 py-2.5 font-mono text-[14px] text-ink placeholder:text-ink-faint"
          />

          <div data-testid="cron-presets" className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.expr}
                type="button"
                onClick={() => setExpr(p.expr)}
                aria-pressed={expr.trim() === p.expr}
                className={`focus-ring rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  expr.trim() === p.expr ? "border-accent/50 bg-accent/15 text-accent" : "border-border bg-raised text-ink-dim hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ink-dim">
              <span>Time zone</span>
              <select
                data-testid="cron-timezone"
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value)}
                className="focus-ring max-w-[190px] rounded-lg border border-border bg-raised px-2 py-1 text-xs text-ink"
              >
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              data-testid="btn-cron-sample"
              onClick={loadSample}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              Sample
            </button>
            <button
              type="button"
              data-testid="btn-cron-clear"
              onClick={clear}
              disabled={expr === ""}
              className="rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
          </div>

          {expr.trim() === "" ? (
            <div data-testid="cron-status" data-status="empty" className="text-xs text-ink-faint">
              Type or paste an expression, or pick a preset above
            </div>
          ) : explanation ? (
            <div data-testid="cron-status" data-status="valid" className="inline-flex items-center gap-1.5 text-xs font-medium text-ok">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              Valid {explanation.withSeconds ? "6-field" : "5-field"} expression
            </div>
          ) : invalid ? (
            <div data-testid="cron-status" data-status="invalid" className="flex items-start gap-1.5 text-xs text-err">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
              <span>{result && !result.ok ? result.error.message : ""}</span>
            </div>
          ) : null}
        </div>

        <div data-testid="cron-input-panel" className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="text-xs text-ink-faint">
            Five fields: minute, hour, day of month, month, day of week. Add a leading seconds value for the 6-field form. Times below are in{" "}
            <span className="font-mono text-ink-dim">{timeZone}</span>, starting from now.
          </p>
          <p className="mt-2 text-xs text-ink-faint">
            Nothing is scheduled or run here, and nothing is sent anywhere — this only reads the expression.
          </p>
        </div>
      </section>

      <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle p-2">
          <span className="px-1 text-xs font-medium text-ink-dim">Explanation</span>
          <button
            type="button"
            data-testid="cron-copy"
            onClick={copySummary}
            disabled={!explanation}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
            Copy summary
          </button>
        </div>

        <div data-testid="cron-output" className="min-h-0 flex-1 overflow-y-auto p-3">
          {!explanation ? (
            <p className="flex h-full items-center justify-center p-4 text-center text-sm text-ink-faint">
              {expr.trim() === "" ? "The plain-English meaning and next runs appear here." : "Fix the expression on the left to see it explained."}
            </p>
          ) : (
            <>
              <p data-testid="cron-description" className="text-[17px] leading-6 font-medium text-ink">
                {explanation.description}
              </p>

              <table data-testid="cron-fields" className="mt-3 w-full border-collapse text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-ink-faint">
                    <th className="border-b border-border-subtle pb-1 font-medium">Field</th>
                    <th className="border-b border-border-subtle pb-1 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {explanation.fields.map((f) => (
                    <tr key={f.name}>
                      <td className="border-b border-border-subtle py-1 pr-2 text-ink-dim">{f.name}</td>
                      <td className="border-b border-border-subtle py-1 font-mono text-ink">{f.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h2 className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-ink-dim">
                <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                Next {explanation.nextRuns.length || ""} runs
              </h2>
              {explanation.nextRuns.length > 0 ? (
                <ol data-testid="cron-runs" className="mt-1.5 space-y-1">
                  {explanation.nextRuns.map((r) => (
                    <li key={r} className="rounded-lg border border-border-subtle bg-canvas px-2.5 py-1.5 font-mono text-[12px] text-ink">
                      {r}
                    </li>
                  ))}
                </ol>
              ) : (
                <p data-testid="cron-runs-none" className="mt-1.5 rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-2 text-xs text-warn">
                  No upcoming run was found in {timeZone}. A valid expression can still never fire — for example a day of month that the selected month does not have.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
});

export default CronApp;
