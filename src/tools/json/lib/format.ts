export function formatJson(value: unknown, indent = 2): string {
  return JSON.stringify(value, null, indent);
}

export function minifyJson(value: unknown): string {
  return JSON.stringify(value);
}

export function byteSize(str: string): number {
  return new TextEncoder().encode(str).length;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function countNodes(value: unknown): number {
  if (Array.isArray(value)) return 1 + value.reduce((acc: number, v) => acc + countNodes(v), 0);
  if (value !== null && typeof value === "object") {
    return 1 + Object.values(value as Record<string, unknown>).reduce((acc: number, v) => acc + countNodes(v), 0);
  }
  return 1;
}

export function maxDepth(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length === 0 ? 1 : 1 + Math.max(...value.map(maxDepth));
  }
  if (value !== null && typeof value === "object") {
    const vals = Object.values(value as Record<string, unknown>);
    return vals.length === 0 ? 1 : 1 + Math.max(...vals.map(maxDepth));
  }
  return 0;
}
