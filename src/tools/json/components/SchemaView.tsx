import { useMemo, type ReactNode } from "react";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import JsonEditor from "../../../components/JsonEditor";
import { parseJsonWithDiagnostics } from "../lib/jsonParse";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { checkSchema } from "../lib/schema";
import { SAMPLE_SCHEMA } from "../lib/sample";

export default function SchemaView({
  dataText,
  schemaText,
  onSchemaChange,
}: {
  dataText: string;
  schemaText: string;
  onSchemaChange: (v: string) => void;
}) {
  const debouncedData = useDebouncedValue(dataText, 250);
  const debouncedSchema = useDebouncedValue(schemaText, 250);

  const dataParsed = useMemo(() => parseJsonWithDiagnostics(debouncedData), [debouncedData]);
  const schemaParsed = useMemo(() => parseJsonWithDiagnostics(debouncedSchema), [debouncedSchema]);

  const result = useMemo(() => {
    if (!dataParsed.ok || !schemaParsed.ok) return null;
    return checkSchema(dataParsed.value, schemaParsed.value);
  }, [dataParsed, schemaParsed]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border-subtle p-3">
        <p className="mb-2 text-xs font-medium text-ink-dim">Validate the main editor's JSON against this JSON Schema:</p>
        <div data-testid="schema-editor" className="h-40 overflow-hidden rounded-lg border border-border">
          <JsonEditor
            value={schemaText}
            onChange={onSchemaChange}
            ariaLabel="JSON Schema"
            allowDrop
            minHeight="160px"
            placeholder="Paste a JSON Schema (draft-07 or 2020-12)…"
          />
        </div>
        {schemaText.trim() === "" && (
          <button
            data-testid="btn-load-sample-schema"
            className="mt-2 text-xs font-medium text-accent hover:text-accent-hover"
            onClick={() => onSchemaChange(JSON.stringify(SAMPLE_SCHEMA, null, 2))}
          >
            Load an example schema
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!dataParsed.ok && (
          <EmptyState icon={<ShieldQuestion className="h-6 w-6" strokeWidth={1.5} />} text="Fix the JSON error in the main editor to run schema validation." />
        )}
        {dataParsed.ok && !schemaParsed.ok && schemaText.trim() !== "" && (
          <EmptyState icon={<ShieldQuestion className="h-6 w-6" strokeWidth={1.5} />} text="The schema above isn't valid JSON yet." />
        )}
        {dataParsed.ok && schemaText.trim() === "" && (
          <EmptyState icon={<ShieldQuestion className="h-6 w-6" strokeWidth={1.5} />} text="Paste a JSON Schema above to validate against." />
        )}

        {result?.compileError && (
          <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
            <p className="font-medium">Your schema itself has a problem:</p>
            <p className="mt-1 font-mono text-xs text-warn/90">{result.compileError}</p>
          </div>
        )}

        {result && !result.compileError && result.ok && (
          <div data-testid="schema-valid" className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm font-medium text-ok">
            <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            Valid — the JSON matches this schema.
          </div>
        )}

        {result && !result.compileError && !result.ok && (
          <div data-testid="schema-issues">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-err">
              <ShieldAlert className="h-4 w-4" strokeWidth={2} />
              {result.issues.length} issue{result.issues.length === 1 ? "" : "s"} found
            </div>
            <div className="space-y-1.5">
              {result.issues.map((issue, i) => (
                <div key={i} className="rounded-lg border border-err/20 bg-err/[0.06] px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-ink-dim">{issue.path}</span>
                  <p className="text-err/90">{issue.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-ink-faint">
      {icon}
      <p>{text}</p>
    </div>
  );
}
