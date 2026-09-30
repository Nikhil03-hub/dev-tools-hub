// Infers TypeScript interfaces from a JSON value. The root value is always
// sampled fully: when it's an array, every element's shape is merged (a
// field missing from some elements becomes optional; a field whose type
// varies becomes a union) rather than just reading element [0], which is
// the most common way a naive "paste one example" converter gets nested
// API-response arrays wrong.

type PrimName = "string" | "number" | "boolean" | "null";

type Shape =
  | { kind: "prim"; name: PrimName }
  | { kind: "unknown" }
  | { kind: "array"; of: Shape }
  | { kind: "object"; fields: Map<string, { shape: Shape; optional: boolean }> }
  | { kind: "union"; of: Shape[] };

function inferShape(value: unknown): Shape {
  if (value === null) return { kind: "prim", name: "null" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: "array", of: { kind: "unknown" } };
    return { kind: "array", of: mergeShapes(value.map(inferShape)) };
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const fields = new Map<string, { shape: Shape; optional: boolean }>();
    for (const k of Object.keys(obj)) fields.set(k, { shape: inferShape(obj[k]), optional: false });
    return { kind: "object", fields };
  }
  if (typeof value === "string") return { kind: "prim", name: "string" };
  if (typeof value === "number") return { kind: "prim", name: "number" };
  if (typeof value === "boolean") return { kind: "prim", name: "boolean" };
  return { kind: "unknown" };
}

function shapeSignature(s: Shape): string {
  switch (s.kind) {
    case "prim":
      return `p:${s.name}`;
    case "unknown":
      return "u";
    case "array":
      return `a:${shapeSignature(s.of)}`;
    case "object": {
      const parts = Array.from(s.fields.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}${v.optional ? "?" : ""}:${shapeSignature(v.shape)}`);
      return `o:{${parts.join(",")}}`;
    }
    case "union":
      return `un:[${s.of.map(shapeSignature).sort().join("|")}]`;
  }
}

function flattenUnion(s: Shape): Shape[] {
  return s.kind === "union" ? s.of : [s];
}

function dedupeBySignature(shapes: Shape[]): Shape[] {
  const seen = new Map<string, Shape>();
  for (const s of shapes) {
    const sig = shapeSignature(s);
    if (!seen.has(sig)) seen.set(sig, s);
  }
  return Array.from(seen.values());
}

function mergeTwoShapes(a: Shape, b: Shape): Shape {
  if (shapeSignature(a) === shapeSignature(b)) return a;
  if (a.kind === "unknown") return b;
  if (b.kind === "unknown") return a;
  if (a.kind === "object" && b.kind === "object") {
    const keys = new Set([...a.fields.keys(), ...b.fields.keys()]);
    const fields = new Map<string, { shape: Shape; optional: boolean }>();
    for (const k of keys) {
      const af = a.fields.get(k);
      const bf = b.fields.get(k);
      if (af && bf) fields.set(k, { shape: mergeTwoShapes(af.shape, bf.shape), optional: af.optional || bf.optional });
      else if (af) fields.set(k, { shape: af.shape, optional: true });
      else if (bf) fields.set(k, { shape: bf.shape, optional: true });
    }
    return { kind: "object", fields };
  }
  if (a.kind === "array" && b.kind === "array") {
    return { kind: "array", of: mergeTwoShapes(a.of, b.of) };
  }
  const options = dedupeBySignature([...flattenUnion(a), ...flattenUnion(b)]);
  return options.length === 1 ? options[0] : { kind: "union", of: options };
}

function mergeShapes(shapes: Shape[]): Shape {
  return shapes.reduce((acc, s) => mergeTwoShapes(acc, s));
}

function isValidIdentifier(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function toPascalCase(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9]+/g, " ").trim();
  if (!cleaned) return "Field";
  return cleaned
    .split(/\s+/)
    .map((w) => (/^[0-9]/.test(w) ? `_${w}` : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}

function singularize(pascalName: string): string {
  if (/ies$/i.test(pascalName)) return pascalName.replace(/ies$/i, "y");
  if (/(ses|xes|zes|ches|shes)$/i.test(pascalName)) return pascalName.replace(/es$/i, "");
  if (/s$/i.test(pascalName) && !/ss$/i.test(pascalName)) return pascalName.replace(/s$/i, "");
  return `${pascalName}Item`;
}

export function jsonToTypeScript(value: unknown, rootName = "Root"): string {
  const rootShape = inferShape(value);

  const nameOf = new Map<Shape, string>();
  const signatureToName = new Map<string, string>();
  const takenNames = new Set<string>();
  const order: Shape[] = [];

  function assignNames(shape: Shape, suggested: string) {
    if (shape.kind === "object") {
      const sig = shapeSignature(shape);
      const existing = signatureToName.get(sig);
      if (existing) {
        nameOf.set(shape, existing);
        return;
      }
      let name = suggested || "Field";
      let n = 2;
      while (takenNames.has(name)) name = `${suggested}${n++}`;
      takenNames.add(name);
      signatureToName.set(sig, name);
      nameOf.set(shape, name);
      order.push(shape);
      for (const [key, field] of shape.fields) {
        assignNames(field.shape, toPascalCase(key));
      }
    } else if (shape.kind === "array") {
      assignNames(shape.of, singularize(suggested));
    } else if (shape.kind === "union") {
      for (const s of shape.of) {
        if (s.kind === "object" || s.kind === "array") assignNames(s, suggested);
      }
    }
  }

  assignNames(rootShape, rootName);

  function typeRef(shape: Shape): string {
    switch (shape.kind) {
      case "prim":
        return shape.name;
      case "unknown":
        return "unknown";
      case "object":
        return nameOf.get(shape) ?? "unknown";
      case "array": {
        const inner = typeRef(shape.of);
        return shape.of.kind === "union" ? `(${inner})[]` : `${inner}[]`;
      }
      case "union":
        return shape.of.map(typeRef).join(" | ");
    }
  }

  function renderBody(shape: Extract<Shape, { kind: "object" }>): string {
    const entries = Array.from(shape.fields.entries());
    if (entries.length === 0) return "";
    return entries
      .map(([key, field]) => {
        const propName = isValidIdentifier(key) ? key : JSON.stringify(key);
        return `  ${propName}${field.optional ? "?" : ""}: ${typeRef(field.shape)};`;
      })
      .join("\n");
  }

  const header = [
    "// Generated by JSON Workbench from the JSON you provided.",
    "// Types are inferred from the actual data: a field missing from some",
    "// array items becomes optional, and a field whose type varies becomes",
    "// a union. Re-check edge cases your sample didn't include.",
  ].join("\n");

  const blocks: string[] = [];

  if (rootShape.kind !== "object") {
    blocks.push(`export type ${rootName} = ${typeRef(rootShape)};`);
  }

  for (const shape of order) {
    const obj = shape as Extract<Shape, { kind: "object" }>;
    const name = nameOf.get(shape)!;
    const body = renderBody(obj);
    blocks.push(body ? `export interface ${name} {\n${body}\n}` : `export interface ${name} {}`);
  }

  return `${header}\n\n${blocks.join("\n\n")}\n`;
}
