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
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { CONVERSION, Diagram } from '@/components/diagram';
import { FilePreview, fmtBytes } from '@/components/file-preview';
import { PixelBar, Stages } from '@/components/progress';
import { REPORT_SEVS, Report, groupId, sevId } from '@/components/report';
import type { ReportSev } from '@/components/report';
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
import { DEFAULT_OPTIONS } from '@/lib/options';
import type { PipelineOptions, PipelineResult, PlacedFile } from '@/lib/pipeline';
import { canSaveToFolder, saveToFolder } from '@/lib/save-folder';

/**
 * zip.js and the zip helpers load on first use, not with the page: a folder drop never needs them, and
 * keeping them off the first load leaves the dropzone ready sooner. A finished run fetches them early
 * (see `run`), so Download does not wait on the network.
 */
const loadZip = () => import('@/lib/zip');

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

function fileSize(f: PlacedFile): number {
  return f.text !== undefined ? f.text.length : (f.bytes?.length ?? 0);
}

/** "a, b and c" */
function listed(parts: ReadonlyArray<string>): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Why far more files come out than went in, in the run's own numbers. FTB keeps a chapter in one file and
 * Tenet a quest per file, so the jump is expected; said plainly, it stops reading as something gone wrong.
 */
function whyMoreFiles(result: PipelineResult): string | null {
  const { chapters, quests } = result.targets.shape;
  if (result.failed || chapters === 0) return null;
  const count = (kind: PlacedFile['kind']): number => result.placed.filter((f) => f.kind === kind).length;
  const rest = count('converted') - chapters - quests;
  const parts = [
    rest > 0 ? `${rest} for the book's index, groups, reward tables and translations` : '',
    count('passthrough') > 0 ? `${count('passthrough')} input files copied over untouched` : '',
    count('report') > 0 ? `${count('report')} report files` : '',
  ].filter((part) => part !== '');
  return (
    `Why ${result.filesOut} from ${result.filesIn}? FTB Quests keeps a whole chapter in one file; Tenet gives every quest its own. ` +
    `So ${chapters} chapter${chapters === 1 ? '' : 's'} became ${chapters} folder${chapters === 1 ? '' : 's'} of ${quests} quest files, each with a chapter.json.` +
    (parts.length > 0 ? ` The rest: ${listed(parts)}.` : '')
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
  const [foldReport, setFoldReport] = useState<Record<ReportSev, boolean>>({ error: true, warning: true, note: false });
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());
  const [jump, setJump] = useState<{ id: string; at: number } | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  function toggleGroup(key: string): void {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * A count in the result is a way in to its part of the page: it opens that part, then lands on it once
   * it has rendered. The landing is instant, as every move on this sheet is, and the head it lands on draws
   * its rule in frames so the eye can find it.
   */
  function jumpTo(id: string, open?: () => void): void {
    open?.();
    setJump({ id, at: Date.now() });
  }

  useEffect(() => {
    if (jump === null) return;
    const el = document.getElementById(jump.id);
    if (el === null) return;
    el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
    el.removeAttribute('data-landed');
    void el.offsetWidth; // restart the frames when the same head is landed on twice
    el.setAttribute('data-landed', '');
    const done = setTimeout(() => el.removeAttribute('data-landed'), 1400);
    return () => clearTimeout(done);
  }, [jump]);
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
      const { filesFromZipBlob } = await loadZip();
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

  // Locales present in the detected book's lang/ — a locale file or a split folder
  // (lang/<locale>/…), merged build artefacts excluded, same rule as the core — shown
  // under the canonical input so the choice is informed.
  const langRoot =
    effectiveRoot === undefined ? null : effectiveRoot === '' ? 'lang' : `${effectiveRoot}/lang`;
  const foundLocales =
    langRoot === null || !files
      ? []
      : [...new Set(
          files.flatMap((f) => {
            if (!f.path.startsWith(`${langRoot}/`) || !f.path.endsWith('.snbt')) return [];
            const base = f.path.slice(langRoot.length + 1, -'.snbt'.length);
            const cut = base.indexOf('/');
            if (cut > 0) return [base.slice(0, cut)];
            return base.endsWith('_merged') ? [] : [base];
          }),
        )].sort();

  async function run(override: Partial<PipelineOptions> = {}): Promise<void> {
    if (!files || files.length === 0 || running) return;
    const chosen = { ...opts, ...override };
    if (override.allowLoss !== undefined) setOpts(chosen);
    setRunning(true);
    setResult(null);
    setRunError(null);
    setVerifyMsg(null);
    setLog([`starting ${PROFILE_LABEL} on ${files.length} files…`]);
    setProgress({ stage: 'detect', done: 0, total: 7 });
    // Geometry scales are intentionally unexposed: the core's measured ×64/×48
    // always apply. The pipeline keeps the override fields for scripts, not UI.
    const effective = { ...chosen, coordinateScale: null, sizeScale: null };
    const handle = runPipeline(files, effective, selectedRoot, (stage, done, total) => {
      setProgress({ stage, done, total });
      setLog((lines) => [...lines, `${stage} — ${done}/${total}`]);
    }, skipped);
    cancelRef.current = () => handle.cancel();
    try {
      const res = await handle.done;
      if (!res.failed) void loadZip().catch(() => {}); // warm the export before Download is pressed
      // Errors open on arrival, every kind of them: they are the reason the run stopped.
      const errorCodes = (res.reportJson.entries as ReadonlyArray<ReportEntry>)
        .filter((e) => e.severity === 'error')
        .map((e) => groupId('error', e.code));
      setOpenGroups(new Set(errorCodes));
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
    const { placedToZipBlob } = await loadZip();
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
      const { placedToZipBlob } = await loadZip();
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
  const placedByPath = useMemo(
    () => new Map((result && !result.failed ? result.placed : []).map((f) => [f.path, f] as const)),
    [result],
  );
  const why = result ? whyMoreFiles(result) : null;
  const sevCount: Record<ReportSev, number> = {
    error: result?.errors ?? 0,
    warning: result?.warnings ?? 0,
    note: result?.notes ?? 0,
  };
  const placed = (result && !result.failed ? result.placed : []).filter((f) =>
    filter === '' ? true : f.path.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <main>
      <section className="hero hero-split">
        <div className="hero-copy">
          <p className="eyebrow">ftb quests 1.21.1 → tenet · client-side</p>
          <h1>FTB Quests → Tenet migrator.</h1>
          <p className="sub">Drop a quest export, get back a Tenet tree.</p>
          <p className="local">
            <span className="pill">Runs locally</span>
            <span>
              <strong>Your files never leave your computer.</strong> Everything happens in this browser tab: the
              book is read, converted and zipped right here, and nothing is uploaded anywhere.
            </span>
          </p>
        </div>
        <figure className="hero-figure">
          <figcaption className="figure-label">
            <span>fig. 1</span>
            <span>what goes in, and what comes out</span>
          </figcaption>
          <Diagram lines={CONVERSION} />
        </figure>
      </section>

      <section className="stage">
        <div className="stage-head jump-target" id="intake" tabIndex={-1}>
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
            <span className="dropzone-glyph" aria-hidden="true">↓</span>
            <h2>Drop a quest folder or .zip here</h2>
            <p className="muted">…or pick below. Anything from the quest book up to the whole profile or instance zip works — the book is found where it lives, and files too big to hold (jars, saves) are listed, not copied. It all stays on this computer.</p>
            <div className="btnrow" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="btn" onClick={() => folderRef.current?.click()}>Choose folder</button>
              <button type="button" className="btn" onClick={() => filesRef.current?.click()}>Choose files</button>
              <button type="button" className="btn" onClick={() => zipRef.current?.click()}>Choose zip</button>
              <button type="button" className="btn" onClick={() => void onPicker()}>Browse…</button>
            </div>
          </div>
          {scan && (
            <div>
              <PixelBar
                label={scan.label}
                value={scan.total === null || scan.total === 0 ? null : scan.done / scan.total}
              />
              <p className="pixelbar-note">
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
                <span className="checkline"><input type="checkbox" checked={opts.allowLoss} onChange={(e) => setOpts({ ...opts, allowLoss: e.target.checked })} /> allow loss (convert anyway)</span>
                <span className="help">Fields this converter has no mapping for, and a task, reward or picture that cannot convert, stop the run by default, each named. On: they are left out and listed as warnings.</span>
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
              inlined. Older books (text inside the quest files, split <span className="mono">lang/&lt;locale&gt;/</span> folders,
              1.20 item stacks) read as their 1.21 equivalents. ATM10 converts with zero errors; everything
              approximated is listed in the report.
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
                <Stages
                  done={progress.done}
                  running={running}
                  complete={!running && !!result && !result.failed}
                  failed={!running && (!!runError || !!result?.failed)}
                />
                <div className="log" data-live={running}>{log.join('\n')}</div>
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
              {result.failed ? `failed · ${result.errors} error${result.errors === 1 ? '' : 's'}` : `${result.filesOut} files out`}
            </span>
          </div>
          <div className="stage-body">
            <div className="counts">
              <button type="button" className="count" onClick={() => jumpTo('intake')}>
                <b>{result.filesIn}</b> files in
              </button>
              <button
                type="button"
                className="count"
                disabled={result.failed}
                onClick={() => jumpTo('files', () => setFoldFiles((f) => ({ ...f, converted: true })))}
              >
                <b>{result.filesOut}</b> files out
              </button>
              {REPORT_SEVS.map((sev) => (
                <button
                  key={sev}
                  type="button"
                  className="count"
                  disabled={sevCount[sev] === 0}
                  onClick={() => jumpTo(sevId(sev), () => setFoldReport((f) => ({ ...f, [sev]: true })))}
                >
                  <b>{sevCount[sev]}</b> {sev}{sevCount[sev] === 1 ? '' : 's'}
                </button>
              ))}
              {skipped.length > 0 && (
                <button
                  type="button"
                  className="count"
                  onClick={() =>
                    jumpTo(groupId('note', 'passthrough-skipped'), () => {
                      setFoldReport((f) => ({ ...f, note: true }));
                      setOpenGroups((g) => new Set(g).add(groupId('note', 'passthrough-skipped')));
                    })
                  }
                >
                  <b>{skipped.length}</b> too big, in report
                </button>
              )}
            </div>
            {why && <p className="help">{why}</p>}
            {result.evidence && <p className="evidence">{result.evidence} → {result.outputRoot === '' ? '(book root)' : <span className="mono">{result.outputRoot}/</span>}</p>}

            {result.failed && (
              <>
                <p className="muted" style={{ fontSize: 13 }}>{result.fatal ?? 'See the report below.'}</p>
                {!opts.allowLoss && (
                  <div className="toolbar">
                    <button type="button" className="btn" data-primary="true" disabled={running} onClick={() => void run({ allowLoss: true })}>
                      Convert with loss allowed
                    </button>
                    <span className="help">Leaves out what cannot convert, each one listed as a warning.</span>
                  </div>
                )}
              </>
            )}

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
              </>
            )}

            <Report
              entries={entries}
              targets={result.targets}
              files={placedByPath}
              open={foldReport}
              onToggle={(sev) => setFoldReport((f) => ({ ...f, [sev]: !f[sev] }))}
              openGroups={openGroups}
              onToggleGroup={toggleGroup}
            />

            {!result.failed && (
              <>
                <h2 className="label section-label jump-target" id="files" tabIndex={-1}>Files</h2>
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
                          <span className="fold-caret" aria-hidden>{folded ? '[+]' : '[−]'}</span>
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
          </div>
        </section>
      )}

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
