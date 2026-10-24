// Shared result type for pure logic (src/core/**, src/lib/debugkit/**).
// Pure functions never throw on user input; they return a Result instead.

export interface ResultError {
  /** Plain-language message for the UI, e.g. "Unexpected comma". */
  message: string;
  /** 1-based line of the problem in the input, when known. */
  line?: number;
  /** 1-based column of the problem in the input, when known. */
  column?: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ResultError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(message: string, line?: number, column?: number): Result<T> {
  const error: ResultError = { message };
  if (line !== undefined) error.line = line;
  if (column !== undefined) error.column = column;
  return { ok: false, error };
}

/** Converts a 0-based character offset into 1-based line/column. */
export function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastNl = i;
    }
  }
  return { line, column: clamped - lastNl };
}
