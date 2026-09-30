import { forwardRef, useImperativeHandle, useState, type DragEvent } from "react";
import { AlertCircle, CheckCircle2, Copy, Download, KeyRound, ShieldAlert, Sparkles, Trash2, UploadCloud } from "lucide-react";
import JsonEditor from "../../components/JsonEditor";
import type { Command } from "../../components/CommandPalette";
import type { ToolHandle } from "../../lib/toolHandle";
import { copyText, downloadText } from "../../lib/clipboard";
import { toast } from "../../lib/toastBus";
import { decodeJwt, buildSampleJwt, type JwtClaimInfo } from "../../lib/jwt";

type SegmentTab = "header" | "payload" | "signature";

const TABS: { id: SegmentTab; label: string }[] = [
  { id: "header", label: "Header" },
  { id: "payload", label: "Payload" },
  { id: "signature", label: "Signature" },
];

const CLAIM_TONE_CLASS: Record<JwtClaimInfo["tone"], string> = {
  ok: "border-ok/30 bg-ok/10 text-ok",
  warn: "border-warn/30 bg-warn/10 text-warn",
  err: "border-err/30 bg-err/10 text-err",
  neutral: "border-border bg-raised text-ink-dim",
};

const JwtDecoderApp = forwardRef<ToolHandle, { isActive: boolean }>(function JwtDecoderApp(_props, ref) {
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<SegmentTab>("payload");
  const [dragOver, setDragOver] = useState(false);

  const isEmpty = token.trim() === "";
  const result = isEmpty ? null : decodeJwt(token);

  function clear() {
    setToken("");
    toast("Cleared");
  }

  function loadSample() {
    setToken(buildSampleJwt());
    setTab("payload");
    toast("Loaded sample JWT");
  }

  async function copySegment(label: string, text: string) {
    await copyText(text);
    toast(`Copied ${label}`);
  }

  async function downloadSegment(filename: string, text: string) {
    await downloadText(filename, text, "application/json");
    toast(`Downloaded ${filename}`);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    file.text().then((text) => setToken(text.trim()));
  }

  const commands: Command[] = [
    { id: "jwt-sample", label: "Load sample JWT", group: "JWT Decoder", action: loadSample },
    { id: "jwt-clear", label: "Clear JWT input", group: "JWT Decoder", action: clear },
    { id: "jwt-view-header", label: "Go to Header segment", group: "JWT Decoder", action: () => setTab("header") },
    { id: "jwt-view-payload", label: "Go to Payload segment", group: "JWT Decoder", action: () => setTab("payload") },
    { id: "jwt-view-signature", label: "Go to Signature segment", group: "JWT Decoder", action: () => setTab("signature") },
    ...(result?.ok
      ? [
          { id: "jwt-copy-header", label: "Copy decoded header", group: "JWT Decoder", action: () => copySegment("header", result.data.headerJson) },
          { id: "jwt-copy-payload", label: "Copy decoded payload", group: "JWT Decoder", action: () => copySegment("payload", result.data.payloadJson) },
          { id: "jwt-copy-signature", label: "Copy raw signature", group: "JWT Decoder", action: () => copySegment("signature", result.data.signature) },
        ]
      : []),
  ];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(360px,1fr)_minmax(440px,1.3fr)] lg:gap-4 lg:overflow-hidden lg:p-4">
      <section className="flex min-h-[40vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-col gap-2.5 border-b border-border-subtle p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-jwt-sample"
              onClick={loadSample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">Load sample</span>
              <span className="sm:hidden">Sample</span>
            </button>
            <button
              type="button"
              data-testid="btn-jwt-clear"
              onClick={clear}
              disabled={isEmpty}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-border hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Clear
            </button>
          </div>

          {isEmpty ? (
            <div data-testid="jwt-status" data-status="empty" className="flex items-center gap-1.5 text-xs text-ink-faint">
              <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
              Paste, type, or drop a JWT to begin
            </div>
          ) : result?.ok ? (
            <div data-testid="jwt-status" data-status="valid" className="flex items-center gap-1.5 text-xs font-medium text-ok">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              Decoded {result.data.alg ? `— alg: ${result.data.alg}` : ""}
            </div>
          ) : (
            <div data-testid="jwt-status" data-status="invalid" className="flex items-start gap-1.5 text-xs text-err">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
              <span>{result && !result.ok ? result.error : ""}</span>
            </div>
          )}
        </div>

        <div
          data-testid="jwt-input"
          className="relative min-h-0 flex-1"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            aria-label="JWT input"
            placeholder="Paste a JWT here (header.payload.signature)…"
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent p-3.5 font-mono text-[13px] leading-6 text-ink outline-none placeholder:text-ink-faint"
          />
          {dragOver && (
            <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent bg-canvas/90 text-accent">
              <UploadCloud className="h-8 w-8" strokeWidth={1.5} />
              <p className="text-sm font-medium">Drop your token file</p>
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle p-2">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                data-testid={`jwt-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "bg-accent/15 text-accent" : "text-ink-dim hover:bg-raised hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {result?.ok && result.data.claims.length > 0 && (
          <div data-testid="jwt-claims" className="flex flex-wrap items-center gap-1.5 border-b border-border-subtle p-2.5">
            {result.data.claims.map((c) => (
              <span
                key={c.key}
                title={c.iso}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${CLAIM_TONE_CLASS[c.tone]}`}
              >
                {c.key}: {c.iso} ({c.note})
              </span>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1">
          {!result ? (
            <PanelEmpty text="Paste a JWT on the left to decode it." />
          ) : !result.ok ? (
            <PanelEmpty text="Fix the token on the left to see it decoded here." />
          ) : (
            <>
              <div className={tab === "header" ? "flex h-full min-h-0 flex-col" : "hidden"}>
                <SegmentToolbar
                  segment="header"
                  onCopy={() => copySegment("header", result.data.headerJson)}
                  onDownload={() => downloadSegment("jwt-header.json", result.data.headerJson)}
                />
                <div data-testid="jwt-header-output" className="min-h-0 flex-1">
                  <JsonEditor value={result.data.headerJson} readOnly ariaLabel="Decoded JWT header" lint={false} />
                </div>
              </div>

              <div className={tab === "payload" ? "flex h-full min-h-0 flex-col" : "hidden"}>
                <SegmentToolbar
                  segment="payload"
                  onCopy={() => copySegment("payload", result.data.payloadJson)}
                  onDownload={() => downloadSegment("jwt-payload.json", result.data.payloadJson)}
                />
                <div data-testid="jwt-payload-output" className="min-h-0 flex-1">
                  <JsonEditor value={result.data.payloadJson} readOnly ariaLabel="Decoded JWT payload" lint={false} />
                </div>
              </div>

              <div className={tab === "signature" ? "flex h-full flex-col" : "hidden"}>
                <div className="flex items-center justify-between gap-2 border-b border-border-subtle p-3">
                  <div data-testid="jwt-signature-warning" className="flex items-center gap-1.5 text-xs font-medium text-warn">
                    <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2} />
                    Signature — shown as-is, not verified
                  </div>
                  <button
                    data-testid="btn-copy-signature"
                    onClick={() => copySegment("signature", result.data.signature)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                    Copy
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  {result.data.signature === "" ? (
                    <p className="text-sm text-ink-faint">
                      This token has an empty signature segment{result.data.alg === "none" ? " (alg: none)" : ""}.
                    </p>
                  ) : (
                    <p data-testid="jwt-signature-value" className="break-all font-mono text-[13px] leading-6 text-ink-dim">
                      {result.data.signature}
                    </p>
                  )}
                  <p className="mt-4 text-xs text-ink-faint">
                    This tool never checks whether a signature is valid — that requires the secret key or public key
                    the token was signed with, which never leaves your server. It only decodes what's already
                    plainly readable in any JWT without a key.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
});

export default JwtDecoderApp;

function SegmentToolbar({ segment, onCopy, onDownload }: { segment: string; onCopy: () => void; onDownload: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1.5 border-b border-border-subtle p-2">
      <button
        data-testid={`btn-copy-${segment}`}
        onClick={onCopy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
      >
        <Copy className="h-3.5 w-3.5" strokeWidth={2} />
        Copy
      </button>
      <button
        data-testid={`btn-download-${segment}`}
        onClick={onDownload}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
      >
        <Download className="h-3.5 w-3.5" strokeWidth={2} />
        Download
      </button>
    </div>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-faint">{text}</div>;
}
