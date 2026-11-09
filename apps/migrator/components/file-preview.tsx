/**
 * One converted file, opened in place: numbered lines in a sunken drawer, or a note for a binary. The file
 * browser opens it under a file's row and the report under an entry's, so both read a file the same way.
 */
import type { PlacedFile } from '@/lib/pipeline';

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const PREVIEW_LINES = 300;

export function FilePreview({ file }: { file: PlacedFile }) {
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
