// A JSON parser used only for DIAGNOSTICS. The happy path always uses the
// native JSON.parse (fast, spec-correct). This scanner exists purely to
// answer one question well: when JSON.parse throws, WHERE exactly is the
// problem and WHAT is a human likely to have done wrong — independent of
// which browser's error-message wording produced the failure.

export interface JsonSyntaxError {
  message: string;
  index: number; // absolute character offset into the source
  line: number; // 1-based
  column: number; // 1-based
  length: number; // how many characters to underline, minimum 1
}

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: JsonSyntaxError };

export function parseJsonWithDiagnostics(input: string): ParseResult {
  try {
    const value = JSON.parse(input);
    return { ok: true, value };
  } catch {
    return { ok: false, error: diagnose(input) };
  }
}

export function indexToLineCol(input: string, index: number): { line: number; column: number } {
  let line = 1;
  let col = 1;
  const stop = Math.min(index, input.length);
  for (let i = 0; i < stop; i++) {
    if (input.charCodeAt(i) === 10 /* \n */) {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, column: col };
}

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);

class Scanner {
  private i = 0;
  constructor(private s: string) {}

  private err(message: string, at?: number, length = 1): never {
    const index = at ?? this.i;
    const { line, column } = indexToLineCol(this.s, index);
    throw { message, index, line, column, length } satisfies JsonSyntaxError;
  }

  private eof(): boolean {
    return this.i >= this.s.length;
  }

  private peek(): string {
    return this.s[this.i];
  }

  private skipWs() {
    while (!this.eof() && WHITESPACE.has(this.peek())) this.i++;
  }

  private skipWsAndFlagIllegal() {
    // Catches the most common "not actually JSON" pastes: JS-style comments.
    while (!this.eof()) {
      const c = this.peek();
      if (WHITESPACE.has(c)) {
        this.i++;
        continue;
      }
      if (c === "/" && this.s[this.i + 1] === "/") {
        this.err(
          "Comments are not valid in JSON (found `//`). Remove it — JSON has no comment syntax.",
          this.i,
          2
        );
      }
      if (c === "/" && this.s[this.i + 1] === "*") {
        this.err(
          "Comments are not valid in JSON (found `/* */`). Remove it — JSON has no comment syntax.",
          this.i,
          2
        );
      }
      break;
    }
  }

