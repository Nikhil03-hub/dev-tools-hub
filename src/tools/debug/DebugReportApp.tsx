import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Copy, Download, FileSearch, Sparkles, Trash2, UploadCloud } from "lucide-react";
import type { Command } from "../../components/CommandPalette";
import type { ToolHandle } from "../../lib/toolHandle";
import { copyText, downloadText } from "../../lib/clipboard";
import { toast } from "../../lib/toastBus";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { analyze, renderReport, type ReportFormat } from "../../lib/debugkit/report";
import { DEBUG_SAMPLES, type DebugSample } from "../../lib/debugkit/samples";
import type { DebugReport, SegmentKind } from "../../lib/debugkit/types";
import { markDebugUseAndMaybeReturn, track, type MetricEvent } from "../../lib/metrics";
import FindingCard from "./components/FindingCard";
import RedactionLedger from "./components/RedactionLedger";
import JwtClaimsCard from "./components/JwtClaimsCard";
import LogSummaryCard from "./components/LogSummaryCard";
import SharePanel from "./components/SharePanel";
import SampleMenu from "./components/SampleMenu";

type ResultTab = "findings" | "sanitized" | "share";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PREVIEW_CAP = 200_000;

const KIND_LABEL: Record<SegmentKind, string> = {
  har: "HAR file",
  json: "JSON",
  curl: "cURL command",
  "http-request": "HTTP request",
  "http-response": "HTTP response",
  jwt: "JWT",
  env: ".env / config",
  log: "log / text",
};

const PLACEHOLDER =
  "Paste a failing request, a HAR file, a log or a JWT…\nTip: in Chrome DevTools → Network, right-click a request → Copy → Copy as cURL, then paste it here with the response.";

const SAMPLE_COMMAND_LABEL: Record<DebugSample["id"], string> = {
  "expired-token": "Load sample: expired token",
  "cors-har": "Load sample: CORS failure (HAR)",
  "java-log": "Load sample: service log",
};

