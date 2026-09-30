import type { RedactionSummaryRow } from "../../../lib/debugkit/types";

const FRIENDLY: Record<string, string> = {
  JWT: "JWTs",
  AUTH_TOKEN: "Auth tokens",
  BASIC_AUTH: "Basic-auth credentials",
  COOKIE: "Cookie values",
  SECRET: "Secret fields",
  PASSWORD: "Passwords",
  EMAIL: "Emails",
  IP: "IP addresses",
  CARD: "Card numbers",
  PRIVATE_KEY: "Private keys",
};

export function categoryName(category: string): string {
  if (FRIENDLY[category]) return FRIENDLY[category];
  const spaced = category.replace(/_/g, " ").toLowerCase();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RedactionLedger({ rows }: { rows: RedactionSummaryRow[] }) {
  if (rows.length === 0) {
    return (
      <div data-testid="debug-ledger" className="rounded-lg border border-border-subtle bg-raised/40 p-3 text-[13px] text-ink-dim">
        No secrets or personal data were detected by the redaction rules.
      </div>
    );
  }
  return (
    <div data-testid="debug-ledger" className="overflow-x-auto rounded-lg border border-border-subtle">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-raised/60 text-xs text-ink-dim">
          <tr>
            <th className="px-3 py-1.5 font-medium">Category</th>
            <th className="px-3 py-1.5 font-medium">Distinct values</th>
            <th className="px-3 py-1.5 font-medium">Occurrences</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category} data-category={r.category} className="border-t border-border-subtle">
              <td className="px-3 py-1.5 text-ink">{categoryName(r.category)}</td>
              <td className="px-3 py-1.5 text-ink-dim">{r.distinct}</td>
              <td className="px-3 py-1.5 text-ink-dim">{r.occurrences}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