  parseDocument(): unknown {
    this.skipWsAndFlagIllegal();
    if (this.eof()) {
      this.err("The input is empty — there's no JSON to parse.", 0, 1);
    }
    const value = this.parseValue();
    this.skipWsAndFlagIllegal();
    if (!this.eof()) {
      const rest = this.s.slice(this.i).trimStart();
      const looksLikeAnotherValue = /^[{[\"]/.test(rest) || /^-?\d/.test(rest) || /^(true|false|null)/.test(rest);
      const hint = looksLikeAnotherValue
        ? " This looks like more than one JSON value (e.g. JSON Lines / NDJSON, or two objects pasted together). JSON Workbench expects exactly one JSON document."
        : "";
      this.err(`Unexpected extra content after the JSON value.${hint}`, this.i);
    }
    return value;
  }

  private parseValue(): unknown {
    this.skipWsAndFlagIllegal();
    if (this.eof()) this.err("Unexpected end of input — a value was expected here.");
    const c = this.peek();
    if (c === "{") return this.parseObject();
    if (c === "[") return this.parseArray();
    if (c === '"') return this.parseString();
    if (c === "-" || (c >= "0" && c <= "9")) return this.parseNumber();
    if (this.s.startsWith("true", this.i)) return this.parseLiteral("true", true);
    if (this.s.startsWith("false", this.i)) return this.parseLiteral("false", false);
    if (this.s.startsWith("null", this.i)) return this.parseLiteral("null", null);
    if (this.s.startsWith("undefined", this.i)) {
      this.err("`undefined` is not valid JSON — use `null` instead.", this.i, 9);
    }
    if (this.s.startsWith("NaN", this.i) || this.s.startsWith("Infinity", this.i)) {
      this.err("`NaN` and `Infinity` are not valid JSON numbers.", this.i);
    }
    if (c === "'") {
      this.err("Strings must use double quotes (\"...\"), not single quotes.", this.i);
    }
    this.err(`Unexpected token '${c}'.`, this.i);
  }

  private parseLiteral<T>(text: string, value: T): T {
    this.i += text.length;
    return value;
  }

  private parseObject(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    const start = this.i;
    this.i++; // consume '{'
    this.skipWsAndFlagIllegal();
    if (!this.eof() && this.peek() === "}") {
      this.i++;
      return obj;
    }
    for (;;) {
      this.skipWsAndFlagIllegal();
      if (this.eof()) this.err("Unexpected end of input inside an object — missing a closing `}`.", start, 1);
      if (this.peek() === "}") {
        this.err(
          "Trailing comma is not allowed before `}`. Remove the comma after the last property.",
          this.i
        );
      }
      if (this.peek() !== '"') {
        if (this.peek() === "'") {
          this.err("Object keys must be double-quoted strings, not single-quoted.", this.i);
        }
        if (/[A-Za-z_$]/.test(this.peek())) {
          this.err("Object keys must be double-quoted strings (e.g. \"key\": …).", this.i);
        }
        this.err(`Expected a double-quoted property name, found '${this.peek()}'.`, this.i);
      }
      this.parseString();
      this.skipWsAndFlagIllegal();
      if (this.eof() || this.peek() !== ":") {
        this.err("Expected `:` after the property name.", this.i);
      }
      this.i++; // consume ':'
      this.parseValue();
      this.skipWsAndFlagIllegal();
      if (this.eof()) this.err("Unexpected end of input inside an object — missing a closing `}`.", start, 1);
      if (this.peek() === ",") {
        this.i++;
        continue;
      }
      if (this.peek() === "}") {
        this.i++;
        return obj;
      }
      this.err("Expected `,` or `}` after a property value.", this.i);
    }
  }

  private parseArray(): unknown[] {
    const arr: unknown[] = [];
    const start = this.i;
    this.i++; // consume '['
    this.skipWsAndFlagIllegal();
    if (!this.eof() && this.peek() === "]") {
      this.i++;
      return arr;
    }
    for (;;) {
      this.skipWsAndFlagIllegal();
      if (this.eof()) this.err("Unexpected end of input inside an array — missing a closing `]`.", start, 1);
      if (this.peek() === "]") {
        this.err("Trailing comma is not allowed before `]`. Remove the comma after the last item.", this.i);
      }
      this.parseValue();
      this.skipWsAndFlagIllegal();
      if (this.eof()) this.err("Unexpected end of input inside an array — missing a closing `]`.", start, 1);
      if (this.peek() === ",") {
        this.i++;
        continue;
      }
      if (this.peek() === "]") {
        this.i++;
        return arr;
      }
      this.err("Expected `,` or `]` after an array item.", this.i);
    }
  }

  private parseString(): string {
    const start = this.i;
    this.i++; // consume opening quote
    let out = "";
    while (true) {
      if (this.eof()) this.err("Unterminated string — missing a closing `\"`.", start, this.i - start);
      const c = this.s[this.i];
      const code = c.charCodeAt(0);
      if (c === '"') {
        this.i++;
        return out;
      }
      if (code < 0x20) {
        this.err(
          `Control character in string literal (code ${code}). Escape it, e.g. \\n or \\t.`,
          this.i,
          1
        );
      }
      if (c === "\\") {
        const next = this.s[this.i + 1];
        if (next === undefined) this.err("Unterminated escape sequence at end of input.", this.i, 1);
        if (next === "u") {
          const hex = this.s.slice(this.i + 2, this.i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            this.err("Invalid unicode escape — \\u must be followed by 4 hex digits.", this.i, 6);
          }
          out += String.fromCharCode(parseInt(hex, 16));
          this.i += 6;
          continue;
        }
        if ('"\\/bfnrt'.includes(next)) {
          out += JSON.parse(`"\\${next}"`);
          this.i += 2;
          continue;
        }
        this.err(`Invalid escape sequence '\\${next}'.`, this.i, 2);
      }
      out += c;
      this.i++;
    }
  }

  private parseNumber(): number {
    const start = this.i;
    if (this.peek() === "-") this.i++;
    if (this.eof() || !/[0-9]/.test(this.peek())) {
      this.err("Invalid number — expected a digit after '-'.", start);
    }
    if (this.peek() === "0" && /[0-9]/.test(this.s[this.i + 1] ?? "")) {
      this.err("Numbers cannot have leading zeros (e.g. use 0.5, not 05).", start);
    }
    while (!this.eof() && /[0-9]/.test(this.peek())) this.i++;
    if (this.peek() === ".") {
      this.i++;
      if (!/[0-9]/.test(this.peek() ?? "")) this.err("Invalid number — expected a digit after '.'.", this.i);
      while (!this.eof() && /[0-9]/.test(this.peek())) this.i++;
    }
    if (this.peek() === "e" || this.peek() === "E") {
      this.i++;
      if (this.peek() === "+" || this.peek() === "-") this.i++;
      if (!/[0-9]/.test(this.peek() ?? "")) this.err("Invalid number — expected a digit in the exponent.", this.i);
      while (!this.eof() && /[0-9]/.test(this.peek())) this.i++;
    }
    return Number(this.s.slice(start, this.i));
  }
}

function diagnose(input: string): JsonSyntaxError {
  try {
    new Scanner(input).parseDocument();
    // The hand-rolled scanner agrees the document is valid, but native
    // JSON.parse disagreed. Extremely unlikely; fall back to something
    // still useful rather than crash the app.
    return {
      message: "This JSON could not be parsed for an unspecified reason. Double-check brackets and quotes.",
      index: 0,
      line: 1,
      column: 1,
      length: 1,
    };
  } catch (e) {
    return e as JsonSyntaxError;
  }
}
