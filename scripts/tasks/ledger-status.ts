#!/usr/bin/env bun

// The task ledger drifts in one direction: work finishes and the record stays put. That
// is not hypothetical — on 2026-07-28 the user said "i think some things in todos are
// actually completed" and three were. #108 had a DELIVERED REPORT sitting in its todo
// folder; #107's fix had been in main since 966c5d1; #77's first two holes landed at
// 4ab250f. Nothing noticed, because noticing was a person reading 61 folders.
//
// So this counts the ledger deterministically and reports the drift signals a human
// cannot see by inspection. It reports; it does not move anything. Moving a task is a
// judgement about whether the work is actually done, and the signals here are evidence
// for that judgement rather than a substitute for it.
//
// Four signals, in descending strength:
//
//   REPORT-IN-OPEN    a todo/live folder holds a report-*.md. An agent delivered. This
//                     is the strongest tell and it is what was missed for #108.
//   STATE-MISMATCH    the task file's `State:` line disagrees with its parent directory.
//                     One of the two is stale and neither can be trusted over the other.
//   DONE-NO-EVIDENCE  a done folder with neither a report nor a commit named in its
//                     State line. Possibly closed on an assumption.
//   THIN              a task file at or under THIN_LINE_CEILING lines. The ledger
//                     migration produced 53 of these by carrying only each subject; a
//                     new one means a task was filed without its reasoning.
//
// POSITIVE CONTROL. `--self-test` builds a throwaway ledger in a temp directory
// containing one planted instance of each signal, runs the same analysis over it, and
// requires every signal to fire. A checker whose only possible output is "clean" is
// indistinguishable from a healthy repo, which is the defect class this repo has now
// found eight times. The control fails loudly and exits non-zero.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

export type LedgerState = 'todo' | 'live' | 'done' | 'retired';

export type DriftSignal =
  'REPORT-IN-OPEN' | 'STATE-MISMATCH' | 'DONE-NO-EVIDENCE' | 'THIN';

export interface TaskRecord {
  taskNumber: number;
  folderName: string;
  directoryState: LedgerState;
  declaredState: string | null;
  taskFileLineCount: number;
  briefCount: number;
  reportCount: number;
  summaryCount: number;
  namesACommit: boolean;
}

export interface DriftFinding {
  signal: DriftSignal;
  taskNumber: number;
  folderName: string;
  directoryState: LedgerState;
  detail: string;
}

const LEDGER_STATES: LedgerState[] = ['todo', 'live', 'done', 'retired'];
const OPEN_STATES: LedgerState[] = ['todo', 'live'];
const THIN_LINE_CEILING = 15;
// A commit reference in a State line. Seven or more hex characters, so a word like
// "added" or "deface" cannot masquerade as a short SHA.
const COMMIT_REFERENCE = /\b[0-9a-f]{7,40}\b/;

function readTaskRecords(tasksRoot: string): TaskRecord[] {
  const records: TaskRecord[] = [];
  for (const directoryState of LEDGER_STATES) {
    const statePath = join(tasksRoot, directoryState);
    if (!existsSync(statePath)) continue;
    for (const folderName of readdirSync(statePath).sort()) {
      const folderPath = join(statePath, folderName);
      let entries: string[];
      try {
        entries = readdirSync(folderPath);
      } catch {
        continue; // a stray file rather than a task folder
      }
      const taskFileName = entries.find(
        (entry) => entry.startsWith('task-') && entry.endsWith('.md'),
      );
      const taskFileText =
        taskFileName === undefined
          ? ''
          : readFileSync(join(folderPath, taskFileName), 'utf8');
      const declaredStateLine = taskFileText
        .split('\n')
        .find((line) => line.startsWith('State:'));
      records.push({
        taskNumber: Number.parseInt(folderName, 10),
        folderName,
        directoryState,
        declaredState:
          declaredStateLine === undefined
            ? null
            : declaredStateLine.slice('State:'.length).trim(),
        taskFileLineCount:
          taskFileName === undefined ? 0 : taskFileText.split('\n').length,
        briefCount: entries.filter((entry) => entry.startsWith('brief-'))
          .length,
        reportCount: entries.filter((entry) => entry.startsWith('report-'))
          .length,
        summaryCount: entries.filter((entry) => entry.startsWith('summary-'))
          .length,
        namesACommit:
          declaredStateLine !== undefined &&
          COMMIT_REFERENCE.test(declaredStateLine),
      });
    }
  }
  return records;
}

function findDrift(records: TaskRecord[]): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const record of records) {
    const base = {
      taskNumber: record.taskNumber,
      folderName: record.folderName,
      directoryState: record.directoryState,
    };

    if (OPEN_STATES.includes(record.directoryState) && record.reportCount > 0) {
      findings.push({
        ...base,
        signal: 'REPORT-IN-OPEN',
        detail: `${record.reportCount} report(s) in a ${record.directoryState} folder — an agent delivered; check whether it landed`,
      });
    }

    // The declared state is prose ("DONE — merged abc1234", "TODO — hold"), so match the
    // leading word rather than the whole line.
    const declaredWord =
      record.declaredState?.split(/[\s—-]/)[0]?.toUpperCase() ?? null;
    if (
      declaredWord !== null &&
      declaredWord !== record.directoryState.toUpperCase()
    ) {
      findings.push({
        ...base,
        signal: 'STATE-MISMATCH',
        detail: `file says "${declaredWord}" but it sits in ${record.directoryState}/`,
      });
    }

    if (
      record.directoryState === 'done' &&
      record.reportCount === 0 &&
      !record.namesACommit
    ) {
      findings.push({
        ...base,
        signal: 'DONE-NO-EVIDENCE',
        detail:
          'done with neither a report nor a commit named in its State line',
      });
    }

    if (
      record.taskFileLineCount > 0 &&
      record.taskFileLineCount <= THIN_LINE_CEILING
    ) {
      findings.push({
        ...base,
        signal: 'THIN',
        detail: `task file is ${record.taskFileLineCount} lines — filed without its reasoning`,
      });
    }
  }
  return findings;
}

