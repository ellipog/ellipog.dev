/**
 * FTB's SNBT dialect, read exactly as the writer writes it.
 *
 * <h2>Why a dedicated reader instead of JSON.parse</h2>
 *
 * FTB Quests 1.21.1 quest books are not JSON: compounds hold `key: value` pairs separated by
 * whitespace and newlines with **commas optional** (`rewards: [ {...} {...} ]`), numbers carry
 * type suffixes (`1b`, `2s`, `3L`, `4.0f`, `5.0d`) alongside bare ints/doubles, booleans spell
 * as `true`/`false` and as `1b`/`0b`, keys and strings go quoted or unquoted, text escapes with
 * backslashes, and int-arrays arrive vanilla-style (`position: [I; -1000000000 1 -1000000000 ]`).
 * A general SNBT library that refuses any of this refuses real packs, so this reader accepts
 * the dialect the census proved (`plan-config-migrator.md` P1) and nothing less.
 *
 * <h2>Why integers are bigints</h2>
 *
 * A reward table id arrives as a decimal int64 (`table_id: 5196609362437981520L`), which is past
 * `Number.MAX_SAFE_INTEGER`. Parsing it into a `number` would silently corrupt the id before the
 * remap table ever sees it. Every integral literal therefore parses to a `bigint`, exactly; the
 * mapping layer converts to `number` at the point of use, where the range check lives beside the
 * field that owns it.
 *
 * <h2>Why compounds keep every entry</h2>
 *
 * A file that writes one key twice means its last line — but a converter that silently keeps the
 * last line cannot tell the report which line it ignored. Compounds keep every `[key, node]` pair
 * in source order plus each key's every line; {@link snbtGet} reads the last, and
 * {@link snbtDuplicates} names what the file said twice.
 *
 * Pure: no I/O, no clock, no randomness. Same text in, same tree out, byte for byte.
 */

/** A parsed value and the 1-based line it starts on. */
export type SnbtNode =
  | {
      readonly kind: "compound";
      /** Every entry in source order; a repeated key appears once per writing. */
      readonly entries: ReadonlyArray<readonly [string, SnbtNode]>;
      /** Every line each key was written on, in order. */
      readonly keyLines: ReadonlyMap<string, ReadonlyArray<number>>;
      readonly line: number;
    }
  | {
      readonly kind: "list";
      readonly items: ReadonlyArray<SnbtNode>;
      /** Vanilla typed-array marker (`[I;`, `[L;`, `[B;`), or null for a plain list. */
      readonly typed: "B" | "I" | "L" | null;
      readonly line: number;
    }
  | { readonly kind: "string"; readonly value: string; readonly raw: string; readonly line: number }
  | { readonly kind: "boolean"; readonly value: boolean; readonly raw: string; readonly line: number }
  | {
      readonly kind: "byte" | "short" | "int" | "long";
      /** Exact integral value — never rounded, never clamped. */
      readonly value: bigint;
      readonly raw: string;
      readonly line: number;
    }
  | {
      readonly kind: "float" | "double";
      readonly value: number;
      readonly raw: string;
      readonly line: number;
    };

/** A parse failure naming its file and line, so the report can point at it. */
export class SnbtError extends Error {
  readonly file: string;
  readonly line: number;

  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = "SnbtError";
    this.file = file;
    this.line = line;
  }
}

const WS = new Set([" ", "\t", "\r", "\n"]);
// Sticky (not `^`-anchored: `^` means offset zero even with `lastIndex` set, which would refuse
// every key past the first byte).
const KEY_PATTERN = /[A-Za-z0-9_.+\-]+/y;
const NUMERIC_PATTERN = /^-?\d+(\.\d+)?([eE][+-]?\d+)?[bslfdBSLFD]?$/;
const TYPED_ARRAY_PATTERN = /[BIL];/y;

