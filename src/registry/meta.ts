// Tool registry DATA. Pure: imports types only, so the static-page generator
// (scripts/postbuild-pages.ts) can load it under Node.
// Rules for every entry: docs/v3/ARCHITECTURE.md §4. Order inside a category
// is the display order. New tools are appended by their task.
import type { ToolMeta } from "./types";

export const TOOL_META: ToolMeta[] = [
  {
    id: "debug-report",
    slug: "debug-report",
    legacyHash: "debug",
    title: "Debug Report: diagnose and redact requests",
    navTitle: "Debug Report",
    description:
      "Paste a failing cURL, HAR file or log. Get the likely cause with evidence and a redacted report you can share. Runs in your browser.",
    category: "debug",
    keywords: ["har", "curl", "log", "redact", "sanitize", "401", "403", "cors", "jwt expired", "stack trace", "bug report", "share safely"],
    icon: "Bug",
    status: "stable",
    docs: {
      howTo: [
        "In your browser's DevTools → Network, right-click the failing request → Copy → Copy as cURL (or Save all as HAR).",
        "Paste it here, together with the response or the log lines if you have them.",
        "Read the findings: each one shows the evidence and what to do next.",
        "Open Share, pick AI chat, GitHub issue or support ticket, review the text and copy it.",
      ],
      faq: [
        {
          q: "Is anything uploaded?",
          a: "No. The page's Content-Security-Policy sets connect-src 'none', so the browser itself refuses to send what you paste anywhere.",
        },
        {
          q: "Will it remove every secret?",
          a: "It replaces known token formats and values of fields named like secrets, with consistent placeholders. Unusual secrets can slip through, so always review before sharing.",
        },
        {
          q: "Does it verify JWT signatures?",
          a: "No. Verifying needs the issuer's key, which this tool never fetches. Claims are decoded and the signature is marked Not verified.",
        },
      ],
      related: ["jwt-decoder", "json-workbench", "timestamp-converter"],
    },
  },
  {
    id: "json-workbench",
    slug: "json-formatter",
    legacyHash: "json",
    title: "JSON Formatter, Validator and Diff",
    navTitle: "JSON Workbench",
    description:
      "Format, validate and minify JSON with exact error lines, explore it as a tree, diff two documents, check a schema and generate TypeScript types.",
    category: "data",
    keywords: ["json", "format", "beautify", "pretty print", "validate", "lint", "minify", "tree", "diff", "schema", "typescript", "types"],
    icon: "Braces",
    status: "stable",
    docs: {
      howTo: [
        "Paste or drop JSON into the editor.",
        "Errors point to the exact line and column; Format and Minify fix the layout.",
        "Use the Tree, Diff, Schema and TypeScript tabs on the right.",
      ],
      faq: [
        {
          q: "Is my JSON saved anywhere?",
          a: "No. Nothing is stored or uploaded. Reloading the page clears it.",
        },
        {
          q: "How large a file can it handle?",
          a: "Several megabytes work well. Very large files are slower because everything runs on your device.",
        },
      ],
      related: ["debug-report", "jwt-decoder", "regex-tester"],
    },
  },
  {
    id: "jwt-decoder",
    slug: "jwt-decoder",
    legacyHash: "jwt",
    title: "JWT Decoder",
    navTitle: "JWT Decoder",
    description:
      "Decode a JSON Web Token's header and payload, see when it expires in plain words, and spot common problems. Nothing leaves your browser.",
    category: "encoding",
    keywords: ["jwt", "json web token", "decode", "bearer", "token", "exp", "claims", "id token", "access token"],
    icon: "KeyRound",
    status: "stable",
    docs: {
      howTo: ["Paste a token (with or without the Bearer prefix).", "Read the header, the claims and the expiry status.", "Copy any part you need."],
      faq: [
        {
          q: "Is it safe to paste a real token?",
          a: "The token never leaves this tab. Still, treat live tokens as passwords and prefer expired or test tokens when you can.",
        },
        {
          q: "Does it check the signature?",
          a: "No. Signature verification needs the issuer's key; this tool decodes only.",
        },
      ],
      related: ["debug-report", "timestamp-converter", "encode-generate"],
    },
  },
  {
    id: "regex-tester",
    slug: "regex-tester",
    legacyHash: "regex",
    title: "Regex Tester",
    navTitle: "Regex Tester",
    description:
      "Test JavaScript regular expressions live with match highlighting, capture groups and replace preview, explained in plain language.",
    category: "text",
    keywords: ["regex", "regexp", "regular expression", "match", "capture group", "replace", "pattern"],
    icon: "Regex",
    status: "stable",
    docs: {
      howTo: ["Type a pattern and choose flags.", "Paste test text; matches and groups highlight as you type.", "Use Replace to preview substitutions."],
      faq: [
        {
          q: "Which regex flavour is this?",
          a: "Your browser's JavaScript engine (ECMAScript), the same one Node.js uses.",
        },
      ],
      related: ["json-workbench", "debug-report", "timestamp-converter"],
    },
  },
  {
    id: "timestamp-converter",
    slug: "timestamp-converter",
    legacyHash: "timestamp",
    title: "Unix Timestamp Converter",
    navTitle: "Timestamp",
    description:
      "Convert Unix timestamps in seconds or milliseconds to dates and back, across time zones, with ISO 8601 and relative time.",
    category: "time",
    keywords: ["unix", "epoch", "timestamp", "date", "time zone", "iso 8601", "milliseconds", "utc"],
    icon: "Clock",
    status: "stable",
    docs: {
      howTo: ["Paste a timestamp or pick a date.", "Seconds and milliseconds are detected automatically.", "Compare the same instant across time zones."],
      faq: [
        {
          q: "Seconds or milliseconds?",
          a: "10-digit values are read as seconds and 13-digit values as milliseconds; you can switch manually.",
        },
      ],
      related: ["jwt-decoder", "debug-report", "json-workbench"],
    },
  },
  {
    id: "encode-generate",
    slug: "encode-generate",
    legacyHash: "generators",
    title: "Base64, URL, UUID and Hash Tools",
    navTitle: "Encode & Generate",
    description:
      "Encode and decode Base64 and URLs, generate UUIDs, and hash text with SHA-256, SHA-1 or MD5, all locally in your browser.",
    category: "encoding",
    keywords: ["base64", "url encode", "url decode", "percent encoding", "uuid", "guid", "hash", "sha256", "sha1", "md5"],
    icon: "Binary",
    status: "stable",
    docs: {
      howTo: ["Pick Base64, URL, UUID or Hash at the top.", "Type or paste your input; the result updates instantly.", "Copy the result."],
      faq: [
        {
          q: "Are the UUIDs random enough?",
          a: "Yes. They use your browser's cryptographic random generator (crypto.randomUUID).",
        },
        {
          q: "Should I use MD5 or SHA-1 for passwords?",
          a: "No. They are offered for checksums and legacy systems only.",
        },
      ],
      related: ["jwt-decoder", "json-workbench", "debug-report"],
    },
  },
  {
    id: "yaml-json",
    slug: "yaml-to-json",
    title: "YAML to JSON Converter (and back)",
    navTitle: "YAML ⇄ JSON",
    description:
      "Convert YAML to JSON and JSON to YAML with exact error lines, multi-document support and safe alias limits. Runs in your browser.",
    category: "data",
    keywords: ["yaml", "yml", "json", "convert", "kubernetes", "docker compose", "config"],
    icon: "ArrowLeftRight",
    status: "new",
    docs: {
      howTo: ["Paste YAML or JSON on the left.", "Pick the direction with the ⇄ switch (it is detected when you paste).", "Copy or download the result."],
      faq: [
        {
          q: "Why does 'yes' stay a string?",
          a: "This tool follows YAML 1.2, where yes/no/on/off are plain strings. Only true and false are booleans.",
        },
        {
          q: "What about multiple documents (---)?",
          a: "Each document becomes one item of a JSON array, and you get a note saying so.",
        },
      ],
      // csv-json and toml-json do not exist yet; check:registry requires real ids.
      related: ["json-workbench", "debug-report"],
    },
  },
];
