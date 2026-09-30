// Standalone verification for the Phase 5 lib modules (Base64, URL
// encode/decode, hashing, UUID), run via `npx tsx scripts/verify_lib.ts`.
// Not part of the shipped app — nothing under src/ imports this folder —
// but kept in the repo rather than thrown away: it's the thing that
// actually proves MD5 and the SHA family are correct (RFC 1321's and
// NIST's own published test vectors, plus a cross-check against Node's
// independent native crypto implementation at every block-boundary
// length), which the browser-based Playwright suite in test/e2e.cjs isn't
// well-suited to do on its own. Re-run this after touching lib/hash.ts,
// lib/base64.ts, or lib/urlEncode.ts.
import { createHash } from "node:crypto";
import { encodeBase64, decodeBase64 } from "../src/lib/base64";
import { encodeUrl, decodeUrl } from "../src/lib/urlEncode";
import { computeHash } from "../src/lib/hash";
import { generateUuidBatch, formatUuid } from "../src/lib/uuid";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}  ${detail}`);
  }
}

function nodeMd5(text: string): string {
  return createHash("md5").update(Buffer.from(text, "utf-8")).digest("hex");
}

async function main() {
  // ---- MD5 against RFC 1321's own published test vectors (spec ground
  // truth, independent of any implementation) ----
  check("md5_empty", (await computeHash("", "MD5")).ok);
  const md5Empty = await computeHash("", "MD5");
  check("md5_empty_value", md5Empty.ok && md5Empty.data === "d41d8cd98f00b204e9800998ecf8427e", JSON.stringify(md5Empty));
  const md5Abc = await computeHash("abc", "MD5");
  check("md5_abc", md5Abc.ok && md5Abc.data === "900150983cd24fb0d6963f7d28e17f72", JSON.stringify(md5Abc));
  const md5Fox = await computeHash("The quick brown fox jumps over the lazy dog", "MD5");
  check("md5_fox", md5Fox.ok && md5Fox.data === "9e107d9d372bb6826bd81d3542a419d6", JSON.stringify(md5Fox));
  const md5FoxDot = await computeHash("The quick brown fox jumps over the lazy dog.", "MD5");
  check("md5_fox_dot", md5FoxDot.ok && md5FoxDot.data === "e4d909c290d0fb1ca068ffaddf22cbd0", JSON.stringify(md5FoxDot));

  // ---- MD5 cross-checked against Node's own native MD5 implementation
  // (a completely independent implementation) across every byte-length
  // that matters for the padding/chunking logic: right at, just below, and
  // just above the 56-mod-64 boundary, exactly one block, exactly two
  // blocks, and a length that needs the high 32 bits of the bit-count
  // field to matter least (still exercised even though it'll be 0). ----
  const lengthsToProbe = [0, 1, 2, 55, 56, 57, 63, 64, 65, 100, 127, 128, 129, 1000, 4096];
  for (const len of lengthsToProbe) {
    const input = "The quick brown fox. ".repeat(50).slice(0, len);
    const got = await computeHash(input, "MD5");
    const want = nodeMd5(input);
    check(`md5_cross_check_len_${len}`, got.ok && got.data === want, `got=${got.ok ? got.data : got.error} want=${want}`);
  }
  // Also with non-ASCII content, to confirm UTF-8 byte encoding (not UTF-16
  // code units) feeds the digest.
  const unicodeProbe = "café 日本語 🎉".repeat(10);
  const gotUnicode = await computeHash(unicodeProbe, "MD5");
  const wantUnicode = nodeMd5(unicodeProbe);
  check("md5_cross_check_unicode", gotUnicode.ok && gotUnicode.data === wantUnicode, `got=${gotUnicode.ok ? gotUnicode.data : gotUnicode.error} want=${wantUnicode}`);

  // ---- SHA-1/256/384/512 — NIST/RFC published test vectors ----
  const sha1Empty = await computeHash("", "SHA-1");
  check("sha1_empty", sha1Empty.ok && sha1Empty.data === "da39a3ee5e6b4b0d3255bfef95601890afd80709", JSON.stringify(sha1Empty));
  const sha1Abc = await computeHash("abc", "SHA-1");
  check("sha1_abc", sha1Abc.ok && sha1Abc.data === "a9993e364706816aba3e25717850c26c9cd0d89d", JSON.stringify(sha1Abc));

  const sha256Empty = await computeHash("", "SHA-256");
  check("sha256_empty", sha256Empty.ok && sha256Empty.data === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", JSON.stringify(sha256Empty));
  const sha256Abc = await computeHash("abc", "SHA-256");
  check("sha256_abc", sha256Abc.ok && sha256Abc.data === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", JSON.stringify(sha256Abc));

  const sha384Empty = await computeHash("", "SHA-384");
  check(
    "sha384_empty",
    sha384Empty.ok && sha384Empty.data === "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b",
    JSON.stringify(sha384Empty)
  );

  const sha512Empty = await computeHash("", "SHA-512");
  check(
    "sha512_empty",
    sha512Empty.ok &&
      sha512Empty.data ===
        "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
    JSON.stringify(sha512Empty)
  );
  const sha512Abc = await computeHash("abc", "SHA-512");
  check(
    "sha512_abc",
    sha512Abc.ok &&
      sha512Abc.data ===
        "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    JSON.stringify(sha512Abc)
  );

  // ---- Cross-check every SHA algorithm against Node's own independent
  // native implementation, across several input lengths (not just the two
  // hand-typed short vectors above) ----
  for (const algo of ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const) {
    const nodeAlgoName = algo.toLowerCase().replace("-", "");
    for (const len of [0, 1, 63, 64, 65, 1000]) {
      const input = "The quick brown fox. ".repeat(50).slice(0, len);
      const got = await computeHash(input, algo);
      const want = createHash(nodeAlgoName).update(Buffer.from(input, "utf-8")).digest("hex");
      check(`${algo}_cross_check_len_${len}`, got.ok && got.data === want, `got=${got.ok ? got.data : got.error} want=${want}`);
    }
  }

  // ---- Base64 ----
  check("base64_encode_hello", encodeBase64("hello", false) === "aGVsbG8=", encodeBase64("hello", false));
  check("base64_encode_hello_urlsafe_no_padding", encodeBase64("hello", true) === "aGVsbG8", encodeBase64("hello", true));
  const decHello = decodeBase64("aGVsbG8=");
  check("base64_decode_hello", decHello.ok && decHello.data === "hello", JSON.stringify(decHello));
  const decHelloNoPad = decodeBase64("aGVsbG8");
  check("base64_decode_no_padding", decHelloNoPad.ok && decHelloNoPad.data === "hello", JSON.stringify(decHelloNoPad));

  const unicodeText = "héllo 🎉 日本語";
  const encUnicodeStd = encodeBase64(unicodeText, false);
  const decUnicodeStd = decodeBase64(encUnicodeStd);
  check("base64_unicode_roundtrip_standard", decUnicodeStd.ok && decUnicodeStd.data === unicodeText, JSON.stringify(decUnicodeStd));
  const encUnicodeUrlSafe = encodeBase64(unicodeText, true);
  check("base64_urlsafe_output_has_no_reserved_chars", !/[+/=]/.test(encUnicodeUrlSafe), encUnicodeUrlSafe);
  const decUnicodeUrlSafe = decodeBase64(encUnicodeUrlSafe);
  check("base64_unicode_roundtrip_urlsafe", decUnicodeUrlSafe.ok && decUnicodeUrlSafe.data === unicodeText, JSON.stringify(decUnicodeUrlSafe));

  // Large input, to exercise the chunked String.fromCharCode path (well
  // past the 0x8000-byte chunk size chosen to stay clear of call-stack
  // argument limits).
  const bigText = "The quick brown fox jumps over the lazy dog. ".repeat(5000); // ~230KB
  const bigRoundTrip = decodeBase64(encodeBase64(bigText, false));
  check("base64_large_input_roundtrip", bigRoundTrip.ok && bigRoundTrip.data === bigText);

  const decInvalid = decodeBase64("not valid base64!!!");
  check("base64_invalid_input_rejected", decInvalid.ok === false, JSON.stringify(decInvalid));
  const decMixed = decodeBase64("abc+def_ghi");
  check("base64_mixed_alphabet_rejected", decMixed.ok === false, JSON.stringify(decMixed));
  const decEmpty = decodeBase64("   ");
  check("base64_empty_input_rejected", decEmpty.ok === false, JSON.stringify(decEmpty));

  const invalidUtf8Bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x42]);
  let invalidUtf8Binary = "";
  invalidUtf8Bytes.forEach((b) => (invalidUtf8Binary += String.fromCharCode(b)));
  const invalidUtf8B64 = btoa(invalidUtf8Binary);
  const decBinary = decodeBase64(invalidUtf8B64);
  check("base64_non_utf8_bytes_flagged_not_error", decBinary.ok === true && !!decBinary.warning, JSON.stringify(decBinary));

  // ---- URL encode/decode ----
  check("url_component_encodes_slash", encodeUrl("a/b", "component") === "a%2Fb", encodeUrl("a/b", "component"));
  check("url_full_preserves_slash", encodeUrl("a/b", "full") === "a/b", encodeUrl("a/b", "full"));
  check("url_component_encodes_space", encodeUrl("a b", "component") === "a%20b");
  check("url_full_encodes_space", encodeUrl("a b", "full") === "a%20b");
  check("url_full_preserves_ampersand", encodeUrl("a&b=c", "full") === "a&b=c");
  check("url_component_encodes_ampersand", encodeUrl("a&b=c", "component") === "a%26b%3Dc");

  const urlRoundTrip = decodeUrl(encodeUrl("café ☕ /path?q=1&x=2", "component"), "component");
  check("url_component_roundtrip", urlRoundTrip.ok && urlRoundTrip.data === "café ☕ /path?q=1&x=2", JSON.stringify(urlRoundTrip));

  const urlMalformed = decodeUrl("100% done %", "component");
  check("url_malformed_percent_rejected", urlMalformed.ok === false, JSON.stringify(urlMalformed));
  const urlMalformed2 = decodeUrl("%zz", "component");
  check("url_invalid_hex_rejected", urlMalformed2.ok === false, JSON.stringify(urlMalformed2));

  // ---- UUID ----
  const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const batch = generateUuidBatch(50, { uppercase: false, hyphens: true });
  check("uuid_batch_count", batch.length === 50);
  check("uuid_batch_all_unique", new Set(batch).size === 50);
  check("uuid_batch_all_valid_shape", batch.every((u) => uuidShape.test(u)));
  const sampleUuid = batch[0];
  check("uuid_format_uppercase", formatUuid(sampleUuid, { uppercase: true, hyphens: true }) === sampleUuid.toUpperCase());
  check("uuid_format_no_hyphens", formatUuid(sampleUuid, { uppercase: false, hyphens: false }) === sampleUuid.replace(/-/g, ""));

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