/** Parse one SNBT document. Throws {@link SnbtError} naming the first thing it cannot read. */
export function parseSnbt(text: string, file = "<input>"): SnbtNode {
  return new SnbtParser(text, file).document();
}

export class SnbtParser {
  private readonly text: string;
  private readonly file: string;
  private readonly lineStarts: ReadonlyArray<number>;
  private pos = 0;

  constructor(text: string, file = "<input>") {
    this.text = text;
    this.file = file;
    const starts: Array<number> = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") {
        starts.push(i + 1);
      }
    }
    this.lineStarts = starts;
  }

  /** The whole document, with trailing prose after the value refused, not ignored. */
  document(): SnbtNode {
    const node = this.value("a value");
    this.whitespace();
    if (this.pos < this.text.length) {
      throw this.fail(`unexpected trailing ${describeChar(this.peek())} after the document`);
    }
    return node;
  }

  private fail(message: string): SnbtError {
    return new SnbtError(this.file, this.lineOf(this.pos), message);
  }

  private lineOf(offset: number): number {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      const start = this.lineStarts[mid];
      if (start === undefined || start > offset) {
        high = mid - 1;
      } else {
        low = mid;
      }
    }
    return low + 1;
  }

  private peek(): string {
    this.whitespace();
    return this.pos < this.text.length ? (this.text[this.pos] as string) : "";
  }

  private whitespace(): void {
    while (this.pos < this.text.length && WS.has(this.text[this.pos] as string)) {
      this.pos++;
    }
  }

  private value(what: string): SnbtNode {
    const line = this.lineOf(this.pos);
    const open = this.peek();
    if (open === "{") {
      return this.compound(line);
    }
    if (open === "[") {
      return this.list(line);
    }
    if (open === '"') {
      const raw = this.quoted(line);
      return { kind: "string", value: raw.text, raw: raw.raw, line };
    }
    if (open === "") {
      throw this.fail(`expected ${what}, found the end of the file`);
    }
    return this.bare(line, what);
  }

  private compound(line: number): SnbtNode {
    this.pos++; // {
    const entries: Array<readonly [string, SnbtNode]> = [];
    const keyLines = new Map<string, Array<number>>();
    for (;;) {
      const next = this.peek();
      if (next === "") {
        throw this.fail("found the end of the file inside a compound");
      }
      if (next === "}") {
        this.pos++;
        return { kind: "compound", entries, keyLines, line };
      }
      if (next === ",") {
        this.pos++;
        continue;
      }
      const keyLine = this.lineOf(this.pos);
      const key = this.key();
      this.whitespace();
      if (this.text[this.pos] !== ":") {
        throw this.fail(`expected ':' after the key ${JSON.stringify(key)}`);
      }
      this.pos++;
      const child = this.value(`a value for the key ${JSON.stringify(key)}`);
      entries.push([key, child]);
      const lines = keyLines.get(key);
      if (lines === undefined) {
        keyLines.set(key, [keyLine]);
      } else {
        lines.push(keyLine);
      }
    }
  }

  private list(line: number): SnbtNode {
    this.pos++; // [
    this.whitespace();
    let typed: "B" | "I" | "L" | null = null;
    TYPED_ARRAY_PATTERN.lastIndex = this.pos;
    const marker = TYPED_ARRAY_PATTERN.exec(this.text);
    if (marker !== null && marker[0] !== undefined) {
      typed = marker[0][0] as "B" | "I" | "L";
      this.pos += 2;
    }
    const items: Array<SnbtNode> = [];
    for (;;) {
      const next = this.peek();
      if (next === "") {
        throw this.fail("found the end of the file inside a list");
      }
      if (next === "]") {
        this.pos++;
        return { kind: "list", items, typed, line };
      }
      if (next === ",") {
        this.pos++;
        continue;
      }
      items.push(this.value("a list entry"));
    }
  }

  private key(): string {
    const at = this.peek();
    if (at === '"') {
      return this.quoted(this.lineOf(this.pos)).text;
    }
    KEY_PATTERN.lastIndex = this.pos;
    const match = KEY_PATTERN.exec(this.text);
    if (match === null || match[0] === undefined || match[0].length === 0) {
      throw this.fail(`expected a key, found ${describeChar(at)}`);
    }
    this.pos += match[0].length;
    return match[0];
  }

  private quoted(line: number): { text: string; raw: string } {
    const start = this.pos;
    this.pos++; // "
    let out = "";
    for (;;) {
      if (this.pos >= this.text.length) {
        throw new SnbtError(this.file, line, "found the end of the file inside a string");
      }
      const char = this.text[this.pos] as string;
      if (char === '"') {
        this.pos++;
        return { text: out, raw: this.text.slice(start, this.pos) };
      }
      if (char === "\\") {
        const next = this.pos + 1 < this.text.length ? (this.text[this.pos + 1] as string) : "";
        out += readEscape(next, this.text, this.pos, line, this.file);
        this.pos += next === "u" ? 6 : 2;
        continue;
      }
      out += char;
      this.pos++;
    }
  }

  private bare(line: number, what: string): SnbtNode {
    const start = this.pos;
    while (
      this.pos < this.text.length &&
      !WS.has(this.text[this.pos] as string) &&
      this.text[this.pos] !== "," &&
      this.text[this.pos] !== "]" &&
      this.text[this.pos] !== "}"
    ) {
      this.pos++;
    }
    const raw = this.text.slice(start, this.pos);
    if (raw.length === 0) {
      throw this.fail(`expected ${what}, found ${describeChar(this.peek())}`);
    }
    if (raw === "true" || raw === "false") {
      return { kind: "boolean", value: raw === "true", raw, line };
    }
    if (NUMERIC_PATTERN.test(raw)) {
      return readNumeric(raw, line);
    }
    // Anything else is an unquoted string: `minecraft:stone`, `none`, a filter expression.
    return { kind: "string", value: raw, raw, line };
  }
}

