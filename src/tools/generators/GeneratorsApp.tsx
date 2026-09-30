import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Binary, Fingerprint, Hash as HashIcon, Link as LinkIcon } from "lucide-react";
import type { Command } from "../../components/CommandPalette";
import type { ToolHandle } from "../../lib/toolHandle";
import { copyText, downloadText } from "../../lib/clipboard";
import { toast } from "../../lib/toastBus";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { decodeBase64, encodeBase64, buildBase64Sample, type Base64Result } from "../../lib/base64";
import { decodeUrl, encodeUrl, buildUrlSample, type UrlEncodeMode, type UrlEncodeResult } from "../../lib/urlEncode";
import { computeHash, buildHashSample, type HashAlgorithm, type HashResult } from "../../lib/hash";
import { formatUuid, generateUuidBatch } from "../../lib/uuid";
import Base64Panel from "./components/Base64Panel";
import UrlEncodePanel from "./components/UrlEncodePanel";
import UuidPanel from "./components/UuidPanel";
import HashPanel from "./components/HashPanel";

type SubMode = "base64" | "url" | "uuid" | "hash";
type Direction = "encode" | "decode";

const SUB_MODES: { id: SubMode; label: string; icon: typeof Binary }[] = [
  { id: "base64", label: "Base64", icon: Binary },
  { id: "url", label: "URL Encode/Decode", icon: LinkIcon },
  { id: "uuid", label: "UUID", icon: Fingerprint },
  { id: "hash", label: "Hash", icon: HashIcon },
];