function report(tasksRoot: string): number {
  const records = readTaskRecords(tasksRoot);
  const findings = findDrift(records);

  console.log('LEDGER COUNTS');
  for (const state of LEDGER_STATES) {
    const inState = records.filter((record) => record.directoryState === state);
    console.log(
      `  ${state.padEnd(8)} ${String(inState.length).padStart(3)}` +
        `   briefs ${inState.reduce((total, record) => total + record.briefCount, 0)}` +
        `  reports ${inState.reduce((total, record) => total + record.reportCount, 0)}` +
        `  summaries ${inState.reduce((total, record) => total + record.summaryCount, 0)}`,
    );
  }
  console.log(`  ${'TOTAL'.padEnd(8)} ${String(records.length).padStart(3)}`);

  const highestNumber = records.reduce(
    (highest, record) => Math.max(highest, record.taskNumber),
    0,
  );
  console.log(`  highest task number: #${highestNumber}`);

  console.log('');
  if (findings.length === 0) {
    console.log('DRIFT: none of the four signals fired.');
    return 0;
  }

  console.log(
    `DRIFT (${findings.length} finding(s)) — reported, never moved automatically:`,
  );
  for (const signal of [
    'REPORT-IN-OPEN',
    'STATE-MISMATCH',
    'DONE-NO-EVIDENCE',
    'THIN',
  ] as DriftSignal[]) {
    const ofSignal = findings.filter((finding) => finding.signal === signal);
    if (ofSignal.length === 0) continue;
    console.log(`  ${signal} (${ofSignal.length})`);
    for (const finding of ofSignal) {
      console.log(
        `    #${finding.taskNumber} ${finding.folderName} — ${finding.detail}`,
      );
    }
  }
  return 0; // report-only: this is a lens, not a gate
}

// The positive control. Every signal gets a planted instance and must be named back.
function selfTest(): number {
  const root = mkdtempSync(join(tmpdir(), 'ledger-status-selftest-'));
  const write = (
    state: string,
    folder: string,
    fileName: string,
    text: string,
  ): void => {
    mkdirSync(join(root, state, folder), { recursive: true });
    writeFileSync(join(root, state, folder, fileName), text);
  };
  const fullTask = (state: string): string =>
    `# 900 — planted\n\nState: ${state}\n\n## Outline\n\n${'body line\n'.repeat(30)}`;

  // REPORT-IN-OPEN: a delivered report sitting in todo — the #108 shape.
  write(
    'todo',
    '901-planted-report-in-open',
    'task-901-planted-report-in-open.md',
    fullTask('TODO'),
  );
  write(
    'todo',
    '901-planted-report-in-open',
    'report-901-planted-report-in-open.md',
    'delivered',
  );
  // STATE-MISMATCH: file says DONE, folder says todo.
  write(
    'todo',
    '902-planted-state-mismatch',
    'task-902-planted-state-mismatch.md',
    fullTask('DONE'),
  );
  // DONE-NO-EVIDENCE: done, no report, no commit named.
  write(
    'done',
    '903-planted-done-no-evidence',
    'task-903-planted-done-no-evidence.md',
    fullTask('DONE'),
  );
  // THIN: a stub.
  write(
    'todo',
    '904-planted-thin',
    'task-904-planted-thin.md',
    '# 904 — planted\n\nState: TODO\n\nstub.\n',
  );
  // A clean control that must produce NOTHING, so the checker is not merely firing on everything.
  write(
    'done',
    '905-planted-clean',
    'task-905-planted-clean.md',
    fullTask('DONE — merged 1a2b3c4d'),
  );
  write(
    'done',
    '905-planted-clean',
    'report-905-planted-clean.md',
    'delivered',
  );

  const findings = findDrift(readTaskRecords(root));
  rmSync(root, { recursive: true, force: true });

  const expected: Array<[DriftSignal, number]> = [
    ['REPORT-IN-OPEN', 901],
    ['STATE-MISMATCH', 902],
    ['DONE-NO-EVIDENCE', 903],
    ['THIN', 904],
  ];
  let failures = 0;
  for (const [signal, taskNumber] of expected) {
    const fired = findings.some(
      (finding) =>
        finding.signal === signal && finding.taskNumber === taskNumber,
    );
    console.log(
      `  ${fired ? 'PASS' : 'FAIL'}  ${signal} on planted #${taskNumber}`,
    );
    if (!fired) failures++;
  }
  const noiseOnClean = findings.filter((finding) => finding.taskNumber === 905);
  console.log(
    `  ${noiseOnClean.length === 0 ? 'PASS' : 'FAIL'}  clean control #905 produced ${noiseOnClean.length} finding(s), expected 0`,
  );
  if (noiseOnClean.length > 0) failures++;

  console.log(
    failures === 0
      ? 'SELF-TEST: all signals fire, clean control stays silent.'
      : `SELF-TEST: ${failures} FAILURE(S)`,
  );
  return failures === 0 ? 0 : 1;
}

const repositoryRoot = join(import.meta.dir, '..', '..');
process.exit(
  process.argv.includes('--self-test')
    ? selfTest()
    : report(join(repositoryRoot, '.invar', 'tasks')),
);