function readEscape(next: string, text: string, at: number, line: number, file: string): string {
  switch (next) {
    case "n":
      return "\n";
    case "t":
      return "\t";
    case "r":
      return "\r";
    case "b":
      return "\b";
    case "f":
      return "\f";
    case '"':
      return '"';
    case "\\":
      return "\\";
    case "/":
      return "/";
    case "u": {
      const digits = text.slice(at + 2, at + 6);
      if (/^[0-9a-fA-F]{4}$/.test(digits)) {
        return String.fromCharCode(parseInt(digits, 16));
      }
      throw new SnbtError(file, line, `bad unicode escape ${JSON.stringify(text.slice(at, at + 6))}`);
    }
    default:
      // Lenient where FTB is lenient: an unknown escape reads as the escaped character itself,
      // so `\&` in prose survives the read. A strict reader would refuse real packs here.
      return next;
  }
}

function readNumeric(raw: string, line: number): SnbtNode {
  const suffix = raw[raw.length - 1] as string;
  const hasSuffix = /[bslfdBSLFD]/.test(suffix) && /^-?\d/.test(raw);
  const body = hasSuffix ? raw.slice(0, -1) : raw;
  const lower = hasSuffix ? suffix.toLowerCase() : "";
  if (lower === "f") {
    return { kind: "float", value: Number(body), raw, line };
  }
  if (lower === "d" || body.includes(".") || /[eE]/.test(body)) {
    return { kind: "double", value: Number(body), raw, line };
  }
  const value = parseBigInt(body, raw);
  switch (lower) {
    case "b":
      return { kind: "byte", value, raw, line };
    case "s":
      return { kind: "short", value, raw, line };
    case "l":
      return { kind: "long", value, raw, line };
    default:
      return { kind: "int", value, raw, line };
  }
}

