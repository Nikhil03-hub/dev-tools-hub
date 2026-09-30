// Shared types for the Debug Report engine (src/lib/debugkit/*).
//
// Design rules (from the Dev Tools Hub doctrine):
//  - Pure logic: no React, no DOM, no network. Everything here must also
//    run under Node (scripts/verify_debugkit.ts) so a future CLI can reuse
//    it unchanged.
//  - Never throw on user input. Parsers return partial results + notes.
//  - Every finding carries a trust label. This engine only ever produces
//    DETECTED (a deterministic rule matched) or NOT_VERIFIED (something we
//    can show but cannot confirm, e.g. a JWT signature). It never claims
//    VERIFIED or EXECUTED.

export type Severity = "high" | "medium" | "low" | "info";

export type TrustLabel = "DETECTED" | "NOT_VERIFIED";

export type SegmentKind = "har" | "json" | "curl" | "http-request" | "http-response" | "jwt" | "env" | "log";

export interface Segment {
  kind: SegmentKind;
  /** Original text of this segment (NOT redacted). Never render this directly in a share output. */
  text: string;
  /** 1-based line number where the segment starts in the original input. */
  startLine: number;
}

export interface HeaderPair {
  name: string;
  value: string;
}

/** One HTTP request/response pair, normalised from HAR, cURL or raw HTTP text. */
export interface Exchange {
  source: "har" | "curl" | "http";
  method: string;
  url: string;
  requestHeaders: HeaderPair[];
  requestBody?: string;
  /** undefined when we only have the request side (e.g. a bare cURL command). */
  status?: number;
  statusText?: string;
  responseHeaders: HeaderPair[];
  responseBody?: string;
  /** ISO time the request started (HAR startedDateTime), if known. */
  startedAt?: string;
  /** Total time in ms (HAR time), if known. */
  timeMs?: number;
  /** HAR entry index or segment index, for evidence text. */
  index: number;
}

export interface Finding {
  id: string;
  severity: Severity;
  label: TrustLabel;
  /** One line, plain language. */
  title: string;
  /** WHY it matters / what the rule means. */
  why: string;
  /** WHAT TO DO. */
  action: string;
  /** Evidence lines. MUST already be redacted (never contain raw secrets). */
  evidence: string[];
  /** Optional reference URL (MDN / RFC). */
  ref?: string;
}

export type RedactionCategory =
  | "PRIVATE_KEY"
  | "JWT"
  | "AWS_ACCESS_KEY_ID"
  | "AWS_SECRET_KEY"
  | "GITHUB_TOKEN"
  | "GITLAB_TOKEN"
  | "SLACK_TOKEN"
  | "SLACK_WEBHOOK"
  | "STRIPE_KEY"
  | "GOOGLE_API_KEY"
  | "ANTHROPIC_KEY"
  | "OPENAI_KEY"
  | "NPM_TOKEN"
  | "SENDGRID_KEY"
  | "AUTH_TOKEN"
  | "BASIC_AUTH"
  | "COOKIE"
  | "SECRET"
  | "PASSWORD"
  | "EMAIL"
  | "CARD"
  | "IP";

export interface RedactionSummaryRow {
  category: RedactionCategory;
  /** Number of distinct values replaced in this category. */
  distinct: number;
  /** Total number of replacements (same value can appear many times). */
  occurrences: number;
}

export interface RedactOptions {
  /** Replace e-mail addresses. Default true. */
  emails: boolean;
  /** Replace IPv4 addresses (loopback/unspecified are always kept). Default true. */
  ips: boolean;
}

export interface JwtSummary {
  placeholder: string;
  alg: string | null;
  /** Only non-identifying, debugging-relevant claims (allow-listed). */
  safeClaims: Record<string, unknown>;
  /** Names of every other claim (values withheld). */
  withheldClaimNames: string[];
}

export interface LogTemplate {
  template: string;
  count: number;
  firstLine: number;
  lastLine: number;
  level: "error" | "warn" | "info" | "debug" | "unknown";
}

export interface LogSummary {
  totalLines: number;
  nonEmptyLines: number;
  distinctTemplates: number;
  templates: LogTemplate[];
  /** Root exception / panic line(s), redacted. */
  exceptions: string[];
  firstTimestamp?: string;
  lastTimestamp?: string;
  errorLines: number;
  warnLines: number;
}

export interface DebugReport {
  segments: { kind: SegmentKind; startLine: number; lines: number }[];
  exchanges: number;
  findings: Finding[];
  jwts: JwtSummary[];
  logs?: LogSummary;
  redactions: RedactionSummaryRow[];
  /** The full input with secrets replaced by placeholders. */
  sanitized: string;
  /** Notes about parsing limits (truncation, unparsed parts). */
  notes: string[];
  /** Reference time used for time-based checks, ISO. */
  referenceTime: string;
  referenceTimeSource: string;
}
