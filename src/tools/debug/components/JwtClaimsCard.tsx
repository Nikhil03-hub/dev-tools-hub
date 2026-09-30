import type { JwtSummary } from "../../../lib/debugkit/types";

const TIME_CLAIMS = new Set(["exp", "iat", "nbf"]);

function isoOf(seconds: number): string | null {
  const d = new Date(seconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function JwtClaimsCard({ jwts }: { jwts: JwtSummary[] }) {
  return (
    <section data-testid="debug-jwt-card" className="rounded-lg border border-border-subtle bg-raised/40 p-3">
      <h3 className="text-sm font-medium text-ink">Token claims (non-identifying only)</h3>
      <div className="mt-2 space-y-3">
        {jwts.map((j) => (
          <div key={j.placeholder}>
            <p className="font-mono text-[12px] text-ink">
              {j.placeholder}
              {j.alg ? <span className="text-ink-dim"> · alg: {j.alg}</span> : null}
            </p>
            <pre className="mt-1 whitespace-pre-wrap break-all rounded-md bg-canvas/60 p-2 font-mono text-[12px] text-ink-dim">
              {JSON.stringify(j.safeClaims, null, 2)}
            </pre>
            {Object.entries(j.safeClaims)
              .filter(([k, v]) => TIME_CLAIMS.has(k) && typeof v === "number")
              .map(([k, v]) => (
                <p key={k} className="mt-1 font-mono text-[12px] text-ink-dim">
                  {k}: {String(v)} → {isoOf(v as number) ?? "invalid date"}
                </p>
              ))}
            {j.withheldClaimNames.length > 0 && (
              <p className="mt-1 text-xs text-ink-faint">Other claims present (values withheld): {j.withheldClaimNames.join(", ")}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