function parseBigInt(body: string, raw: string): bigint {
  try {
    return BigInt(body);
  } catch {
    // Unreachable through NUMERIC_PATTERN, but a partial read must never produce NaN silently.
    throw new Error(`internal: numeric literal ${JSON.stringify(raw)} is not an integer`);
  }
}

function describeChar(char: string): string {
  if (char === "") {
    return "the end of the file";
  }
  return JSON.stringify(char);
}

/** The last writing of `key`, or undefined when the compound never says it. */
export function snbtGet(node: SnbtNode, key: string): SnbtNode | undefined {
  if (node.kind !== "compound") {
    return undefined;
  }
  for (let i = node.entries.length - 1; i >= 0; i--) {
    const entry = node.entries[i];
    if (entry !== undefined && entry[0] === key) {
      return entry[1];
    }
  }
  return undefined;
}

/** Like {@link snbtGet}, but a missing key fails naming what it was for. */
export function snbtRequire(node: SnbtNode, key: string, what: string, file = "<input>"): SnbtNode {
  const found = snbtGet(node, key);
  if (found === undefined) {
    throw new SnbtError(file, node.line, `${what} names no ${JSON.stringify(key)}`);
  }
  return found;
}

/** Keys the compound writes more than once, in first-repeat order. */
export function snbtDuplicates(node: SnbtNode): ReadonlyArray<string> {
  if (node.kind !== "compound") {
    return [];
  }
  const out: Array<string> = [];
  for (const [key, lines] of node.keyLines) {
    if (lines.length > 1) {
      out.push(key);
    }
  }
  return out;
}

/** The node's words, or a failure naming what they were for. */
export function snbtString(node: SnbtNode, what: string, file = "<input>"): string {
  if (node.kind !== "string") {
    throw new SnbtError(file, node.line, `${what} is not text`);
  }
  return node.value;
}

/** An exact integral value. Fractional kinds fail rather than round. */
export function snbtBigInt(node: SnbtNode, what: string, file = "<input>"): bigint {
  if (
    node.kind !== "byte" &&
    node.kind !== "short" &&
    node.kind !== "int" &&
    node.kind !== "long"
  ) {
    throw new SnbtError(file, node.line, `${what} is not a whole number`);
  }
  return node.value;
}

/** An integral value as a `number`, failing past `Number.MAX_SAFE_INTEGER`. */
export function snbtInt(node: SnbtNode, what: string, file = "<input>"): number {
  const value = snbtBigInt(node, what, file);
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new SnbtError(file, node.line, `${what} does not fit in a number: ${value}`);
  }
  return Number(value);
}

/** A `true`/`false`, or a `1b`/`0b` byte. Any other byte fails naming the field. */
export function snbtBoolean(node: SnbtNode, what: string, file = "<input>"): boolean {
  if (node.kind === "boolean") {
    return node.value;
  }
  if (node.kind === "byte" && (node.value === 0n || node.value === 1n)) {
    return node.value === 1n;
  }
  throw new SnbtError(file, node.line, `${what} is not true or false`);
}

/** A fractional value; integral literals read as their exact whole count. */
export function snbtNumber(node: SnbtNode, what: string, file = "<input>"): number {
  if (node.kind === "float" || node.kind === "double") {
    return node.value;
  }
  return snbtInt(node, what, file);
}

/** A stable JSON form of a tree: bigints survive the trip, order survives the read. */
export function snbtToJson(node: SnbtNode): unknown {
  switch (node.kind) {
    case "compound": {
      const out: Record<string, unknown> = {};
      for (const [key, child] of node.entries) {
        out[key] = snbtToJson(child);
      }
      return out;
    }
    case "list":
      return node.items.map(snbtToJson);
    case "string":
      return node.value;
    case "boolean":
      return node.value;
    case "byte":
    case "short":
    case "int":
    case "long":
      return node.value <= BigInt(Number.MAX_SAFE_INTEGER) &&
        node.value >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(node.value)
        : node.raw;
    case "float":
    case "double":
      return node.value;
  }
}