const DebugReportApp = forwardRef<ToolHandle, { isActive: boolean }>(function DebugReportApp(props, ref) {
  const [input, setInput] = useState("");
  const [emails, setEmails] = useState(true);
  const [ips, setIps] = useState(true);
  const [tab, setTab] = useState<ResultTab>("findings");
  const [format, setFormat] = useState<ReportFormat>("ai");
  const [report, setReport] = useState<DebugReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const debounced = useDebouncedValue(input, input.length > 1_000_000 ? 800 : 300);

  useEffect(() => {
    if (debounced.trim() === "") {
      setReport(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const id = window.setTimeout(() => {
      const rep = analyze(debounced, { emails, ips });
      setReport(rep);
      setBusy(false);
      if (rep.findings.length > 0 || rep.redactions.length > 0) {
        track("debug-analyze", true);
        markDebugUseAndMaybeReturn();
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [debounced, emails, ips]);

  useEffect(() => {
    if (props.isActive) track("view-debug", true);
  }, [props.isActive]);

  const isEmpty = input.trim() === "";
  const shareText = useMemo(() => (report ? renderReport(report, format) : ""), [report, format]);

  function loadSample(sample: DebugSample) {
    setInput(sample.build());
    setTab("findings");
    track(`debug-sample-${sample.id}` as MetricEvent);
    toast(`Loaded sample: ${sample.label}`);
  }

  function clear() {
    setInput("");
    toast("Cleared");
  }

  async function readFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast("File is larger than 5 MB — paste the relevant part instead");
      return;
    }
    setInput(await file.text());
    toast(`Opened ${file.name}`);
  }

  function onFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void readFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void readFile(file);
  }

  async function copySanitized() {
    if (!report) return;
    await copyText(report.sanitized);
    toast("Copied sanitized input");
  }

  function downloadSanitized() {
    if (!report) return;
    const first = report.segments[0]?.kind;
    const name = first === "har" ? "sanitized.har" : first === "json" ? "sanitized.json" : "sanitized.txt";
    const mime = first === "har" || first === "json" ? "application/json" : "text/plain";
    track("debug-download-sanitized");
    void downloadText(name, report.sanitized, mime);
    toast(`Downloaded ${name}`);
  }

  async function copyReport() {
    if (!report) return;
    await copyText(shareText);
    toast("Copied — read it once before you send it");
    track(`debug-copy-${format}` as MetricEvent);
  }

  function downloadReport() {
    if (!report) return;
    void downloadText("debug-report.md", shareText, "text/markdown");
    track(`debug-copy-${format}` as MetricEvent);
    toast("Downloaded debug-report.md");
  }

  async function copyAiReport() {
    if (!report) return;
    await copyText(renderReport(report, "ai"));
    toast("Copied — read it once before you send it");
    track("debug-copy-ai");
  }

  function fakeDoor(which: "cli" | "team") {
    track(which === "cli" ? "fakedoor-cli" : "fakedoor-team");
    window.open("/waitlist.html", "_blank", "noopener");
  }

  const commands: Command[] = [
    ...DEBUG_SAMPLES.map((s) => ({
      id: `debug-sample-${s.id}`,
      label: SAMPLE_COMMAND_LABEL[s.id],
      group: "Debug Report",
      action: () => loadSample(s),
    })),
    { id: "debug-clear", label: "Clear input", group: "Debug Report", action: clear },
    { id: "debug-go-findings", label: "Go to Findings", group: "Debug Report", action: () => setTab("findings") },
    { id: "debug-go-sanitized", label: "Go to Sanitized", group: "Debug Report", action: () => setTab("sanitized") },
    { id: "debug-go-share", label: "Go to Share", group: "Debug Report", action: () => setTab("share") },
    ...(report
      ? [
          { id: "debug-copy-ai", label: "Copy AI-ready report", group: "Debug Report", action: copyAiReport },
          { id: "debug-copy-sanitized", label: "Copy sanitized input", group: "Debug Report", action: copySanitized },
        ]
      : []),
  ];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  const detectedKinds = report ? [...new Set(report.segments.map((s) => s.kind))] : [];
  const redactedTotal = report ? report.redactions.reduce((a, r) => a + r.occurrences, 0) : 0;
  const sevCount = (s: string) => (report ? report.findings.filter((f) => f.severity === s).length : 0);
  const firstHighIndex = report ? report.findings.findIndex((f) => f.severity === "high") : -1;

  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(360px,1fr)_minmax(440px,1.3fr)] lg:gap-4 lg:overflow-hidden lg:p-4">
      <section className="flex min-h-[40vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-col gap-2.5 border-b border-border-subtle p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <SampleMenu onPick={loadSample} />
            <button
              type="button"
              data-testid="btn-debug-open-file"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-border hover:bg-surface hover:text-ink"
            >
              <UploadCloud className="h-3.5 w-3.5" strokeWidth={2} />
              Open file
            </button>
            <input
              ref={fileRef}
              type="file"
              data-testid="debug-file-input"
              accept=".har,.json,.log,.txt,.env,.yaml,.yml,.curl,.http,text/*"
              className="hidden"
              onChange={onFilePicked}
              tabIndex={-1}
              aria-hidden="true"
            />
            <button
              type="button"
              data-testid="btn-debug-clear"
              onClick={clear}
              disabled={isEmpty}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-border hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Clear
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <ToggleChip testId="toggle-debug-emails" label="Redact emails" pressed={emails} onToggle={() => setEmails((v) => !v)} />
            <ToggleChip testId="toggle-debug-ips" label="Redact IPs" pressed={ips} onToggle={() => setIps((v) => !v)} />
          </div>

          <div data-testid="debug-detected" className="flex items-start gap-1.5 text-xs text-ink-faint">
            <FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {isEmpty ? (
              <span>Paste a failing request, HAR, log, JWT or .env — or drop a file</span>
            ) : busy || !report ? (
              <span data-testid="debug-analyzing">Analyzing…</span>
            ) : (
              <span className="text-ink-dim">
                <span className="font-medium text-ink">Detected:</span> {detectedKinds.map((k) => KIND_LABEL[k]).join(" · ")}
                {report.exchanges > 0 ? ` · ${report.exchanges} request${report.exchanges === 1 ? "" : "s"}` : ""}
                {report.jwts.length > 0 ? ` · ${report.jwts.length} JWT${report.jwts.length === 1 ? "" : "s"}` : ""}
              </span>
            )}
          </div>
        </div>

        <div
          className="relative min-h-0 flex-1"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <textarea
            data-testid="debug-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Debug input"
            placeholder={PLACEHOLDER}
            spellCheck={false}
            className="h-full min-h-[14rem] w-full resize-none bg-transparent p-3.5 font-mono text-[13px] leading-6 text-ink outline-none placeholder:text-ink-faint"
          />
          {dragOver && (
            <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent bg-canvas/90 text-accent">
              <UploadCloud className="h-8 w-8" strokeWidth={1.5} />
              <p className="text-sm font-medium">Drop your file</p>
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle p-2">
          {(
            [
              ["findings", "Findings"],
              ["sanitized", "Sanitized"],
              ["share", "Share"],
            ] as [ResultTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-testid={`debug-tab-${id}`}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === id ? "bg-accent/15 text-accent" : "text-ink-dim hover:bg-raised hover:text-ink"
              }`}
            >
              {label}
              {id === "findings" && report && (
                <span data-testid="debug-findings-count" className="rounded-full bg-raised px-1.5 py-0.5 text-[10px] text-ink-dim">
                  {report.findings.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {!report ? (
          <div data-testid="debug-empty" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center">
            <h2 className="text-base font-semibold text-ink">Paste a failing request, HAR file or log</h2>
            <p className="max-w-md text-sm text-ink-dim">
              You'll get the likely cause, the evidence, and a redacted report you can safely share. Everything runs in your browser — nothing is uploaded.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {DEBUG_SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  data-testid={`debug-empty-sample-${s.id}`}
                  onClick={() => loadSample(s)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                >
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : tab === "findings" ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <div data-testid="debug-summary" className="rounded-lg border border-border-subtle bg-raised/40 p-3">
              <p className="text-sm text-ink">
                {[
                  sevCount("high") > 0 ? `${sevCount("high")} high` : null,
                  sevCount("medium") > 0 ? `${sevCount("medium")} medium` : null,
                  sevCount("low") > 0 ? `${sevCount("low")} low` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "0 findings"}
                {` · ${redactedTotal} values redacted`}
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                Rules-based checks, not AI. “Detected” = a rule matched your data. “Not verified” = shown but not confirmed.
              </p>
            </div>
            {report.findings.length === 0 && (
              <p className="text-sm text-ink-dim">
                No rule matched. The checks cover common HTTP, CORS, auth/JWT and log problems — it doesn't mean nothing is wrong.
              </p>
            )}
            {report.findings.map((f, i) => (
              <FindingCard key={`${f.id}-${i}`} finding={f} defaultOpen={i === firstHighIndex} />
            ))}
            {report.jwts.length > 0 && <JwtClaimsCard jwts={report.jwts} />}
            {report.logs && <LogSummaryCard logs={report.logs} />}
            {report.notes.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-faint">
                {report.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        ) : tab === "sanitized" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-[13px] text-warn">
              Redaction covers known secret formats and fields named like secrets. Review before sharing — it can miss unusual secrets such as customer names or internal hostnames.
            </div>
            <RedactionLedger rows={report.redactions} />
            <pre
              data-testid="debug-sanitized-output"
              className="max-h-[50vh] min-h-[10rem] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border-subtle bg-canvas/60 p-3 font-mono text-[12px] leading-5 text-ink-dim"
            >
              {report.sanitized.length > PREVIEW_CAP
                ? `${report.sanitized.slice(0, PREVIEW_CAP)}\n… showing the first 200,000 characters — Download includes everything.`
                : report.sanitized}
            </pre>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="btn-debug-copy-sanitized"
                onClick={copySanitized}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                Copy
              </button>
              <button
                type="button"
                data-testid="btn-debug-download-sanitized"
                onClick={downloadSanitized}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:bg-surface hover:text-ink"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                Download
              </button>
            </div>
          </div>
        ) : (
          <SharePanel
            format={format}
            onFormat={setFormat}
            text={shareText}
            onCopy={copyReport}
            onDownload={downloadReport}
            onFakeDoor={fakeDoor}
          />
        )}
      </section>
    </main>
  );
});

export default DebugReportApp;

function ToggleChip({ testId, label, pressed, onToggle }: { testId: string; label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={pressed}
      onClick={onToggle}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        pressed ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-raised text-ink-dim hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
