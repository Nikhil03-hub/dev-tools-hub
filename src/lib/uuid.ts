// UUID generation — pure logic, no UI. `crypto.randomUUID()` already
// produces a correct, cryptographically-random RFC 4122 v4 UUID natively;
// the only thing this module adds is the two cosmetic format options
// (case, hyphens) and batch generation.

export interface UuidFormatOptions {
  uppercase: boolean;
  hyphens: boolean;
}

export function formatUuid(raw: string, options: UuidFormatOptions): string {
  const body = options.hyphens ? raw : raw.replace(/-/g, "");
  return options.uppercase ? body.toUpperCase() : body;
}

export function generateUuid(options: UuidFormatOptions): string {
  return formatUuid(crypto.randomUUID(), options);
}

export function generateUuidBatch(count: number, options: UuidFormatOptions): string[] {
  return Array.from({ length: count }, () => generateUuid(options));
}
