// Pure timestamp/date-conversion logic — no UI, no DOM beyond the Intl/Date
// globals every JS runtime provides. Mirrors lib/jwt.ts and lib/regex.ts:
// every operation that can fail returns an explicit {ok:true,data}|{ok:false,error}
// result instead of throwing, nothing here ever touches the network, and —
// same as the other two — there is no date library in this project's
// dependencies and none is added for this tool. Everything is built on
// three native Intl APIs that have been safely evergreen for years:
// Intl.DateTimeFormat's "longOffset" timeZoneName (reading a zone's UTC
// offset at a given instant), Intl.supportedValuesOf("timeZone") (the full
// IANA zone list, for the picker), and Intl.RelativeTimeFormat ("3 hours
// ago"). No new dependency was needed for any of it.

export interface CanonicalInstant {
  /** Milliseconds since the Unix epoch — the one representation everything
   *  else in this module is derived from or converts into. An instant is
   *  timezone-less by definition; "which timezone" only ever matters when
   *  parsing a human-entered wall-clock time INTO one of these, or when
   *  formatting one back OUT for display. */
  ms: number;
}

export type EpochUnit = "seconds" | "milliseconds";
export type EpochUnitMode = "auto" | EpochUnit;

export interface TimezoneRow {
  zone: string;
  label: string;
  dateTime: string;
  utcOffset: string;
  relative: string;
}

export interface EpochParseSuccess {
  instant: CanonicalInstant;
  detectedUnit: EpochUnit;
}
export type EpochParseResult = { ok: true; data: EpochParseSuccess } | { ok: false; error: string };

export interface HumanParseSuccess {
  instant: CanonicalInstant;
}
export type HumanParseResult = { ok: true; data: HumanParseSuccess } | { ok: false; error: string };

export interface EpochOutput {
  seconds: number;
  milliseconds: number;
  iso: string;
}

export interface Preset {
  id: string;
  label: string;
  getInstant: () => CanonicalInstant;
}

// The ECMAScript spec's own Date range limit: ±100,000,000 days from the
// epoch, in milliseconds. This is the one authoritative bound to check
// against — it's smaller than Number.MAX_SAFE_INTEGER, so anything inside
// it is automatically a safe integer too.
const DATE_MS_LIMIT = 8_640_000_000_000_000;

// Epoch seconds for "now" in the mid-2020s is ~1.7e9 (10 digits); epoch
// milliseconds for "now" is ~1.7e12 (13 digits). Any plausible seconds
// value within a thousand years of 1970 stays under 1e11, and any
// plausible milliseconds value for the same range is well above it, so a
// threshold at 1e11 cleanly separates the two without misreading either.
const MS_UNIT_THRESHOLD = 1e11;

export function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

// A small, real fallback list for the rare runtime without
// Intl.supportedValuesOf (older browsers) — never leaves the picker
// completely empty.
const FALLBACK_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

// "UTC" is confirmed (tested directly, not assumed) to be missing from
// Intl.supportedValuesOf("timeZone")'s own output on at least one shipping
// Chromium/ICU build, even though "UTC" is always a valid `timeZone` value
// to every Intl.DateTimeFormat call — supportedValuesOf's canonical-name
// list and "what's a legal timeZone option" are just two different things.
// Since it's the single most expected entry in this list (it's pinned by
// default for every user), it's added back explicitly rather than trusting
// the platform to include it.
export function listTimeZones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      const zones = Intl.supportedValuesOf("timeZone");
      if (zones.length > 0) return zones.includes("UTC") ? zones : ["UTC", ...zones];
    }
  } catch {
    // fall through to the fallback list below
  }
  return FALLBACK_ZONES;
}

export function detectEpochUnit(n: number): EpochUnit {
  return Math.abs(n) >= MS_UNIT_THRESHOLD ? "milliseconds" : "seconds";
}

export function parseEpoch(raw: string, unitMode: EpochUnitMode): EpochParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Enter an epoch value." };
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, error: "Epoch must be a whole number of seconds or milliseconds, e.g. 1735689600." };
  }
  const n = Number(trimmed);
  const detectedUnit = unitMode === "auto" ? detectEpochUnit(n) : unitMode;
  const ms = detectedUnit === "seconds" ? n * 1000 : n;
  if (!Number.isFinite(ms) || Math.abs(ms) > DATE_MS_LIMIT) {
    return { ok: false, error: "That value is outside the range JavaScript's Date can represent." };
  }
  return { ok: true, data: { instant: { ms }, detectedUnit } };
}

interface DateTimeComponents {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// Parses the value a native <input type="datetime-local"> produces, e.g.
// "2026-09-29T14:30" or "2026-09-29T14:30:00" with the optional seconds
// the "step" attribute enables.
function parseDateTimeLocalValue(value: string): DateTimeComponents | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] ? Number(m[6]) : 0,
  };
}

