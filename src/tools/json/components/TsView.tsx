import { useMemo } from "react";
import { Copy, Download, Code2 } from "lucide-react";
import JsonEditor from "../../../components/JsonEditor";
import { jsonToTypeScript } from "../lib/jsonToTs";
import { copyText, downloadText } from "../../../lib/clipboard";
import { toast } from "../../../lib/toastBus";

export default function TsView({
  value,
  isValid,
  rootName,
  onRootNameChange,
}: {
  value: unknown;
  isValid: boolean;
  rootName: string;
  onRootNameChange: (v: string) => void;
}) {
  const generated = useMemo(() => {
    if (!isValid) return "";
    try {
      return jsonToTypeScript(value, rootName.trim() || "Root");
    } catch (e) {
      return `// Could not generate types: ${(e as Error).message}`;
    }
  }, [value, isValid, rootName]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle p-3">
        <label className="flex items-center gap-2 text-xs text-ink-dim">
          Root name
          <input
            value={rootName}
            onChange={(e) => onRootNameChange(e.target.value.replace(/[^A-Za-z0-9_$]/g, ""))}
            className="w-28 rounded-md border border-border bg-raised px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent"
            placeholder="Root"
          />
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            disabled={!isValid}
            onClick={async () => {
              await copyText(generated);
              toast("Copied TypeScript");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
            Copy
          </button>
          <button
            disabled={!isValid}
            onClick={() => downloadText(`${rootName.trim() || "Root"}.ts`, generated, "text/typescript")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Download .ts
          </button>
        </div>
      </div>
      <div data-testid="ts-output" className="min-h-0 flex-1">
        {isValid ? (
          <JsonEditor value={generated} readOnly ariaLabel="Generated TypeScript" language="ts" lint={false} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-ink-faint">
            <Code2 className="h-6 w-6" strokeWidth={1.5} />
            <p>Fix the JSON error in the main editor to generate TypeScript.</p>
          </div>
        )}
      </div>
    </div>
  );
}
