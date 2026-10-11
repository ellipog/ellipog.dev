'use client';

/**
 * The migrator, one page in six stages: intake → detect → options → run →
 * result → export. Conversion itself is lib/pipeline.ts (core in a Worker);
 * this file is state, progress and inspection only.
 *
 * Deliberately no line-diff view: SNBT→JSON is a format change, so a textual
 * diff across the boundary would compare spellings rather than meaning. The
 * tree browser shows every emitted file's kind and full text instead, and
 * passthrough files are byte-identical by construction.
 */
import { Fragment, useRef, useState } from 'react';

import type { ReportEntry, VfsFile } from '@/lib/core';
import { alreadyMigrated, detectBooks } from '@/lib/detect';
import type { Detection } from '@/lib/detect';
import {
  filesFromDataTransfer,
  filesFromDirectoryPicker,
  filesFromFileList,
} from '@/lib/vfs-adapter';
import type { SkippedFile } from '@/lib/vfs-adapter';
import { runPipeline } from '@/lib/worker-client';
import { DEFAULT_OPTIONS } from '@/lib/pipeline';
import type { PipelineOptions, PipelineResult, PlacedFile } from '@/lib/pipeline';
import { canSaveToFolder, saveToFolder } from '@/lib/save-folder';
import { filesFromZipBlob, placedToZipBlob } from '@/lib/zip';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function totalBytes(files: ReadonlyArray<VfsFile>): number {
  return files.reduce((sum, f) => sum + f.bytes.length, 0);
}

const FILE_KINDS = ['converted', 'passthrough', 'report'] as const;
type FileKind = (typeof FILE_KINDS)[number];
const FILE_KIND_LABEL: Record<FileKind, string> = {
  converted: 'Converted',
  passthrough: 'Passthrough',
  report: 'Report files',
};
const FILE_KIND_SUB: Record<FileKind, string> = {
  converted: 'the new Tenet tree',
  passthrough: 'your input files, copied over untouched',
  report: 'conversion report + old→new id map',
};

const REPORT_SEVS = ['error', 'warning', 'note'] as const;
type ReportSev = (typeof REPORT_SEVS)[number];
const REPORT_SEV_LABEL: Record<ReportSev, string> = {
  error: 'Errors',
  warning: 'Warnings',
  note: 'Notes',
};

function fileSize(f: PlacedFile): number {
  return f.text !== undefined ? f.text.length : (f.bytes?.length ?? 0);
}

const PREVIEW_LINES = 300;

/** One open file: numbered lines in a sunken drawer, or the binary note. */
function FilePreview({ file }: { file: PlacedFile }) {
  if (file.text === undefined) {
    return (
      <div className="fileview">
        <p className="muted">binary — {fmtBytes(file.bytes?.length ?? 0)} (passes through untouched)</p>
      </div>
    );
  }
  const body = file.text.endsWith('\n') ? file.text.slice(0, -1) : file.text;
  const lines = body.split('\n');
  const shown = lines.slice(0, PREVIEW_LINES);
  return (
    <div className="fileview">
      <div className="fileview-lines">
        {shown.map((line, i) => (
          <div className="fileview-line" key={i}>
            <span className="fileview-no">{i + 1}</span>
            <span className="fileview-code">{line}</span>
          </div>
        ))}
      </div>
      {lines.length > shown.length && (
        <p className="fileview-more">…{lines.length - shown.length} more lines — download the zip for the full file</p>
      )}
    </div>
  );
}

