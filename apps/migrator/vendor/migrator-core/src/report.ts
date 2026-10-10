/**
 * The migration report: every deviation from the source, recorded, never silent.
 *
 * <h2>Why a report instead of exceptions</h2>
 *
 * A converter that stops at the first unknown field teaches packs one error per run. This one
 * reads the whole book, records every loss with its source path (and line where the parser
 * tracked one), and fails the run at the end — unless the caller passes `allowLoss`, which
 * downgrades losses to warnings. `strict` mode goes further: any warning fails too. Either way
 * the report is the product beside the tree: written to the UI, downloaded as JSON + Markdown,
 * and stored in the output as `_migrator/report.json`.
 *
 * Deterministic: entries sort by path, line, then code, so the same input writes the same
 * report byte for byte.
 */

export type Severity = "error" | "warning" | "note";

export interface ReportEntry {
  readonly severity: Severity;
  /** Machine key (`unmapped-field`, `clamped-size`, `synthesised-title`, …). */
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly line?: number;
  readonly key?: string;
  /** JSON-safe detail; bigints arrive as numbers where safe, decimal strings elsewhere. */
  readonly value?: unknown;
}

interface EntryInput {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly line?: number;
  readonly key?: string;
  readonly value?: unknown;
}

export class Report {
  private readonly entries: Array<ReportEntry> = [];

  error(input: EntryInput): void {
    this.entries.push({ severity: "error", ...input, value: jsonSafe(input.value) });
  }

  warn(input: EntryInput): void {
    this.entries.push({ severity: "warning", ...input, value: jsonSafe(input.value) });
  }

  note(input: EntryInput): void {
    this.entries.push({ severity: "note", ...input, value: jsonSafe(input.value) });
  }

  /** True once any error lands: the run must stop before it writes. */
  get failed(): boolean {
    return this.entries.some((entry) => entry.severity === "error");
  }

  get errorCount(): number {
    return this.count("error");
  }

  get warningCount(): number {
    return this.count("warning");
  }

  get noteCount(): number {
    return this.count("note");
  }

  get size(): number {
    return this.entries.length;
  }

  private count(severity: Severity): number {
    let found = 0;
    for (const entry of this.entries) {
      if (entry.severity === severity) {
        found++;
      }
    }
    return found;
  }

  /** Entries in report order: severity first, then path, line, code — stable across runs. */
  sorted(): ReadonlyArray<ReportEntry> {
    const rank: Record<Severity, number> = { error: 0, warning: 1, note: 2 };
    return [...this.entries].sort((a, b) => {
      if (rank[a.severity] !== rank[b.severity]) {
        return rank[a.severity] - rank[b.severity];
      }
      const pathA = a.path ?? "";
      const pathB = b.path ?? "";
      if (pathA !== pathB) {
        return pathA < pathB ? -1 : 1;
      }
      const lineA = a.line ?? 0;
      const lineB = b.line ?? 0;
      if (lineA !== lineB) {
        return lineA - lineB;
      }
      return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    });
  }

  toJson(): { entries: ReadonlyArray<ReportEntry> } {
    return { entries: this.sorted() };
  }
}

/**
 * The report as Markdown: counts, then entries grouped by code with file and line.
 * Shared by the CLI's `report.md` and the web shell's download — one renderer, same bytes.
 */
export function reportMarkdown(report: Report): string {
  const lines: Array<string> = [];
  lines.push("# Migration report");
  lines.push("");
  lines.push(
    `${report.errorCount} error${report.errorCount === 1 ? "" : "s"}, ` +
      `${report.warningCount} warning${report.warningCount === 1 ? "" : "s"}, ` +
      `${report.noteCount} note${report.noteCount === 1 ? "" : "s"}.`,
  );
  const byCode = new Map<string, Array<ReportEntry>>();
  for (const entry of report.sorted()) {
    const list = byCode.get(entry.code) ?? [];
    list.push(entry);
    byCode.set(entry.code, list);
  }
  for (const [code, entries] of [...byCode.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const first = entries[0] as ReportEntry;
    lines.push("");
    lines.push(`## ${code} (${first.severity}, ×${entries.length})`);
    for (const entry of entries) {
      const where = entry.path ?? "";
      const line = entry.line !== undefined && entry.line > 0 ? `:${entry.line}` : "";
      lines.push(`- ${where}${line} — ${entry.message}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) &&
      value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(jsonSafe);
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = jsonSafe(child);
    }
    return out;
  }
  return value;
}
