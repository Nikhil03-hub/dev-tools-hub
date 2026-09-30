import Ajv, { type ErrorObject } from "ajv";

export interface SchemaIssue {
  path: string;
  message: string;
}

export interface SchemaCheckResult {
  ok: boolean;
  issues: SchemaIssue[];
  compileError?: string;
}

function formatError(e: ErrorObject): SchemaIssue {
  const path = e.instancePath && e.instancePath.length > 0 ? `$${e.instancePath.replace(/\//g, ".")}` : "$ (root)";
  let message = e.message ?? "is invalid";
  const params = e.params as Record<string, unknown> | undefined;
  if (params) {
    if ("allowedValues" in params) message += ` (${JSON.stringify(params.allowedValues)})`;
    else if ("additionalProperty" in params) message += `: "${params.additionalProperty}"`;
    else if ("missingProperty" in params) message += `: "${params.missingProperty}"`;
  }
  return { path: path.replace(/\.\[/g, "["), message };
}

export function checkSchema(data: unknown, schema: unknown): SchemaCheckResult {
  let ajv: Ajv;
  try {
    ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
  } catch (e) {
    return { ok: false, issues: [], compileError: `Could not initialize the validator: ${(e as Error).message}` };
  }

  let validate;
  try {
    validate = ajv.compile(schema as object);
  } catch (e) {
    return { ok: false, issues: [], compileError: (e as Error).message };
  }

  try {
    const valid = validate(data);
    if (valid) return { ok: true, issues: [] };
    return { ok: false, issues: (validate.errors ?? []).map(formatError) };
  } catch (e) {
    return { ok: false, issues: [], compileError: (e as Error).message };
  }
}
