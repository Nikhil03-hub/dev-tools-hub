import type { LogSummary } from "../../../lib/debugkit/types";

export default function LogSummaryCard({ logs }: { logs: LogSummary }) {
  return (
    <section data-testid="debug-log-card" className="rounded-lg border border-border-subtle bg-raised/40 p-3">
      <h3 className="text-sm font-medium text-ink">Log summary</h3>
      <p className="mt-1.5 text-[13px] text-ink-dim">
        {logs.nonEmptyLines} lines → {logs.distinctTemplates} distinct messages · {logs.errorLines} errors · {logs.warnLines} warnings
        {logs.firstTimestamp ? ` · ${logs.firstTimestamp} → ${logs.lastTimestamp ?? logs.firstTimestamp}` : ""}
      </p>
      {logs.exceptions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {logs.exceptions.map((e, i) => (
            <li key={i} className="break-all font-mono text-[12px] text-err">
              {e}
            </li>
          ))}
        </ul>
      )}
      {logs.templates.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-md border border-border-subtle">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-raised/60 text-ink-dim">
              <tr>
                <th className="px-2 py-1 font-medium">Count</th>
                <th className="px-2 py-1 font-medium">Level</th>
                <th className="px-2 py-1 font-medium">First line</th>
                <th className="px-2 py-1 font-medium">Message template</th>
              </tr>
            </thead>
            <tbody>
              {logs.templates.slice(0, 10).map((t, i) => (
                <tr key={i} className="border-t border-border-subtle align-top">
                  <td className="px-2 py-1 text-ink">{t.count}</td>
                  <td className="px-2 py-1 text-ink-dim">{t.level}</td>
                  <td className="px-2 py-1 text-ink-dim">{t.firstLine}</td>
                  <td className="whitespace-pre-wrap break-all px-2 py-1 font-mono text-ink-dim">{t.template}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
