'use client';

/**
 * The conversion report, laid out to be reviewed rather than read top to bottom.
 *
 * A flat table of 87 warnings reads as 87 problems, when on a typical book it is one kind of entry 82 times
 * and two others besides. So each severity is grouped by code, and each group is headed by what that kind
 * of entry means and whether anybody has to do anything about it (`lib/codes.ts`). The explanation shows
 * while the group is folded, so a reader can take in the whole report from the heads alone and open only
 * the groups that ask for work.
 *
 * Each entry names the quest it is about, by title, and opens that quest's converted file in place; an
 * entry about a chapter, a table or a translation opens that file instead (`lib/targets.ts`).
 */
import { Fragment, useState } from 'react';

import { FilePreview } from '@/components/file-preview';
import { ACTION_LABEL, ACTION_RANK, codeInfo } from '@/lib/codes';
import type { Action, CodeInfo } from '@/lib/codes';
import type { ReportEntry } from '@/lib/core';
import type { PlacedFile } from '@/lib/pipeline';
import { targetOf } from '@/lib/targets';
import type { ReportTargets } from '@/lib/targets';

export const REPORT_SEVS = ['error', 'warning', 'note'] as const;
export type ReportSev = (typeof REPORT_SEVS)[number];

const SEV_LABEL: Record<ReportSev, string> = { error: 'Errors', warning: 'Warnings', note: 'Notes' };

/** What each severity means, said once above the groups. */
const SEV_MEANING: Record<ReportSev, string> = {
  error: 'Stop the run, so nothing is written. Each kind says what to fix.',
  warning:
    'The book converted, but something reads or behaves a little differently from FTB Quests, or needs doing by hand. Each kind says which.',
  note: 'A faithful translation, recorded so nothing changes silently: a renamed setting, a rounded position, a generated id. They almost never need anything.',
};

/** The id a group's head carries, so a count or a link can land on it. */
export function groupId(sev: ReportSev, code: string): string {
  return `report-${sev}-${code}`;
}

export function sevId(sev: ReportSev): string {
  return `report-${sev}`;
}

interface Group {
  readonly key: string;
  readonly code: string;
  readonly info: CodeInfo;
  readonly entries: ReadonlyArray<ReportEntry>;
}