// The UTC offset (in minutes) `zone` observes at the instant `atMs`, e.g.
// +330 for Asia/Kolkata, -240 for America/New_York while DST is in effect.
// Built on Intl.DateTimeFormat's "longOffset" timeZoneName part (a stable
// "GMT+05:30"-shaped string), which every evergreen browser has supported
// for years — no date library needed for this.
function offsetMinutesAt(atMs: number, zone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset", hour: "2-digit" });
  const part = dtf.formatToParts(new Date(atMs)).find((p) => p.type === "timeZoneName");
  const raw = part?.value ?? "GMT";
  if (raw === "GMT" || raw === "UTC") return 0;
  const m = raw.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

// Converts wall-clock components meant to be read IN `zone` into the
// absolute UTC instant they represent — the "interpret a human-entered
// date/time" half of this module, distinct from the "display an instant"
// half below. There is no native constructor for this (the Date
// constructor only ever parses a plain string as local-machine time or, in
// UTC, with a trailing "Z") so this uses the standard offset-guess-then-
// correct technique: guess the instant by treating the components as UTC,
// read the offset `zone` actually observes near that guess, correct by it,
// then repeat once more so the correction is also right near a DST
// transition. A doubled or skipped local time exactly at a DST boundary
// (an inherently ambiguous/nonexistent wall-clock moment) is the one edge
// case this can't perfectly resolve — flagged as a known limitation rather
// than silently glossed over, same as this project's other tools.
function zonedComponentsToUtcMs(c: DateTimeComponents, zone: string): number {
  const guessMs = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  const offset1 = offsetMinutesAt(guessMs, zone);
  const candidateMs = guessMs - offset1 * 60_000;
  const offset2 = offsetMinutesAt(candidateMs, zone);
  return guessMs - offset2 * 60_000;
}

export function parseHumanDateTime(dateTimeLocalValue: string, zone: string): HumanParseResult {
  if (dateTimeLocalValue.trim() === "") return { ok: false, error: "Pick a date and time." };
  const components = parseDateTimeLocalValue(dateTimeLocalValue.trim());
  if (!components) return { ok: false, error: "That date/time couldn't be read." };
  if (components.month < 1 || components.month > 12 || components.day < 1 || components.day > 31) {
    return { ok: false, error: "That date is out of range." };
  }
  const ms = zonedComponentsToUtcMs(components, zone);
  if (!Number.isFinite(ms) || Math.abs(ms) > DATE_MS_LIMIT) {
    return { ok: false, error: "That date is outside the range JavaScript's Date can represent." };
  }
  return { ok: true, data: { instant: { ms } } };
}

export function toEpochOutput(instant: CanonicalInstant): EpochOutput {
  return {
    seconds: Math.floor(instant.ms / 1000),
    milliseconds: instant.ms,
    iso: new Date(instant.ms).toISOString(),
  };
}

function formatOffsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${h}:${m}`;
}

// Unit selection widens step by step until the magnitude is at least 1, the
// same approach most relative-time implementations use. Months/years use a
// calendar-average day count (30.44 / 365.25) rather than exact calendar
// math — a documented simplification, not a precision claim; it's the
// phrasing ("about 2 months ago") that matters here, not exactness to the
// day at that range.
function formatRelative(instant: CanonicalInstant, nowMs: number): string {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diffSec = (instant.ms - nowMs) / 1000;
  if (Math.abs(diffSec) < 60) return rtf.format(Math.round(diffSec), "second");
  const diffMin = diffSec / 60;
  if (Math.abs(diffMin) < 60) return rtf.format(Math.round(diffMin), "minute");
  const diffHour = diffMin / 60;
  if (Math.abs(diffHour) < 24) return rtf.format(Math.round(diffHour), "hour");
  const diffDay = diffHour / 24;
  if (Math.abs(diffDay) < 30) return rtf.format(Math.round(diffDay), "day");
  const diffMonth = diffDay / 30.44;
  if (Math.abs(diffMonth) < 12) return rtf.format(Math.round(diffMonth), "month");
  const diffYear = diffDay / 365.25;
  return rtf.format(Math.round(diffYear), "year");
}

export function buildTimezoneRow(instant: CanonicalInstant, zone: string, localZone: string, nowMs: number): TimezoneRow {
  const offsetMin = offsetMinutesAt(instant.ms, zone);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const label = zone === "UTC" ? "UTC" : zone === localZone ? `Local (${zone})` : zone;
  return {
    zone,
    label,
    dateTime: dtf.format(new Date(instant.ms)),
    utcOffset: formatOffsetLabel(offsetMin),
    relative: formatRelative(instant, nowMs),
  };
}

export function buildTimezoneRows(instant: CanonicalInstant, zones: string[]): TimezoneRow[] {
  const localZone = getLocalTimeZone();
  const nowMs = Date.now();
  return zones.map((z) => buildTimezoneRow(instant, z, localZone, nowMs));
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

// Presets are deliberately local-time concepts ("start of today" means
// today where the user is, not in UTC) — the same assumption every
// calendar app makes. They read the live clock (Date.now()) rather than
// taking "now" as a parameter, exactly so a frozen/mocked clock in tests
// controls them the same way it controls formatRelative, with no separate
// test-only code path in the app itself.
export function buildPresets(): Preset[] {
  return [
    { id: "now", label: "Now", getInstant: () => ({ ms: Date.now() }) },
    { id: "start-of-day", label: "Start of today", getInstant: () => ({ ms: startOfLocalDay(new Date()).getTime() }) },
    {
      id: "start-of-week",
      label: "Start of this week",
      getInstant: () => {
        const start = startOfLocalDay(new Date());
        const isoDay = (start.getDay() + 6) % 7; // 0 = Monday
        start.setDate(start.getDate() - isoDay);
        return { ms: start.getTime() };
      },
    },
    {
      id: "start-of-month",
      label: "Start of this month",
      getInstant: () => {
        const now = new Date();
        return { ms: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime() };
      },
    },
    {
      id: "start-of-year",
      label: "Start of this year",
      getInstant: () => {
        const now = new Date();
        return { ms: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime() };
      },
    },
    { id: "epoch-zero", label: "Unix epoch (0)", getInstant: () => ({ ms: 0 }) },
  ];
}
