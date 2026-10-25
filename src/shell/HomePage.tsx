import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ShieldCheck, Github, Command } from "lucide-react";
import { detectInput, countLikelySecrets } from "../core/detect/detect";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../registry/types";
import { TOOLS, getTool } from "../registry/tools";
import { ICONS } from "../registry/icons";
import { Circle } from "lucide-react";
import { interceptLinkClick } from "./navigation";

const AVAILABLE_IDS = new Set(TOOLS.map((t) => t.id));
const RECENT_SHOWN = 4;

function ToolIcon({ name, className }: { name: string; className: string }) {
  const Icon = (ICONS as Record<string, typeof Circle>)[name] ?? Circle;
  return <Icon className={className} strokeWidth={2} aria-hidden="true" />;
}

export default function HomePage({
  recent,
  onPick,
  onOpenTool,
}: {
  recent: string[];
  onPick: (toolId: string, text: string, hint?: "base64" | "url") => void;
  onOpenTool: (toolId: string) => void;
}) {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text), 150);
    return () => window.clearTimeout(timer);
  }, [text]);

  const detections = useMemo(() => detectInput(debounced, AVAILABLE_IDS), [debounced]);
  const secrets = useMemo(() => countLikelySecrets(debounced), [debounced]);
  const recentTools = recent.map((id) => getTool(id)).filter((t) => t !== undefined).slice(0, RECENT_SHOWN);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pb-16 pt-10 sm:px-8">
      <section className="mx-auto max-w-[760px] text-center">
        <h1 tabIndex={-1} className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[36px] sm:leading-[44px]">
          Developer tools that never see your data.
        </h1>
        <p className="mx-auto mt-3 max-w-[620px] text-[15px] leading-relaxed text-ink-dim">
          Format, convert, decode and debug — everything runs in your browser. Paste a failing request or log and get a
          redacted report you can safely share.
        </p>
      </section>

      <section className="mx-auto mt-8 max-w-[760px]">
        <label htmlFor="home-paste" className="sr-only">
          Paste anything to get a tool suggestion
        </label>
        <textarea
          id="home-paste"
          data-testid="home-paste"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder="Paste anything — JSON, a JWT, a cURL command, a HAR file, a log, a cron expression…"
          className="focus-ring h-[160px] w-full resize-none rounded-[14px] border border-border bg-surface p-4 font-mono text-[13px] leading-6 text-ink placeholder:text-ink-faint"
        />

        <div className="mt-3 flex flex-col gap-2" aria-live="polite">
          {detections.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {detections.map((d) => {
                const tool = getTool(d.toolId);
                if (!tool) return null;
                return (
                  <button
                    key={`${d.toolId}-${d.hint ?? ""}`}
                    type="button"
                    data-testid={`home-suggest-${d.toolId}`}
                    onClick={() => onPick(d.toolId, text, d.hint)}
                    className="focus-ring inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/20"
                  >
                    <span>{d.label}</span>
                    <span aria-hidden="true">→</span>
                    <span>Open in {tool.navTitle}</span>
                  </button>
                );
              })}
            </div>
          )}

          {secrets.total > 0 && (
            <p
              data-testid="home-secrets-warning"
              className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn"
            >
              Contains {secrets.total} likely secret{secrets.total === 1 ? "" : "s"} ({secrets.categories.join(", ")}). Use
              Debug Report to share it safely.
            </p>
          )}
        </div>
      </section>

      {recentTools.length > 0 && (
        <section className="mx-auto mt-10 max-w-[760px]">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Continue</h2>
          <div className="flex flex-wrap gap-2">
            {recentTools.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpenTool(t.id)}
                className="focus-ring inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink-dim transition-colors hover:border-accent/40 hover:text-ink"
              >
                <ToolIcon name={t.icon} className="h-4 w-4" />
                {t.navTitle}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12 space-y-8">
        {CATEGORY_ORDER.map((category) => {
          const tools = TOOLS.filter((t) => t.category === category);
          if (tools.length === 0) return null;
          return (
            <div key={category}>
              <h2 className="mb-3 text-[16px] font-semibold text-ink">
                {CATEGORY_LABELS[category]} <span className="ml-1 text-[13px] font-normal text-ink-faint">{tools.length}</span>
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {tools.map((t) => (
                  <a
                    key={t.id}
                    href={`/${t.slug}/`}
                    data-testid={`home-card-${t.id}`}
                    onClick={(e) => interceptLinkClick(e, `/${t.slug}/`)}
                    className="focus-ring group flex items-start gap-3 rounded-[10px] border border-border bg-surface p-3 transition-colors hover:border-accent/40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised text-ink-dim group-hover:text-accent">
                      <ToolIcon name={t.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-ink">{t.navTitle}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-ink-dim">{t.description}</span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <a
          href="/privacy/"
          onClick={(e) => interceptLinkClick(e, "/privacy/")}
          className="focus-ring rounded-[10px] border border-border-subtle bg-surface p-4"
        >
          <ShieldCheck className="h-4 w-4 text-ok" strokeWidth={2} aria-hidden="true" />
          <p className="mt-1.5 text-[14px] font-semibold text-ink">No uploads</p>
          <p className="mt-0.5 text-[13px] text-ink-dim">The browser blocks every connection (connect-src 'none').</p>
        </a>
        <a
          href="https://github.com/Nikhil03-hub/dev-tools-hub"
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring rounded-[10px] border border-border-subtle bg-surface p-4"
        >
          <Github className="h-4 w-4 text-ink-dim" strokeWidth={2} aria-hidden="true" />
          <p className="mt-1.5 text-[14px] font-semibold text-ink">Open source</p>
          <p className="mt-0.5 text-[13px] text-ink-dim">MIT, on GitHub.</p>
        </a>
        <div className="rounded-[10px] border border-border-subtle bg-surface p-4">
          <Command className="h-4 w-4 text-ink-dim" strokeWidth={2} aria-hidden="true" />
          <p className="mt-1.5 text-[14px] font-semibold text-ink">Keyboard-first</p>
          <p className="mt-0.5 text-[13px] text-ink-dim">Every tool is a keystroke away.</p>
        </div>
      </section>

      <footer className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle pt-5 text-[12px] text-ink-faint">
        <span>© {new Date().getFullYear()} Dev Tools Hub</span>
        <span>MIT</span>
        <a href="https://github.com/Nikhil03-hub/dev-tools-hub" target="_blank" rel="noopener noreferrer" className="focus-ring rounded hover:text-ink">
          GitHub
        </a>
        <a href="/privacy/" onClick={(e) => interceptLinkClick(e, "/privacy/")} className="focus-ring rounded hover:text-ink">
          Privacy
        </a>
        <a href="/about/" onClick={(e) => interceptLinkClick(e, "/about/")} className="focus-ring rounded hover:text-ink">
          About
        </a>
        <a
          href="https://github.com/Nikhil03-hub/dev-tools-hub/blob/master/SECURITY.md"
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-flex items-center gap-1 rounded hover:text-ink"
        >
          Report a vulnerability <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