async function sha256(blob: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function MigratorPage() {
  const [files, setFiles] = useState<Array<VfsFile> | null>(null);
  const [skipped, setSkipped] = useState<Array<SkippedFile>>([]);
  const [inputName, setInputName] = useState('');
  const [oversize, setOversize] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [detections, setDetections] = useState<Array<Detection>>([]);
  const [selectedRoot, setSelectedRoot] = useState<string | undefined>(undefined);
  const [opts, setOpts] = useState<PipelineOptions>(DEFAULT_OPTIONS);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ stage: '', done: 0, total: 7 });
  const [log, setLog] = useState<Array<string>>([]);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [scan, setScan] = useState<{ label: string; done: number; total: number | null } | null>(null);
  const scanAt = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState('');
  const [openPaths, setOpenPaths] = useState<ReadonlySet<string>>(new Set());

  function togglePath(path: string): void {
    setOpenPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  const [foldFiles, setFoldFiles] = useState({ converted: true, passthrough: false, report: true });
  const [foldReport, setFoldReport] = useState({ error: true, warning: true, note: false });
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  function takeIntake(incoming: Array<VfsFile>, name: string, tooBig: boolean, leftOut: Array<SkippedFile> = []): void {
    setFiles(incoming);
    setSkipped(leftOut);
    setScan(null);
    setOpts((o) => ({ ...o, force: false }));
    setInputName(name);
    setOversize(tooBig);
    setDetections(detectBooks(incoming));
    setSelectedRoot(undefined);
    setResult(null);
    setRunError(null);
    setVerifyMsg(null);
    setOpenPaths(new Set());
    setLog([]);
    setIntakeError(
      incoming.length === 0 ? 'Nothing readable in that input — try a quest folder or .zip.' : null,
    );
  }

  async function onZipFile(file: File): Promise<void> {
    try {
      const { files: unpacked, skipped: leftOut, oversize: big } = await filesFromZipBlob(
        file,
        (d, t) => reportScan(t === null ? 'Reading zip' : 'Extracting zip', d, t),
      );
      takeIntake(unpacked, file.name.replace(/\.zip$/i, ''), big, leftOut);
    } catch (error) {
      setScan(null);
      setIntakeError(error instanceof Error ? error.message : String(error));
    }
  }

  /** Intake callbacks fire per file; the bar moves at most ~8 times a second. */
  function reportScan(label: string, done: number, total: number | null): void {
    const now = Date.now();
    if (total === null || done < total) {
      if (now - scanAt.current < 120) return;
    }
    scanAt.current = now;
    setScan({ label, done, total });
  }

  async function onDrop(event: React.DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault();
    setDragOver(false);
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length === 1 && dropped[0]?.name.toLowerCase().endsWith('.zip') && dropped[0]) {
      await onZipFile(dropped[0]);
      return;
    }
    try {
      const r = await filesFromDataTransfer(
        event.dataTransfer,
        (d, t) => reportScan('Scanning drop', d, t),
      );
      takeIntake(r.files, 'dropped-folder', false, r.skipped);
    } catch (error) {
      setScan(null);
      setIntakeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function onPicker(): Promise<void> {
    try {
      const { files: picked, name } = await filesFromDirectoryPicker((d, t) =>
        reportScan('Scanning folder', d, t),
      );
      takeIntake(picked, name, false);
    } catch (error) {
      // Cancel is silent. Anything else is either a missing API (friendly already)
      // or the browser refusing the folder — Chrome blocks some locations ("contains
      // system files") with no override, so point at the pickers that always work.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setScan(null);
      setIntakeError(
        error instanceof Error && error.message.startsWith('this browser')
          ? error.message
          : 'That folder can’t be opened with the system picker — the browser refuses some locations. Use Choose folder or a .zip instead.',
      );
    }
  }

  const effectiveRoot =
    selectedRoot ?? detections.find((d) => d.confidence === 'high')?.root ?? detections[0]?.root;

  const migratedReason = files ? alreadyMigrated(files) : null;

  // Locales present in the detected book's lang/ (merged build artefacts excluded,
  // same rule as the core) — shown under the canonical input so the choice is informed.
  const langRoot =
    effectiveRoot === undefined ? null : effectiveRoot === '' ? 'lang' : `${effectiveRoot}/lang`;
  const foundLocales =
    langRoot === null || !files
      ? []
      : [...new Set(
          files.flatMap((f) => {
            if (!f.path.startsWith(`${langRoot}/`) || !f.path.endsWith('.snbt')) return [];
            const base = f.path.slice(langRoot.length + 1, -'.snbt'.length);
            return base.includes('/') || base.endsWith('_merged') ? [] : [base];
          }),
        )].sort();

  async function run(): Promise<void> {
    if (!files || files.length === 0 || running) return;
    setRunning(true);
    setResult(null);
    setRunError(null);
    setVerifyMsg(null);
    setLog([`starting ${PROFILE_LABEL} on ${files.length} files…`]);
    setProgress({ stage: 'detect', done: 0, total: 7 });
    // Geometry scales are intentionally unexposed: the core's measured ×64/×48
    // always apply. The pipeline keeps the override fields for scripts, not UI.
    const effective = { ...opts, coordinateScale: null, sizeScale: null };
    const handle = runPipeline(files, effective, selectedRoot, (stage, done, total) => {
      setProgress({ stage, done, total });
      setLog((lines) => [...lines, `${stage} — ${done}/${total}`]);
    }, skipped);
    cancelRef.current = () => handle.cancel();
    try {
      const res = await handle.done;
      setResult(res);
      setLog((lines) => [
        ...lines,
        res.failed
          ? `failed: ${res.fatal ?? 'see the report'}`
          : `done: ${res.filesOut} files out, ${res.errors} errors, ${res.warnings} warnings, ${res.notes} notes`,
      ]);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
      cancelRef.current = null;
    }
  }

  async function downloadZip(): Promise<void> {
    if (!result || result.failed) return;
    const blob = await placedToZipBlob(result.placed);
    const safe = inputName.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'quests';
    download(blob, `${safe}-migrated.zip`);
  }

  async function verifyDeterminism(): Promise<void> {
    if (!result || !files || result.failed) return;
    setVerifyMsg('re-running…');
    try {
      const second = await runPipeline(files, { ...opts, coordinateScale: null, sizeScale: null }, selectedRoot, () => {}, skipped).done;
      if (second.failed) {
        setVerifyMsg('re-run failed — see the report');
        return;
      }
      const [a, b] = await Promise.all([
        placedToZipBlob(result.placed),
        placedToZipBlob(second.placed),
      ]);
      if (a.size !== b.size) {
        setVerifyMsg(`MISMATCH: ${a.size} vs ${b.size} bytes`);
        return;
      }
      const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
      if (ha !== null && hb !== null) {
        setVerifyMsg(ha === hb ? `byte-identical ✓ (sha256 ${ha.slice(0, 16)}…)` : `MISMATCH: ${ha} vs ${hb}`);
      } else {
        setVerifyMsg(`same size (${fmtBytes(a.size)}) — hash unavailable in this context`);
      }
    } catch (error) {
      setVerifyMsg(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveFolder(): Promise<void> {
    if (!result || result.failed) return;
    try {
      const n = await saveToFolder(result.placed);
      setSavedMsg(`wrote ${n} files`);
    } catch (error) {
      setSavedMsg(error instanceof Error ? error.message : String(error));
    }
  }

  const entries = (result?.reportJson.entries as ReadonlyArray<ReportEntry> | undefined) ?? [];
  const placed = (result && !result.failed ? result.placed : []).filter((f) =>
    filter === '' ? true : f.path.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">ftb quests 1.21.1 → tenet · client-side</p>
        <h1>FTB Quests → Tenet migrator.</h1>
        <p className="sub">
          Drop a quest export, get back a Tenet tree. Parsing and conversion run in this page —{' '}
          <strong>files never leave the browser</strong>.
        </p>
      </section>

      <section className="stage">
        <div className="stage-head">
          <span className="label">1 · Intake</span>
          <span className="faint mono">{files ? `${files.length} files · ${fmtBytes(totalBytes(files))}${skipped.length > 0 ? ` · ${skipped.length} too big, listed not copied` : ''}` : 'nothing loaded'}</span>
        </div>
        <div className="stage-body">
          <div
            className="dropzone"
            data-over={dragOver}
            role="button"
            tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => void onDrop(e)}
            onClick={() => folderRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter') folderRef.current?.click(); }}
          >
            <h2>Drop a quest folder or .zip here</h2>
            <p className="muted">…or pick below. Anything from the quest book up to the whole profile or instance zip works — the book is found where it lives, and files too big to hold (jars, saves) are listed, not copied.</p>
            <div className="btnrow" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="btn" onClick={() => folderRef.current?.click()}>Choose folder</button>
              <button type="button" className="btn" onClick={() => filesRef.current?.click()}>Choose files</button>
              <button type="button" className="btn" onClick={() => zipRef.current?.click()}>Choose zip</button>
              <button type="button" className="btn" onClick={() => void onPicker()}>Browse…</button>
            </div>
          </div>
          {scan && (
            <div>
              <div
                className="prog"
                data-mode={scan.total === null ? 'ind' : undefined}
                role="progressbar"
                aria-label={scan.label}
                aria-valuenow={scan.total === null ? undefined : scan.done}
                aria-valuemax={scan.total ?? undefined}
              >
                <span
                  style={
                    scan.total === null || scan.total === 0
                      ? undefined
                      : { width: `${(scan.done / scan.total) * 100}%` }
                  }
                />
              </div>
              <p className="mono muted" style={{ fontSize: 12 }}>
                {scan.label}… {scan.total === null ? `${scan.done} files so far` : `${scan.done}/${scan.total} files`}
              </p>
            </div>
          )}
          <input
            ref={folderRef}
            type="file"
            hidden
            {...({ webkitdirectory: '' } as Record<string, string>)}
            onChange={(e) => { const l = e.target.files; if (l && l.length > 0) void filesFromFileList(l, (d, t) => reportScan('Scanning folder', d, t)).then((r) => takeIntake(r.files, 'folder', false, r.skipped)).catch((err: unknown) => { setScan(null); setIntakeError(err instanceof Error ? err.message : String(err)); }); e.target.value = ''; }}
          />
          <input
            ref={filesRef}
            type="file"
            hidden
            multiple
            onChange={(e) => { const l = e.target.files; if (l && l.length > 0) void filesFromFileList(l, (d, t) => reportScan('Scanning files', d, t)).then((r) => takeIntake(r.files, 'files', false, r.skipped)).catch((err: unknown) => { setScan(null); setIntakeError(err instanceof Error ? err.message : String(err)); }); e.target.value = ''; }}
          />
          <input
            ref={zipRef}
            type="file"
            hidden
            accept=".zip,application/zip"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onZipFile(f); e.target.value = ''; }}
          />
          {oversize && (
            <p className="muted">Large input (over 512 MB unpacked) — conversion still runs locally, it may take a while.</p>
          )}
          {intakeError && <p style={{ color: 'var(--danger)' }}>{intakeError}</p>}
        </div>
      </section>

      {files && detections.length > 0 && (
        <section className="stage">
          <div className="stage-head">
            <span className="label">2 · Detect</span>
            <span className="faint mono">{detections.length} book{detections.length === 1 ? '' : 's'}</span>
          </div>
          <div className="stage-body">
            {detections.map((d) => (
              <label key={d.root} className="detection">
                <input
                  type="radio"
                  name="root"
                  checked={effectiveRoot === d.root}
                  onChange={() => setSelectedRoot(d.root)}
                />
                <span><strong>{PROFILE_LABEL}</strong></span>
                <span className="pill">{d.confidence}</span>
                <span className="evidence">{d.evidence}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {files && (
        <section className="stage">
          <div className="stage-head">
            <span className="label">3 · Options</span>
            <span className="faint mono">sensible defaults — most packs only need Convert</span>
          </div>
          <div className="stage-body">
            <div className="optgrid">
              <label>
                <span className="label">Canonical locale</span>
                <input type="text" value={opts.canonicalLocale} onChange={(e) => setOpts({ ...opts, canonicalLocale: e.target.value })} />
                {foundLocales.length > 0 && (
                  <span className="help">In this pack: {foundLocales.join(', ')}</span>
                )}
              </label>
              <label>
                <span className="label">Fallback locale</span>
                <input type="text" value={opts.fallbackLocale} placeholder="(pack default)" onChange={(e) => setOpts({ ...opts, fallbackLocale: e.target.value })} />
              </label>
              <label>
                <span className="label">Unknown fields</span>
                <span className="checkline"><input type="checkbox" checked={opts.allowLoss} onChange={(e) => setOpts({ ...opts, allowLoss: e.target.checked })} /> allow loss (unknown keys warn)</span>
                <span className="help">Other packs aren&rsquo;t ATM10: modded or newer FTB fields fail here by default, each named. On to convert anyway with them reported as warnings.</span>
              </label>
              <label>
                <span className="label">Output</span>
                <span className="checkline"><input type="checkbox" checked={opts.keepSource} onChange={(e) => setOpts({ ...opts, keepSource: e.target.checked })} /> keep source subtree</span>
                <span className="help">Keep the original quest files beside the converted tree. Off for a smaller zip.</span>
                <span className="checkline"><input type="checkbox" checked={opts.includeMigrator} onChange={(e) => setOpts({ ...opts, includeMigrator: e.target.checked })} /> include _migrator/</span>
                <span className="help">Adds the conversion report and the old→new id map to the output. Keep on for audits and KubeJS fixes.</span>
              </label>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              Every locale found is emitted as a <span className="mono">lang/</span> overlay; canonical text is
              inlined. Unknown fields fail the run unless allow-loss is on. ATM10 converts with zero errors;
              everything approximated is listed in the report.
            </p>
          </div>
        </section>
      )}

      {files && (
        <section className="stage">
          <div className="stage-head">
            <span className="label">4 · Run</span>
            <span className="faint mono">{progress.stage || 'idle'}</span>
          </div>
          <div className="stage-body">
            {files && detections.length === 0 && (
              <p className="muted">No quest book in this input — an FTB Quests export contains data.snbt.</p>
            )}
            {migratedReason && (
              <div>
                <p style={{ color: 'var(--danger)' }}>Already migrated — input {migratedReason}.</p>
                <span className="checkline"><input type="checkbox" checked={opts.force} onChange={(e) => setOpts({ ...opts, force: e.target.checked })} /> convert anyway (force)</span>
                <span className="help">Re-runs the FTB book inside. Files the new tree replaces are overwritten, not duplicated.</span>
              </div>
            )}
            <div className="toolbar">
              <button type="button" className="btn" data-primary="true" disabled={running || detections.length === 0} onClick={() => void run()}>
                {running ? 'Converting…' : 'Convert'}
              </button>
              {running && (
                <button type="button" className="btn" onClick={() => cancelRef.current?.()}>
                  Cancel
                </button>
              )}
            </div>
            {(running || log.length > 0) && (
              <>
                <div className="prog" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
                  <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <div className="log">{log.join('\n')}</div>
              </>
            )}
            {runError && <p style={{ color: 'var(--danger)' }}>{runError}</p>}
          </div>
        </section>
      )}

      {result && (
        <section className="stage">
          <div className="stage-head">
            <span className="label">5 · Result</span>
            <span className="faint mono">
              {result.failed ? `failed — ${result.fatal ?? 'see report'}` : `${result.filesOut} files out`}
            </span>
          </div>
          <div className="stage-body">
            <div className="counts">
              <span><b>{result.filesIn}</b> in</span>
              <span><b>{result.filesOut}</b> out</span>
              <span><b>{result.errors}</b> errors</span>
              <span><b>{result.warnings}</b> warnings</span>
              <span><b>{result.notes}</b> notes</span>
              {skipped.length > 0 && <span><b>{skipped.length}</b> too big, in report</span>}
            </div>
            {result.evidence && <p className="evidence">{result.evidence} → {result.outputRoot === '' ? '(book root)' : <span className="mono">{result.outputRoot}/</span>}</p>}

            {!result.failed && (
              <>
                <p className="muted" style={{ fontSize: 13 }}>
                  {result.outputRoot === '' ? (
                    <>Next: the zip holds the Tenet book at its root — merge it into <span className="mono">config/tenet/quests/</span> in your instance, then <span className="mono">/tenet reload</span> in game.</>
                  ) : (
                    <>Next: extract the zip over your instance — the book lands at <span className="mono">{result.outputRoot}/</span> — then <span className="mono">/tenet reload</span> in game.</>
                  )}
                </p>
                <div className="toolbar">
                  <button type="button" className="btn" data-primary="true" onClick={() => void downloadZip()}>Download .zip</button>
                  {typeof window !== 'undefined' && canSaveToFolder() && (
                    <button type="button" className="btn" onClick={() => void saveFolder()}>Save to folder…</button>
                  )}
                  <button type="button" className="btn" onClick={() => download(new Blob([JSON.stringify(result.reportJson, null, 2)], { type: 'application/json' }), 'report.json')}>report.json</button>
                  <button type="button" className="btn" onClick={() => download(new Blob([result.reportMd], { type: 'text/markdown' }), 'report.md')}>report.md</button>
                  <button type="button" className="btn" onClick={() => void verifyDeterminism()}>Verify re-run identical</button>
                </div>
                {savedMsg && <p className="muted">{savedMsg}</p>}
                {verifyMsg && <p className="mono" style={{ fontSize: 12.5 }}>{verifyMsg}</p>}

                <div className="toolbar">
                  <input type="text" placeholder="filter files…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                </div>
                {FILE_KINDS.map((kind) => {
                  const rows = placed.filter(
                    (f) =>
                      (filter === '' || f.path.toLowerCase().includes(filter.toLowerCase())) &&
                      f.kind === kind,
                  );
                  if (rows.length === 0) return null;
                  const folded = !foldFiles[kind];
                  const bytes = rows.reduce((sum, f) => sum + fileSize(f), 0);
                  return (
                    <div key={kind}>
                      <button
                        type="button"
                        className="fold-head"
                        aria-expanded={!folded}
                        onClick={() => setFoldFiles({ ...foldFiles, [kind]: folded })}
                      >
                        <span className="fold-title">
                          <span className="fold-caret" aria-hidden>{folded ? '▸' : '▾'}</span>
                          <span className="fold-name">
                            {FILE_KIND_LABEL[kind]}
                            <span className="fold-sub">{FILE_KIND_SUB[kind]}</span>
                          </span>
                        </span>
                        <span className="fold-count">{rows.length} files · {fmtBytes(bytes)}</span>
                      </button>
                      {!folded && (
                        <>
                          <table className="filetable">
                            <thead><tr><th>Path</th><th>Kind</th><th>Size</th></tr></thead>
                            <tbody>
                              {rows.slice(0, 500).map((f) => {
                                const open = openPaths.has(f.path);
                                return (
                                  <Fragment key={f.path}>
                                    <tr
                                      data-sel={open}
                                      onClick={() => togglePath(f.path)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') togglePath(f.path); }}
                                      tabIndex={0}
                                      aria-expanded={open}
                                    >
                                      <td className="mono">{f.path}</td>
                                      <td><span className="pill">{kind}</span></td>
                                      <td className="mono">{fmtBytes(fileSize(f))}</td>
                                    </tr>
                                    {open && (
                                      <tr className="previewrow">
                                        <td colSpan={3}>
                                          <FilePreview file={f} />
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                          {rows.length > 500 && <p className="muted">showing 500 of {rows.length} — narrow the filter.</p>}
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {placed.length > 0 && placed.filter((f) => filter === '' || f.path.toLowerCase().includes(filter.toLowerCase())).length === 0 && (
              <p className="muted">No files match this filter.</p>
            )}
            {REPORT_SEVS.map((sev) => {
              const rows = entries.filter((e) => e.severity === sev);
              if (rows.length === 0) return null;
              const folded = !foldReport[sev];
              return (
                <div key={sev}>
                  <button
                    type="button"
                    className="fold-head"
                    aria-expanded={!folded}
                    onClick={() => setFoldReport({ ...foldReport, [sev]: folded })}
                  >
                    <span className="fold-title">
                      <span className="fold-caret" aria-hidden>{folded ? '▸' : '▾'}</span>
                      {REPORT_SEV_LABEL[sev]}
                    </span>
                    <span className="fold-count">{rows.length}</span>
                  </button>
                  {!folded && (
                    <>
                      <table className="reporttable">
                        <thead><tr><th>Code</th><th>Where</th><th>Message</th></tr></thead>
                        <tbody>
                          {rows.slice(0, 500).map((e, i) => (
                            <tr key={i}>
                              <td className="mono">{e.code}</td>
                              <td className="mono">{e.path ?? ''}{e.line !== undefined && e.line > 0 ? `:${e.line}` : ''}</td>
                              <td>{e.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {rows.length > 500 && <p className="muted">showing 500 of {rows.length} — download report.json for the rest.</p>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="band">
        <div className="band-head">
          <span className="label">Switching from FTB Quests?</span>
          <span className="faint mono"><a href="/ftb-quests-alternative/">Tenet as the alternative →</a></span>
        </div>
        <div className="band-head">
          <span className="label">Surveying questing mods?</span>
          <span className="faint mono"><a href="/minecraft-questing-mods/">every option, compared →</a></span>
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <span className="label">Mapping reference</span>
          <span className="faint mono"><a href="/reference/">every FTB field and its Tenet home →</a></span>
        </div>
      </section>
    </main>
  );
}

const PROFILE_LABEL = 'FTB Quests → Tenet';
