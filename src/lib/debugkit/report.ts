// Debug Report orchestration: input -> segments -> redaction -> findings
// -> summaries -> share-ready text. Pure and synchronous; no network.

import { checkExchange, checkJwt, FindingSet, jwtSummary, type RefTime } from "./findings";
import { summarizeLogs } from "./logs";
import { harToExchanges, isHarObject, segmentsToExchanges, splitSegments } from "./parse";
import { Redactor } from "./redact";
import type { DebugReport, Exchange, Finding, RedactOptions } from "./types";

export interface AnalyzeOptions extends Partial<RedactOptions> {
  /** Reference "now" in ms (tests pass a fixed value). Default Date.now(). */
  now?: number;
}

/** Hard input cap for the browser prototype (keeps the tab responsive). */
export const MAX_INPUT_CHARS = 5_000_000;

const JWT_ANY = /\beyJ[A-Za-z0-9_-]{2,}\.eyJ[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*/g;

function prepareHarForSharing(har: { log: { entries: unknown[] } }, notes: string[]): unknown {
  const clone = JSON.parse(JSON.stringify(har)) as { log: { entries: Record<string, any>[] } };
  let omitted = 0;
  let truncated = 0;
  for (const e of clone.log.entries) {
    const c = e?.response?.content;
    if (!c || typeof c.text !== "string") continue;
    const mime = String(c.mimeType ?? "");
    if (c.encoding === "base64" || /^(image|font|audio|video)\//.test(mime) || /octet-stream|wasm/.test(mime)) {
      c.text = `[binary content omitted: ${c.text.length} chars]`;
      delete c.encoding;
      omitted++;
    } else if (c.text.length > 50_000) {
      c.text = `${c.text.slice(0, 50_000)}\n[… truncated ${c.text.length - 50_000} chars]`;
      truncated++;
    }
  }
  if (omitted) notes.push(`${omitted} binary response bodies (images/fonts/etc.) were omitted from the sanitized HAR.`);
  if (truncated) notes.push(`${truncated} very large response bodies were truncated to 50,000 characters.`);
  return clone;
}

export function analyze(input: string, opts: AnalyzeOptions = {}): DebugReport {
  const notes: string[] = [];
  const now = opts.now ?? Date.now();
  const fallback: RefTime = { ms: now, source: opts.now !== undefined ? "the reference time you chose" : "your device's current time" };
  const r = new Redactor({ emails: opts.emails, ips: opts.ips });

  let text = input;
  if (text.length > MAX_INPUT_CHARS) {
    text = text.slice(0, MAX_INPUT_CHARS);
    notes.push(`Input was longer than ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters; only the first part was analysed.`);
  }

  const segments = splitSegments(text);
  let exchanges: Exchange[] = [];
  let sanitized: string;
  let logText = "";

  const whole = segments.length === 1 && (segments[0].kind === "har" || segments[0].kind === "json") ? segments[0] : null;
  if (whole) {
    const parsed = JSON.parse(whole.text);
    if (whole.kind === "har" && isHarObject(parsed)) {
      exchanges = harToExchanges(parsed);
      sanitized = JSON.stringify(r.redactJson(prepareHarForSharing(parsed, notes)), null, 2);
    } else {
      sanitized = JSON.stringify(r.redactJson(parsed), null, 2);
    }
  } else {
    // Redact the whole text in document order so placeholder numbers follow reading order.
    sanitized = r.redactText(text);
    const conv = segmentsToExchanges(segments);
    exchanges = conv.exchanges;
    notes.push(...conv.notes);
    logText = segments.filter((s) => s.kind === "log").map((s) => s.text).join("\n");
  }
  // Snapshot BEFORE findings (evidence formatting re-uses the redactor).
  const redactions = r.summary();

  const fs = new FindingSet();
  for (const x of exchanges) checkExchange(x, r, fs, fallback);

  // Standalone JWTs (not attached to any exchange): check against the fallback time.
  const sentWithRequests = new Set<string>();
  for (const x of exchanges) {
    for (const h of x.requestHeaders) for (const m of h.value.match(JWT_ANY) ?? []) sentWithRequests.add(m);
    for (const m of x.url.match(JWT_ANY) ?? []) sentWithRequests.add(m);
  }
  const jwts = r.jwts();
  for (const { placeholder, raw } of jwts) {
    if (!sentWithRequests.has(raw)) checkJwt(placeholder, raw, fallback, fs, "(found in the pasted text)");
  }
  if (jwts.length) {
    fs.add("jwt-signature-not-verified", {
      id: "jwt-signature-not-verified",
      severity: "info",
      label: "NOT_VERIFIED",
      title: `JWT signature${jwts.length > 1 ? "s were" : " was"} not verified`,
      why: "Decoding a JWT only reads its contents. It does not prove the token is genuine, and we never contact your identity provider.",
      action: "Signature and audience/issuer checks happen on your server; compare the aud/iss claims below with what your API is configured to accept.",
      evidence: jwts.map((j) => j.placeholder),
    });
  }
  const jwtSummaries = jwts.map((j) => jwtSummary(j.placeholder, j.raw, r)).filter((j): j is NonNullable<typeof j> => j !== null);

  let logs;
  if (logText.trim()) {
    logs = summarizeLogs(r.redactText(logText));
    if (logs.errorLines > 0) {
      const topErr = logs.templates.find((t) => t.level === "error");
      fs.add("log-errors", {
        id: "log-errors",
        severity: "medium",
        label: "DETECTED",
        title: `${logs.errorLines} error line${logs.errorLines === 1 ? "" : "s"} in the log (${logs.distinctTemplates} distinct messages across ${logs.nonEmptyLines} lines)`,
        why: "Repeated lines were grouped by masking numbers, IDs and timestamps, so you can see which distinct problems occurred and how often.",
        action: logs.exceptions.length
          ? "Start with the root exception listed below — it is usually the real cause; later errors are often consequences."
          : "Start with the most frequent / earliest error message below.",
        evidence: [
          ...(logs.exceptions.length
            ? [((e: string) => (e.startsWith("Root cause:") ? e : `Root exception: ${e}`))(logs.exceptions[logs.exceptions.length - 1])]
            : []),
          ...(topErr ? [`Most frequent error (×${topErr.count}, first at line ${topErr.firstLine}): ${topErr.template}`] : []),
          ...(logs.firstTimestamp ? [`Time range: ${logs.firstTimestamp} → ${logs.lastTimestamp}`] : []),
        ],
      });
    }
  }

  return {
    segments: segments.map((s) => ({ kind: s.kind, startLine: s.startLine, lines: s.text.split(/\r?\n/).length })),
    exchanges: exchanges.length,
    findings: fs.list(),
    jwts: jwtSummaries,
    logs,
    redactions,
    sanitized,
    notes,
    referenceTime: new Date(now).toISOString(),
    referenceTimeSource: fallback.source,
  };
}

// ---------------- Rendering ----------------

export type ReportFormat = "ai" | "issue" | "plain";

const SEV_LABEL = { high: "HIGH", medium: "MEDIUM", low: "LOW", info: "INFO" } as const;

function findingLines(f: Finding, bullet: string): string[] {
  return [
    `${bullet}[${SEV_LABEL[f.severity]} · ${f.label === "DETECTED" ? "Detected" : "Not verified"}] ${f.title}`,
    `  Why: ${f.why}`,
    `  Do: ${f.action}`,
    ...f.evidence.map((e) => `  Evidence: ${e}`),
    ...(f.ref ? [`  Ref: ${f.ref}`] : []),
  ];
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n[… ${s.length - max} more characters not included — attach the full sanitized file if needed]` : s;
}

/** Share-ready text. Contains only redacted data. */
export function renderReport(rep: DebugReport, format: ReportFormat, maxArtifactChars = 12_000): string {
  const out: string[] = [];
  const redTotal = rep.redactions.reduce((a, b) => a + b.occurrences, 0);
  const redLine = redTotal
    ? `Redacted locally before sharing: ${rep.redactions.map((x) => `${x.distinct} ${x.category}`).join(", ")} (placeholders like <JWT_1>; the same placeholder always means the same value).`
    : "No secrets or personal data were detected by the redaction rules.";
  const kinds = [...new Set(rep.segments.map((s) => s.kind))].join(", ") || "nothing";

  if (format === "ai") {
    out.push("I'm debugging a problem and need help finding the root cause.");
    out.push("Context: [Describe what you were doing, what you expected, and what happened instead.]");
    out.push("");
    out.push(redLine);
    out.push("The findings below came from deterministic rules (not AI) run locally on the data; please verify them and tell me the most likely cause and the fix.");
  } else if (format === "issue") {
    out.push("## Summary");
    out.push("[Describe what you were doing, what you expected, and what happened instead.]");
    out.push("");
    out.push(`> ${redLine}`);
  } else {
    out.push("PROBLEM SUMMARY");
    out.push("[Describe what you were doing, what you expected, and what happened instead.]");
    out.push("");
    out.push(redLine);
  }
  out.push("");
  out.push(format === "issue" ? "## Findings" : "FINDINGS");
  if (rep.findings.length === 0) out.push("No rule matched. (That doesn't mean nothing is wrong — the rules cover common HTTP, CORS, auth/JWT and log patterns.)");
  for (const f of rep.findings) out.push(...findingLines(f, format === "issue" ? "- " : "• "));
  out.push("");

  if (rep.jwts.length) {
    out.push(format === "issue" ? "## Token claims (non-identifying only)" : "TOKEN CLAIMS (non-identifying only)");
    for (const j of rep.jwts) {
      out.push(`${j.placeholder}: ${JSON.stringify(j.safeClaims)}${j.withheldClaimNames.length ? ` — other claims present, values withheld: ${j.withheldClaimNames.join(", ")}` : ""}`);
    }
    out.push("");
  }

  if (rep.logs) {
    const L = rep.logs;
    out.push(format === "issue" ? "## Log summary" : "LOG SUMMARY");
    out.push(`${L.nonEmptyLines} lines → ${L.distinctTemplates} distinct messages (${L.errorLines} error, ${L.warnLines} warning lines)${L.firstTimestamp ? `, ${L.firstTimestamp} → ${L.lastTimestamp}` : ""}.`);
    for (const e of L.exceptions) out.push(`Exception: ${e}`);
    for (const t of L.templates.slice(0, 15)) out.push(`×${t.count} [${t.level}] (first at line ${t.firstLine}) ${t.template}`);
    if (L.templates.length > 15) out.push(`… ${L.templates.length - 15} more distinct messages.`);
    out.push("");
  }

  out.push(format === "issue" ? "## Sanitized input" : "SANITIZED INPUT");
  out.push(`Detected: ${kinds}; ${rep.exchanges} HTTP request(s).`);
  const fence = rep.sanitized.includes("```") ? "~~~~" : "```";
  if (format === "issue") out.push(`<details><summary>Show sanitized input</summary>\n\n${fence}`);
  else out.push(fence);
  out.push(clip(rep.sanitized, maxArtifactChars));
  out.push(fence);
  if (format === "issue") out.push("</details>");
  out.push("");
  for (const n of rep.notes) out.push(`Note: ${n}`);
  out.push("Generated locally in the browser with Dev Tools Hub (nothing was uploaded). Redaction covers known secret formats and secret-named fields — review before sharing.");
  return out.join("\n");
}
