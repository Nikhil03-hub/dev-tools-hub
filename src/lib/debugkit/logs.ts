// Log understanding: collapse thousands of lines into a few distinct
// message templates (numbers/ids/timestamps masked), count them, find the
// time range, and pull out root exceptions. Runs on ALREADY-REDACTED text,
// so nothing here can leak a secret into the summary.

import type { LogSummary, LogTemplate } from "./types";

const RE_ISO = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/;
const RE_NGINX_TIME = /\[(\d{2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4})\]/;
const RE_STACK_FRAME = /^\s+(at\s|File\s"|\.\.\.\s\d+\smore|~~~|\^+$)|^\s{4,}\S/;

export function levelOf(line: string): LogTemplate["level"] {
  if (/\b(FATAL|CRITICAL|CRIT|ERROR|ERR|SEVERE|PANIC|EMERG|ALERT)\b/i.test(line) || /\b(Exception|Traceback|panic:)/.test(line)) return "error";
  if (/\b(WARN|WARNING)\b/i.test(line)) return "warn";
  if (/\b(INFO|NOTICE)\b/i.test(line)) return "info";
  if (/\b(DEBUG|TRACE|VERBOSE)\b/i.test(line)) return "debug";
  return "unknown";
}

/** Mask the variable parts of a log line so repeats group together. */
export function toTemplate(line: string): string {
  return line
    .replace(new RegExp(RE_ISO.source, "g"), "<TS>")
    .replace(/\[\d{2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4}\]/g, "[<TS>]")
    .replace(/\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b/g, "<TIME>")
    .replace(/<([A-Z][A-Z0-9_]*?)_\d+>/g, "<$1>")
    .replace(/\b([A-Za-z_][\w.-]*=)(?!<)[^\s,;&"'()[\]{}]*\d[^\s,;&"'()[\]{}]*/g, "$1<V>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<HEX>")
    .replace(/\b[0-9a-f]{12,}\b/gi, "<HEX>")
    .replace(/(?<![\w<])\d+(?:\.\d+)*(?![\w>])/g, "<N>")
    .replace(/\s+/g, " ")
    .trim();
}

function exceptionLines(lines: string[]): string[] {
  const found: string[] = [];
  const push = (s: string) => {
    const v = s.trim();
    if (v && !found.includes(v)) found.push(v);
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // Python: last non-indented "XError: msg" line after a Traceback
    if (/^Traceback \(most recent call last\):/.test(l)) {
      let j = i + 1;
      while (j < lines.length && (/^\s/.test(lines[j]) || lines[j].trim() === "")) j++;
      if (j < lines.length) push(lines[j]);
      continue;
    }
    // Java: root cause is the LAST "Caused by:" in a chain
    if (/^Caused by: /.test(l)) {
      let j = i + 1;
      let last = l;
      while (j < lines.length && (/^\s/.test(lines[j]) || /^Caused by: /.test(lines[j]))) {
        if (/^Caused by: /.test(lines[j])) last = lines[j];
        j++;
      }
      push(last.replace(/^Caused by: /, "Root cause: "));
      i = j - 1;
      continue;
    }
    if (/^(?:Exception in thread "[^"]*" )?[A-Za-z_$][\w$]*(?:\.[\w$]+)+(?:Exception|Error)(?::.*)?$/.test(l)) push(l);
    else if (/^(?:Uncaught )?[A-Z][A-Za-z]*Error(?::.*)?$/.test(l) && i + 1 < lines.length && /^\s+at\s/.test(lines[i + 1])) push(l);
    else if (/^panic: /.test(l)) push(l);
    else if (/^(?:Unhandled exception\. )?System\.[\w.]+Exception:/.test(l)) push(l);
  }
  return found.slice(0, 8);
}

/** Summarise redacted log text. */
export function summarizeLogs(redactedText: string): LogSummary {
  const lines = redactedText.split(/\r?\n/);
  const map = new Map<string, LogTemplate>();
  let nonEmpty = 0;
  let errorLines = 0;
  let warnLines = 0;
  let firstTs: string | undefined;
  let lastTs: string | undefined;

  lines.forEach((line, idx) => {
    if (line.trim() === "") return;
    nonEmpty++;
    const ts = RE_ISO.exec(line)?.[0] ?? RE_NGINX_TIME.exec(line)?.[1];
    if (ts) {
      if (!firstTs) firstTs = ts;
      lastTs = ts;
    }
    if (RE_STACK_FRAME.test(line)) return; // stack frames don't become templates
    const level = levelOf(line);
    if (level === "error") errorLines++;
    if (level === "warn") warnLines++;
    const tpl = toTemplate(line);
    const cur = map.get(tpl);
    if (cur) {
      cur.count++;
      cur.lastLine = idx + 1;
    } else {
      map.set(tpl, { template: tpl.length > 300 ? `${tpl.slice(0, 300)}…` : tpl, count: 1, firstLine: idx + 1, lastLine: idx + 1, level });
    }
  });

  const rank = { error: 0, warn: 1, unknown: 2, info: 3, debug: 4 } as const;
  const templates = [...map.values()].sort((a, b) => rank[a.level] - rank[b.level] || b.count - a.count || a.firstLine - b.firstLine);

  return {
    totalLines: lines.length,
    nonEmptyLines: nonEmpty,
    distinctTemplates: templates.length,
    templates,
    exceptions: exceptionLines(lines),
    firstTimestamp: firstTs,
    lastTimestamp: lastTs,
    errorLines,
    warnLines,
  };
}
