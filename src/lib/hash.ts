// Hash generation — pure logic, no UI. SHA-1/256/384/512 come from the
// native Web Crypto API (`crypto.subtle.digest`), which is async and
// requires a secure context — true on Netlify's HTTPS and on localhost,
// which is all this hub ever runs on.
//
// MD5 is NOT in Web Crypto at all — it's deliberately excluded from that
// spec as broken — but it's still what a lot of people reach for a "hash
// generator" to produce (checksums, cache keys, de-duplication; not
// security). So it's implemented here from scratch, from the RFC 1321
// specification, and verified against that RFC's own published test
// vectors in test/e2e.cjs — not against this function's own output.
//
// Every algorithm here is labeled for what it's actually safe for. None of
// them — including SHA-256/384/512 — are appropriate for hashing
// passwords or anything else security-sensitive on their own; that needs a
// dedicated, deliberately-slow algorithm (bcrypt, scrypt, Argon2), which is
// out of scope for a client-side dev tool. MD5 and SHA-1 are additionally
// broken even for plain integrity/signature use (both have practical
// collision attacks), so they're labeled "legacy" / "not for security use"
// rather than presented as equivalent alternatives to SHA-256+.

export type ShaAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";
export type HashAlgorithm = "MD5" | ShaAlgorithm;

export type HashResult = { ok: true; data: string } | { ok: false; error: string };

export interface HashAlgorithmInfo {
  id: HashAlgorithm;
  label: string;
  caution?: string;
}

export const HASH_ALGORITHMS: HashAlgorithmInfo[] = [
  { id: "MD5", label: "MD5", caution: "legacy / non-cryptographic" },
  { id: "SHA-1", label: "SHA-1", caution: "broken — not for security use" },
  { id: "SHA-256", label: "SHA-256" },
  { id: "SHA-384", label: "SHA-384" },
  { id: "SHA-512", label: "SHA-512" },
];

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---- MD5 (RFC 1321), implemented from the specification ----

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

function md5RotateLeft(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) >>> 0;
}

function md5(messageBytes: Uint8Array): string {
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  }

  const bitLenLow = (messageBytes.length * 8) >>> 0;
  const bitLenHigh = Math.floor((messageBytes.length * 8) / 0x100000000) >>> 0;

  let paddedLen = messageBytes.length + 1;
  while (paddedLen % 64 !== 56) paddedLen++;
  paddedLen += 8;

  const padded = new Uint8Array(paddedLen);
  padded.set(messageBytes);
  padded[messageBytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenLow, true);
  view.setUint32(paddedLen - 4, bitLenHigh, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const M = new Uint32Array(16);
  for (let chunkStart = 0; chunkStart < padded.length; chunkStart += 64) {
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(chunkStart + j * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + md5RotateLeft(F, MD5_SHIFTS[i])) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  function toLeHex(n: number): string {
    const bytes = [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  return toLeHex(a0) + toLeHex(b0) + toLeHex(c0) + toLeHex(d0);
}

export async function computeHash(text: string, algorithm: HashAlgorithm): Promise<HashResult> {
  try {
    const bytes = new TextEncoder().encode(text);
    if (algorithm === "MD5") {
      return { ok: true, data: md5(bytes) };
    }
    if (typeof crypto === "undefined" || !crypto.subtle) {
      return {
        ok: false,
        error: "The Web Crypto API isn't available in this context (crypto.subtle) — SHA hashing needs a secure context (HTTPS or localhost).",
      };
    }
    const digestBuffer = await crypto.subtle.digest(algorithm, bytes);
    return { ok: true, data: bufferToHex(digestBuffer) };
  } catch (err) {
    return { ok: false, error: `Hashing failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function buildHashSample(): string {
  return "The quick brown fox jumps over the lazy dog";
}
