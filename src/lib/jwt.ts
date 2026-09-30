// JWT decoding — structurally identical in spirit to lib/jsonParse.ts's
// diagnostic philosophy: never throw, always say specifically which of the
// three segments failed and why. This module only ever reads a token; it
// never contacts a server and never attempts to verify a signature. The
// signature segment is treated as opaque data to display, never as
// something this tool can confirm is authentic.

export interface JwtClaimInfo {
  key: "iat" | "nbf" | "exp";
  value: number;
  iso: string;
  note: string;
  tone: "ok" | "warn" | "err" | "neutral";
}

export interface DecodedJwt {
  header: unknown;
  payload: unknown;
  headerJson: string;
  payloadJson: string;
  headerRaw: string;
  payloadRaw: string;
  signature: string;
  alg: string | null;
  claims: JwtClaimInfo[];
}

export type JwtResult = { ok: true; data: DecodedJwt } | { ok: false; error: string };

function base64UrlToBase64(segment: string): string {
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padNeeded = (4 - (b64.length % 4)) % 4;
  return b64 + "=".repeat(padNeeded);
}

function base64UrlDecodeToString(segment: string): string {
  if (segment === "") throw new Error("empty segment");
  let binary: string;
  try {
    binary = atob(base64UrlToBase64(segment));
  } catch {
    throw new Error("invalid base64url");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function base64UrlEncodeString(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function claimInfo(key: JwtClaimInfo["key"], value: number): JwtClaimInfo {
  const date = new Date(value * 1000);
  const iso = date.toISOString();
  const now = Date.now();
  if (key === "exp") {
    const expired = date.getTime() < now;
    return { key, value, iso, note: expired ? "expired" : "expires in the future", tone: expired ? "err" : "ok" };
  }
  if (key === "nbf") {
    const notYet = date.getTime() > now;
    return { key, value, iso, note: notYet ? "not valid yet" : "already valid", tone: notYet ? "warn" : "ok" };
  }
  return { key, value, iso, note: "issued at this time", tone: "neutral" };
}

export function decodeJwt(input: string): JwtResult {
  const trimmed = input.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      error: `Not a valid JWT — expected 3 dot-separated segments (header.payload.signature), found ${parts.length}.`,
    };
  }
  const [rawHeader, rawPayload, rawSignature] = parts;

  let headerStr: string;
  try {
    headerStr = base64UrlDecodeToString(rawHeader);
  } catch {
    return { ok: false, error: "The header segment isn't valid base64url — it contains characters that can't be decoded." };
  }
  let header: unknown;
  try {
    header = JSON.parse(headerStr);
  } catch {
    return { ok: false, error: "The header segment decoded, but its content isn't valid JSON." };
  }

  let payloadStr: string;
  try {
    payloadStr = base64UrlDecodeToString(rawPayload);
  } catch {
    return { ok: false, error: "The payload segment isn't valid base64url — it contains characters that can't be decoded." };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return { ok: false, error: "The payload segment decoded, but its content isn't valid JSON." };
  }

  const claims: JwtClaimInfo[] = [];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    (["iat", "nbf", "exp"] as const).forEach((key) => {
      const value = obj[key];
      if (typeof value === "number" && Number.isFinite(value)) claims.push(claimInfo(key, value));
    });
  }

  const alg =
    header && typeof header === "object" && typeof (header as Record<string, unknown>).alg === "string"
      ? ((header as Record<string, unknown>).alg as string)
      : null;

  return {
    ok: true,
    data: {
      header,
      payload,
      headerJson: JSON.stringify(header, null, 2),
      payloadJson: JSON.stringify(payload, null, 2),
      headerRaw: rawHeader,
      payloadRaw: rawPayload,
      signature: rawSignature,
      alg,
      claims,
    },
  };
}

// A realistic-shaped demo token for the "Load sample" button. There is no
// secret key anywhere in this tool — the third segment is a fixed
// placeholder string, not a real HMAC — and the UI always labels the
// signature "shown as-is, not verified" regardless of where a token came
// from, so this can't be mistaken for a working signed token.
export function buildSampleJwt(): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "user_8f21c",
    name: "Asha Verma",
    role: "admin",
    iat: now - 60,
    exp: now + 3600,
  };
  const encodedHeader = base64UrlEncodeString(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const placeholderSignature = "ZmFrZS1zaWduYXR1cmUtZm9yLWRlbW8tcHVycG9zZXMtb25seQ";
  return `${encodedHeader}.${encodedPayload}.${placeholderSignature}`;
}
