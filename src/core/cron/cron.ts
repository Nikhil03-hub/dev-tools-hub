// T-205: explain a cron expression and list its next runs in a chosen zone.
//
// Two libraries, both doing one job each: cronstrue turns the expression into
// English and is the validator, croner calculates real future times. This module
// only arranges them and formats the result — nothing is scheduled, executed or
// sent anywhere. See docs/v3/tasks/P2_tools.md.
import { Cron } from "croner";
import cronstrue from "cronstrue";
import type { Result } from "../result";
import { err, ok } from "../result";

export interface CronField {
  name: string;
  value: string;
}

export interface CronExplanation {
  description: string;
  /** ISO 8601 with the zone's own offset, e.g. 2026-10-22T17:45:00+05:30 */
  nextRuns: string[];
  fields: CronField[];
  withSeconds: boolean;
}

export interface CronOptions {
  timeZone: string;
  from: Date;
  count?: number;
}

const FIELD_NAMES = ["minute", "hour", "day of month", "month", "day of week"];
const FIELD_NAMES_SECONDS = ["second", ...FIELD_NAMES];

/** Quartz and friends write 7 fields; the extra ones are silently ignored. */
const MAX_LENGTH = 500;
const MAX_RUNS = 20;

// cronstrue accepts these; croner accepts the same set. They are here so the
// field table can show what each one really pins down instead of putting
// "@daily" in all five rows.
const MACROS: Record<string, string[]> = {
  "@yearly": ["0", "0", "1", "1", "*"],
  "@annually": ["0", "0", "1", "1", "*"],
  "@monthly": ["0", "0", "1", "*", "*"],
  "@weekly": ["0", "0", "*", "*", "0"],
  "@daily": ["0", "0", "*", "*", "*"],
  "@midnight": ["0", "0", "*", "*", "*"],
  "@hourly": ["0", "*", "*", "*", "*"],
};

/** cronstrue rejects by throwing a bare string, not an Error. */
function messageOf(thrown: unknown): string {
  const raw = Array.isArray(thrown)
    ? thrown.join(" ")
    : typeof thrown === "string"
      ? thrown
      : thrown instanceof Error
        ? thrown.message
        : String(thrown);
  return raw.replace(/^Error:\s*/, "").split("\n")[0].trim();
}

/**
 * Whether `tz` is a zone this engine can actually format with.
 *
 * Not `Intl.supportedValuesOf("timeZone").includes(tz)`: measured on Node 22,
 * that list omits names the formatter accepts — "Asia/Kolkata" is a valid zone
 * here and was reported as unknown. Constructing the formatter is the test that
 * agrees with what `formatInTimeZone` will go on to do, so the two cannot
 * disagree. The UI's dropdown is still populated from `supportedValuesOf`.
 */
function isTimeZoneName(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The wall-clock reading of `date` in `timeZone`, plus the offset that zone has
 * *at that instant* — not the one the machine has now. Built from
 * Intl.DateTimeFormat parts because a UTC-offset ISO string is what a reader of
 * a cron schedule actually wants, and `toISOString()` would erase the zone.
 */
export function formatInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // Without h23, some engines render midnight as hour "24".
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const offset = normalizeOffset(get("timeZoneName"));
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}`;
}

/** "GMT+05:30" → "+05:30"; "GMT" → "+00:00"; "GMT-04" → "-04:00". */
export function normalizeOffset(timeZoneName: string): string {
  const m = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(timeZoneName.trim());
  if (!m) return "+00:00";
  const minutes = m[3] ?? "00";
  return `${m[1]}${m[2].padStart(2, "0")}:${minutes}`;
}

export function explainCron(expr: string, opts: CronOptions): Result<CronExplanation> {
  const trimmed = (expr ?? "").trim();
  if (trimmed === "") return err("Type or paste a cron expression.");
  if (trimmed.length > MAX_LENGTH) return err(`That expression is longer than ${MAX_LENGTH} characters, which is not a cron schedule.`);

  const macro = MACROS[trimmed.split(/\s+/)[0]?.toLowerCase()];
  if (trimmed.startsWith("@") && !macro) return err("Unknown @-shortcut. Supported: @yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly.");

  const rawParts = macro ?? trimmed.split(/\s+/);
  // A macro is handed to both libraries in its expanded form. cronstrue reads
  // "@daily" but rejects "@DAILY", and croner has its own view again; one
  // canonical spelling removes the question, and the description then matches
  // the field table below.
  const canonical = macro ? macro.join(" ") : trimmed;
  if (!macro) {
    if (rawParts.length === 7) {
      return err("This has 7 fields, which is the Quartz form. This tool reads the standard 5-field cron and the 6-field form whose first value is seconds.");
    }
    if (rawParts.length < 5) return err(`This expression has ${rawParts.length} fields; a cron schedule needs 5 (or 6 with seconds).`);
    if (rawParts.length > 6) return err(`This expression has ${rawParts.length} fields; a cron schedule needs 5 (or 6 with seconds).`);
  }

  const withSeconds = !macro && rawParts.length === 6;

  // Validate first, so a rejected expression never reaches the run calculator.
  let description: string;
  try {
    description = cronstrue.toString(canonical, { use24HourTimeFormat: true });
  } catch (thrown) {
    return err(messageOf(thrown));
  }

  const names = withSeconds ? FIELD_NAMES_SECONDS : FIELD_NAMES;
  const fields: CronField[] = names.map((name, i) => ({ name, value: rawParts[i] ?? "*" }));

  if (!isTimeZoneName(opts.timeZone)) {
    return err(`Unknown time zone '${opts.timeZone}'. Pick one from the list, or use UTC.`);
  }

  const count = Math.min(Math.max(Math.trunc(opts.count ?? 5) || 1, 1), MAX_RUNS);
  let job: InstanceType<typeof Cron>;
  try {
    job = new Cron(canonical, { timezone: opts.timeZone, paused: true });
  } catch (thrown) {
    return err(messageOf(thrown));
  }

  let runs: Date[];
  try {
    runs = job.nextRuns(count, opts.from);
  } catch (thrown) {
    return err(messageOf(thrown));
  }

  return ok({ description, nextRuns: runs.map((d) => formatInTimeZone(d, opts.timeZone)), fields, withSeconds });
}

/** The presets the spec's UI calls for, in the order it lists them. */
export const CRON_PRESETS: { label: string; expr: string }[] = [
  { label: "Every minute", expr: "* * * * *" },
  { label: "Every 15 min", expr: "*/15 * * * *" },
  { label: "Hourly", expr: "0 * * * *" },
  { label: "Daily 00:00", expr: "0 0 * * *" },
  { label: "Weekdays 09:00", expr: "0 9 * * 1-5" },
  { label: "First of month", expr: "0 0 1 * *" },
];