function groupsOf(entries: ReadonlyArray<ReportEntry>, sev: ReportSev): Array<Group> {
  const byCode = new Map<string, Array<ReportEntry>>();
  for (const entry of entries) {
    if (entry.severity !== sev) continue;
    const list = byCode.get(entry.code);
    if (list === undefined) byCode.set(entry.code, [entry]);
    else list.push(entry);
  }
  return [...byCode]
    .map(([code, list]) => ({ key: groupId(sev, code), code, info: codeInfo(code, sev), entries: list }))
    .sort(
      (a, b) =>
        ACTION_RANK[a.info.action] - ACTION_RANK[b.info.action] ||
        b.entries.length - a.entries.length ||
        (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
    );
}

/** "82 nothing to do · 5 manual work": what a severity asks of the reader, by entries. */
function summaryOf(groups: ReadonlyArray<Group>): string {
  const tally = new Map<Action, number>();
  for (const group of groups) tally.set(group.info.action, (tally.get(group.info.action) ?? 0) + group.entries.length);
  return [...tally]
    .sort((a, b) => ACTION_RANK[a[0]] - ACTION_RANK[b[0]])
    .map(([action, n]) => `${n} ${ACTION_LABEL[action]}`)
    .join(' · ');
}

const FIRST_ROWS = 50;
const MORE_ROWS = 200;

function where(entry: ReportEntry): string {
  return `${entry.path ?? ''}${entry.line !== undefined && entry.line > 0 ? `:${entry.line}` : ''}`;
}

function CodeGroup({
  group,
  open,
  onToggle,
  targets,
  files,
}: {
  group: Group;
  open: boolean;
  onToggle: () => void;
  targets: ReportTargets;
  files: ReadonlyMap<string, PlacedFile>;
}) {
  const [limit, setLimit] = useState(FIRST_ROWS);
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set());
  const toggleRow = (index: number): void =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const { info, entries } = group;
  const shown = entries.slice(0, limit);
  return (
    <div className="codegroup" data-action={info.action}>
      <button
        type="button"
        id={group.key}
        className="codegroup-head jump-target"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="fold-caret" aria-hidden>{open ? '[−]' : '[+]'}</span>
        <span className="codegroup-name">
          {info.title}
          {info.title !== group.code && <span className="codegroup-code">{group.code}</span>}
        </span>
        <span className="action" data-action={info.action}>{ACTION_LABEL[info.action]}</span>
        <span className="fold-count">×{entries.length}</span>
      </button>
      {info.meaning !== '' && <p className="codegroup-meaning">{info.meaning}</p>}
      {open && (
        <>
          <table className="reporttable">
            <thead>
              <tr>
                <th>Where</th>
                <th>What happened</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry, index) => {
                const target = targetOf(entry, targets);
                const file = target === null ? undefined : files.get(target.path);
                const isOpen = opened.has(index);
                const source = where(entry);
                return (
                  <Fragment key={index}>
                    <tr data-sel={isOpen}>
                      <td className="entry-where">
                        {target !== null && file !== undefined ? (
                          <button
                            type="button"
                            className="entry-link"
                            aria-expanded={isOpen}
                            title={`Open ${target.path}`}
                            onClick={() => toggleRow(index)}
                          >
                            {target.title}
                          </button>
                        ) : (
                          target !== null && <span className="entry-title">{target.title}</span>
                        )}
                        <span className="entry-sub">
                          {target?.context && <>{target.context} · </>}
                          <span className="mono">{source === '' ? '(book)' : source}</span>
                        </span>
                      </td>
                      <td>{entry.message}</td>
                    </tr>
                    {isOpen && target !== null && file !== undefined && (
                      <tr className="previewrow">
                        <td colSpan={2}>
                          <p className="preview-head">
                            <span className="mono">{target.path}</span>
                            <span className="faint">converted file</span>
                          </p>
                          <FilePreview file={file} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {entries.length > shown.length && (
            <div className="toolbar">
              <button type="button" className="btn" onClick={() => setLimit(limit + MORE_ROWS)}>
                Show {Math.min(MORE_ROWS, entries.length - shown.length)} more
              </button>
              <span className="help">
                showing {shown.length} of {entries.length} · report.json has every one
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Report({
  entries,
  targets,
  files,
  open,
  onToggle,
  openGroups,
  onToggleGroup,
}: {
  entries: ReadonlyArray<ReportEntry>;
  targets: ReportTargets;
  files: ReadonlyMap<string, PlacedFile>;
  open: Readonly<Record<ReportSev, boolean>>;
  onToggle: (sev: ReportSev) => void;
  openGroups: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
}) {
  if (entries.length === 0) return null;
  const present = REPORT_SEVS.filter((sev) => entries.some((entry) => entry.severity === sev));
  return (
    <div className="report">
      <h2 className="label section-label">Report</h2>
      <dl className="report-legend">
        {present.map((sev) => (
          <div key={sev}>
            <dt className="label">{SEV_LABEL[sev]}</dt>
            <dd>{SEV_MEANING[sev]}</dd>
          </div>
        ))}
      </dl>
      {present.map((sev) => {
        const groups = groupsOf(entries, sev);
        const count = groups.reduce((sum, group) => sum + group.entries.length, 0);
        const folded = !open[sev];
        return (
          <div key={sev} className="report-sev">
            <button
              type="button"
              id={sevId(sev)}
              className="fold-head jump-target"
              aria-expanded={!folded}
              onClick={() => onToggle(sev)}
            >
              <span className="fold-title">
                <span className="fold-caret" aria-hidden>{folded ? '[+]' : '[−]'}</span>
                <span className="fold-name">
                  {SEV_LABEL[sev]}
                  <span className="fold-sub">
                    {groups.length} kind{groups.length === 1 ? '' : 's'} · {summaryOf(groups)}
                  </span>
                </span>
              </span>
              <span className="fold-count">{count}</span>
            </button>
            {!folded &&
              groups.map((group) => (
                <CodeGroup
                  key={group.key}
                  group={group}
                  open={openGroups.has(group.key)}
                  onToggle={() => onToggleGroup(group.key)}
                  targets={targets}
                  files={files}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