// The hub's fourth-and-a-half tool: four small, independent utilities
// bundled under one top-level tab (rather than four more Header pills)
// with their own segmented switcher, one level below the hub's own tool
// switcher. Each sub-tool keeps its own state, and — like every other tool
// in this hub — all four stay mounted at once (CSS-hidden, not unmounted),
// so switching between Base64/URL/UUID/Hash never discards what you typed
// into another one.
const GeneratorsApp = forwardRef<ToolHandle, { isActive: boolean }>(function GeneratorsApp(_props, ref) {
  const [subMode, setSubMode] = useState<SubMode>("base64");

  // ---- Base64 ----
  const [b64Direction, setB64Direction] = useState<Direction>("encode");
  const [b64Input, setB64Input] = useState("");
  const [b64UrlSafe, setB64UrlSafe] = useState(false);
  const b64Result: Base64Result | null = useMemo(() => {
    if (b64Input.trim() === "") return null;
    return b64Direction === "encode" ? { ok: true, data: encodeBase64(b64Input, b64UrlSafe) } : decodeBase64(b64Input);
  }, [b64Input, b64Direction, b64UrlSafe]);

  // ---- URL encode/decode ----
  const [urlDirection, setUrlDirection] = useState<Direction>("encode");
  const [urlInput, setUrlInput] = useState("");
  const [urlMode, setUrlMode] = useState<UrlEncodeMode>("component");
  const urlResult: UrlEncodeResult | null = useMemo(() => {
    if (urlInput.trim() === "") return null;
    return urlDirection === "encode" ? { ok: true, data: encodeUrl(urlInput, urlMode) } : decodeUrl(urlInput, urlMode);
  }, [urlInput, urlDirection, urlMode]);

  // ---- UUID ----
  const [uuidCount, setUuidCount] = useState(5);
  const [uuidUppercase, setUuidUppercase] = useState(false);
  const [uuidHyphens, setUuidHyphens] = useState(true);
  // Raw (canonical, lowercase-with-hyphens) values are what's stored;
  // format options are applied for display only, so toggling case/hyphens
  // re-styles what's already there instead of silently throwing away a
  // batch and generating a new one.
  const [uuidRaw, setUuidRaw] = useState<string[]>([]);
  const uuidDisplay = useMemo(
    () => uuidRaw.map((raw) => formatUuid(raw, { uppercase: uuidUppercase, hyphens: uuidHyphens })),
    [uuidRaw, uuidUppercase, uuidHyphens]
  );

  // ---- Hash ----
  const [hashInput, setHashInput] = useState("");
  const [hashAlgorithm, setHashAlgorithm] = useState<HashAlgorithm>("SHA-256");
  const [hashResult, setHashResult] = useState<HashResult | null>(null);
  const [hashComputing, setHashComputing] = useState(false);
  const debouncedHashInput = useDebouncedValue(hashInput, 150);
  const hashRequestId = useRef(0);

  useEffect(() => {
    if (debouncedHashInput.trim() === "") {
      setHashResult(null);
      setHashComputing(false);
      return;
    }
    const requestId = ++hashRequestId.current;
    setHashComputing(true);
    computeHash(debouncedHashInput, hashAlgorithm).then((result) => {
      // A later keystroke (or algorithm switch) may have started a newer
      // request while this one was in flight — crypto.subtle.digest is
      // async, so results can resolve out of order. Only the most recent
      // request is allowed to write state.
      if (hashRequestId.current === requestId) {
        setHashResult(result);
        setHashComputing(false);
      }
    });
  }, [debouncedHashInput, hashAlgorithm]);

  async function copyLabeled(label: string, value: string) {
    await copyText(value);
    toast(`Copied ${label}`);
  }

  // ---- Base64 actions ----
  function base64LoadSample() {
    setB64Direction("encode");
    setB64Input(buildBase64Sample());
    toast("Loaded sample");
  }
  function base64Clear() {
    setB64Input("");
    toast("Cleared");
  }
  async function base64CopyOutput() {
    if (b64Result?.ok) await copyLabeled("result", b64Result.data);
  }
  async function base64DownloadOutput() {
    if (b64Result?.ok) await downloadText("base64-result.txt", b64Result.data, "text/plain");
  }

  // ---- URL actions ----
  function urlLoadSample() {
    setUrlDirection("encode");
    setUrlInput(buildUrlSample(urlMode));
    toast("Loaded sample");
  }
  function urlClear() {
    setUrlInput("");
    toast("Cleared");
  }
  async function urlCopyOutput() {
    if (urlResult?.ok) await copyLabeled("result", urlResult.data);
  }
  async function urlDownloadOutput() {
    if (urlResult?.ok) await downloadText("url-result.txt", urlResult.data, "text/plain");
  }

  // ---- UUID actions ----
  function uuidGenerate() {
    setUuidRaw(generateUuidBatch(uuidCount, { uppercase: false, hyphens: true }));
    toast(`Generated ${uuidCount} UUID${uuidCount === 1 ? "" : "s"}`);
  }
  function uuidClear() {
    setUuidRaw([]);
    toast("Cleared");
  }
  async function uuidCopyAll() {
    if (uuidDisplay.length > 0) await copyLabeled("all UUIDs", uuidDisplay.join("\n"));
  }
  async function uuidDownloadAll() {
    if (uuidDisplay.length > 0) await downloadText("uuids.txt", uuidDisplay.join("\n"), "text/plain");
  }

  // ---- Hash actions ----
  function hashLoadSample() {
    setHashInput(buildHashSample());
    toast("Loaded sample");
  }
  function hashClear() {
    setHashInput("");
    toast("Cleared");
  }
  async function hashCopyOutput() {
    if (hashResult?.ok) await copyLabeled("digest", hashResult.data);
  }
  async function hashDownloadOutput() {
    if (hashResult?.ok) await downloadText(`${hashAlgorithm.toLowerCase()}-digest.txt`, hashResult.data, "text/plain");
  }

  const subModeCommands: Command[] = SUB_MODES.filter((m) => m.id !== subMode).map((m) => ({
    id: `generators-switch-${m.id}`,
    label: `Switch to: ${m.label}`,
    group: "Generators & Converters",
    action: () => setSubMode(m.id),
  }));

  const activeCommands: Command[] =
    subMode === "base64"
      ? [
          { id: "base64-sample", label: "Load sample", group: "Base64", action: base64LoadSample },
          { id: "base64-clear", label: "Clear", group: "Base64", action: base64Clear },
          { id: "base64-mode-encode", label: "Switch to: Encode", group: "Base64", action: () => setB64Direction("encode") },
          { id: "base64-mode-decode", label: "Switch to: Decode", group: "Base64", action: () => setB64Direction("decode") },
          { id: "base64-toggle-urlsafe", label: "Toggle URL-safe output", group: "Base64", action: () => setB64UrlSafe((v) => !v) },
          ...(b64Result?.ok ? [{ id: "base64-copy", label: "Copy result", group: "Base64", action: base64CopyOutput }] : []),
        ]
      : subMode === "url"
        ? [
            { id: "url-sample", label: "Load sample", group: "URL Encode/Decode", action: urlLoadSample },
            { id: "url-clear", label: "Clear", group: "URL Encode/Decode", action: urlClear },
            { id: "url-mode-encode", label: "Switch to: Encode", group: "URL Encode/Decode", action: () => setUrlDirection("encode") },
            { id: "url-mode-decode", label: "Switch to: Decode", group: "URL Encode/Decode", action: () => setUrlDirection("decode") },
            { id: "url-mode-component", label: "Switch to: Component mode", group: "URL Encode/Decode", action: () => setUrlMode("component") },
            { id: "url-mode-full", label: "Switch to: Full URI mode", group: "URL Encode/Decode", action: () => setUrlMode("full") },
            ...(urlResult?.ok ? [{ id: "url-copy", label: "Copy result", group: "URL Encode/Decode", action: urlCopyOutput }] : []),
          ]
        : subMode === "uuid"
          ? [
              { id: "uuid-generate", label: "Generate", group: "UUID", action: uuidGenerate },
              { id: "uuid-clear", label: "Clear", group: "UUID", action: uuidClear },
              { id: "uuid-toggle-uppercase", label: "Toggle uppercase", group: "UUID", action: () => setUuidUppercase((v) => !v) },
              { id: "uuid-toggle-hyphens", label: "Toggle hyphens", group: "UUID", action: () => setUuidHyphens((v) => !v) },
              ...(uuidDisplay.length > 0 ? [{ id: "uuid-copy-all", label: "Copy all", group: "UUID", action: uuidCopyAll }] : []),
            ]
          : [
              { id: "hash-sample", label: "Load sample", group: "Hash", action: hashLoadSample },
              { id: "hash-clear", label: "Clear", group: "Hash", action: hashClear },
              ...buildHashAlgorithmCommands(setHashAlgorithm),
              ...(hashResult?.ok ? [{ id: "hash-copy", label: "Copy digest", group: "Hash", action: hashCopyOutput }] : []),
            ];

  const commands: Command[] = [...subModeCommands, ...activeCommands];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle bg-surface p-2" data-testid="generators-submode-toggle">
        {SUB_MODES.map((m) => {
          const Icon = m.icon;
          const active = subMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              data-testid={`generators-submode-${m.id}`}
              onClick={() => setSubMode(m.id)}
              aria-pressed={active}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-accent/15 text-accent" : "text-ink-dim hover:bg-raised hover:text-ink"
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        <div className={subMode === "base64" ? "h-full" : "hidden"}>
          <Base64Panel
            direction={b64Direction}
            onDirectionChange={setB64Direction}
            input={b64Input}
            onInputChange={setB64Input}
            urlSafe={b64UrlSafe}
            onUrlSafeChange={setB64UrlSafe}
            result={b64Result}
            onLoadSample={base64LoadSample}
            onClear={base64Clear}
            onCopyOutput={base64CopyOutput}
            onDownloadOutput={base64DownloadOutput}
          />
        </div>
        <div className={subMode === "url" ? "h-full" : "hidden"}>
          <UrlEncodePanel
            direction={urlDirection}
            onDirectionChange={setUrlDirection}
            input={urlInput}
            onInputChange={setUrlInput}
            mode={urlMode}
            onModeChange={setUrlMode}
            result={urlResult}
            onLoadSample={urlLoadSample}
            onClear={urlClear}
            onCopyOutput={urlCopyOutput}
            onDownloadOutput={urlDownloadOutput}
          />
        </div>
        <div className={subMode === "uuid" ? "h-full" : "hidden"}>
          <UuidPanel
            count={uuidCount}
            onCountChange={setUuidCount}
            uppercase={uuidUppercase}
            onUppercaseChange={setUuidUppercase}
            hyphens={uuidHyphens}
            onHyphensChange={setUuidHyphens}
            results={uuidDisplay}
            onGenerate={uuidGenerate}
            onClear={uuidClear}
            onCopyOne={(value) => copyLabeled("UUID", value)}
            onCopyAll={uuidCopyAll}
            onDownloadAll={uuidDownloadAll}
          />
        </div>
        <div className={subMode === "hash" ? "h-full" : "hidden"}>
          <HashPanel
            input={hashInput}
            onInputChange={setHashInput}
            algorithm={hashAlgorithm}
            onAlgorithmChange={setHashAlgorithm}
            result={hashResult}
            computing={hashComputing}
            onLoadSample={hashLoadSample}
            onClear={hashClear}
            onCopyOutput={hashCopyOutput}
            onDownloadOutput={hashDownloadOutput}
          />
        </div>
      </div>
    </div>
  );
});

function buildHashAlgorithmCommands(setAlgorithm: (a: HashAlgorithm) => void): Command[] {
  const algorithms: HashAlgorithm[] = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];
  return algorithms.map((a) => ({
    id: `hash-algorithm-${a}`,
    label: `Switch to: ${a}`,
    group: "Hash",
    action: () => setAlgorithm(a),
  }));
}

export default GeneratorsApp;
