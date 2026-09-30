export function formatJsonPath(base: string, key: string | number): string {
  if (typeof key === "number") return `${base}[${key}]`;
  const isIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
  return isIdentifier ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}
