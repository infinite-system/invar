#!/usr/bin/env bun

// The task record drifts in one direction: work finishes and the record stays put. That
// is not hypothetical — on 2026-07-28 the user said "i think some things in todos are
// actually completed" and three were. #108 had a DELIVERED REPORT sitting in its open
// folder; #107's fix had been in main since 966c5d1; #77's first two holes landed at
// 4ab250f. Nothing noticed, because noticing was a person reading 61 folders.
//
// So this counts the task folders deterministically and reports the drift signals a human
// cannot see by inspection. It reports; it does not move anything. Moving a task is a
// judgement about whether the work is actually done, and the signals here are evidence
// for that judgement rather than a substitute for it.
//
// Five signals, in descending strength:
//
//   REPORT-IN-OPEN    an active/in-progress folder holds a report-*.md. An agent delivered. This
//                     is the strongest tell and it is what was missed for #108.
//   STATE-MISMATCH    the task file's `State:` line disagrees with its parent directory.
//                     One of the two is stale and neither can be trusted over the other.
//   DONE-NO-EVIDENCE  a done folder with neither a report nor a commit named in its
//                     State line. Possibly closed on an assumption.
//   THIN              a task file at or under THIN_LINE_CEILING lines. The
//                     migration produced 53 of these by carrying only each subject; a
//                     new one means a task was filed without its reasoning.
//   STALE-ACTIVE-VIEW a generated view (project.active-tasks.md or project.tasks-completed.md)
//                     disagrees with a fresh render — a move
//                     happened and write-active did not run. The repair is always the
//                     one command, never a hand edit to individual entries.
//
// POSITIVE CONTROL. `--self-test` builds a throwaway task tree in a temp directory
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

export type TaskState = 'active' | 'in-progress' | 'completed' | 'retired';

export type DriftSignal =
  | 'REPORT-IN-OPEN'
  | 'STATE-MISMATCH'
  | 'DONE-NO-EVIDENCE'
  | 'THIN'
  | 'STALE-ACTIVE-VIEW';

export interface TaskRecord {
  taskNumber: number;
  folderName: string;
  directoryState: TaskState;
  declaredState: string | null;
  taskFileLineCount: number;
  briefCount: number;
  reportCount: number;
  summaryCount: number;
  namesACommit: boolean;
  priorityGroup: string | null;
}

export interface DriftFinding {
  signal: DriftSignal;
  taskNumber: number;
  folderName: string;
  directoryState: TaskState;
  detail: string;
}

const TASK_STATES: TaskState[] = [
  'active',
  'in-progress',
  'completed',
  'retired',
];
const OPEN_STATES: TaskState[] = ['active', 'in-progress'];
const THIN_LINE_CEILING = 15;
// A commit reference in a State line. Seven or more hex characters, so a word like
// "added" or "deface" cannot masquerade as a short SHA.
const COMMIT_REFERENCE = /\b[0-9a-f]{7,40}\b/;

function readTaskRecords(tasksRoot: string): TaskRecord[] {
  const records: TaskRecord[] = [];
  for (const directoryState of TASK_STATES) {
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
        priorityGroup:
          taskFileText
            .split('\n')
            .find((line) => line.startsWith('Priority:'))
            ?.slice('Priority:'.length)
            .trim() ?? null,
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
      record.declaredState?.split(/[\s—]/)[0]?.toUpperCase() ?? null;
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
      record.directoryState === 'completed' &&
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

const PRIORITY_ORDER = [
  'user-directed',
  'verification-integrity',
  'flake-evidence',
  'performance-behaviour',
  'architecture-hygiene',
];

// The active view is DERIVED from the Priority: field in each task file, never maintained by hand.
// A hand-written backlog needs a second edit per filed or landed task, and a record that needs a
// second step eventually does not happen — that is how every prior task snapshot went stale.
const ACTIVE_VIEW_HEADER =
  '# project.active-tasks.md — AUTO-GENERATED, NEVER EDIT BY HAND\n\n' +
  'Every byte of this file is written by `bun scripts/tasks/tasks-status.ts write-active`,\n' +
  'derived from the Priority: field in each task file. Any hand edit is destroyed on the next\n' +
  'regeneration and reads as STALE-ACTIVE-VIEW until then. Prioritisation REASONING is\n' +
  'hand-written in the sibling file `project.active-priority-tasks.md`.\n' +
  'Detail per task: `.invar/tasks/<state>/<folder>/`.\n\n';

function activeViewPath(tasksRoot: string): string {
  return join(tasksRoot, '..', '..', 'project.active-tasks.md');
}

const RECENTLY_COMPLETED_COUNT = 15;

// Task numbers are permanent and monotonic, so number-descending is "latest first" without needing
// a timestamp nobody records. True completion CHRONOLOGY lives in the git history of the folder
// moves; these views are ordering by recency of FILING, which is the stable, derivable proxy.
function byNumberDescending(left: TaskRecord, right: TaskRecord): number {
  return right.taskNumber - left.taskNumber;
}

function taskLine(record: TaskRecord): string {
  const stateSuffix =
    record.declaredState !== null &&
    record.declaredState !== 'ACTIVE' &&
    record.declaredState !== 'IN-PROGRESS'
      ? `  [${record.declaredState}]`
      : '';
  return `- #${record.taskNumber} ${record.folderName.replace(/^\d+-/, '')}${stateSuffix}`;
}

function renderActiveView(records: TaskRecord[]): string {
  const outputLines: string[] = [];

  // IN-PROGRESS first — the tasks someone is actually on outrank everything waiting.
  const inProgress = records
    .filter((record) => record.directoryState === 'in-progress')
    .sort(byNumberDescending);
  if (inProgress.length > 0) {
    outputLines.push(`## IN-PROGRESS (${inProgress.length})`);
    for (const record of inProgress) outputLines.push(taskLine(record));
    outputLines.push('');
  }

  const activeRecords = records.filter(
    (record) => record.directoryState === 'active',
  );
  const ungrouped = activeRecords.filter(
    (record) => record.priorityGroup === null,
  );
  for (const group of PRIORITY_ORDER) {
    const inGroup = activeRecords
      .filter((record) => record.priorityGroup === group)
      .sort(byNumberDescending);
    if (inGroup.length === 0) continue;
    outputLines.push(`## ${group.toUpperCase()} (${inGroup.length})`);
    for (const record of inGroup) outputLines.push(taskLine(record));
    outputLines.push('');
  }
  if (ungrouped.length > 0) {
    outputLines.push(
      `## NO PRIORITY GROUP (${ungrouped.length}) — stamp Priority: into these task files`,
    );
    for (const record of ungrouped)
      outputLines.push(`- #${record.taskNumber} ${record.folderName}`);
    outputLines.push('');
  }

  // The recent tail of completed work, for at-a-glance momentum; the FULL log is the sibling file.
  const completed = records
    .filter((record) => record.directoryState === 'completed')
    .sort(byNumberDescending);
  if (completed.length > 0) {
    outputLines.push(
      `## RECENTLY COMPLETED (last ${Math.min(RECENTLY_COMPLETED_COUNT, completed.length)} of ${completed.length} — full log: project.tasks-completed.md)`,
    );
    for (const record of completed.slice(0, RECENTLY_COMPLETED_COUNT))
      outputLines.push(completedLine(record));
  }
  return outputLines.join('\n').trimEnd();
}

// One line per completed task: the subject as the short message, and whatever the State line
// carries after COMPLETED — usually the landing commit — attached.
function completedLine(record: TaskRecord): string {
  const stateRemainder =
    record.declaredState?.replace(/^COMPLETED\s*[—-]?\s*/, '').trim() ?? '';
  const attachment = stateRemainder.length > 0 ? ` — ${stateRemainder}` : '';
  return `- #${record.taskNumber} ${record.folderName.replace(/^\d+-/, '')}${attachment}`;
}

const COMPLETED_LOG_HEADER =
  '# project.tasks-completed.md — AUTO-GENERATED, NEVER EDIT BY HAND\n\n' +
  'Every completed task, latest first — the infinite log; entries only accumulate because a\n' +
  'completed folder is never deleted. Written by `bun scripts/tasks/tasks-status.ts write-active`,\n' +
  'derived from `.invar/tasks/completed/`. Each line: number, name, and the landing commit from the\n' +
  'task file’s State line. Completion chronology in full detail: `git log -- .invar/tasks/`.\n\n';

function completedLogPath(tasksRoot: string): string {
  return join(tasksRoot, '..', '..', 'project.tasks-completed.md');
}

function renderCompletedLog(records: TaskRecord[]): string {
  const completed = records
    .filter((record) => record.directoryState === 'completed')
    .sort(byNumberDescending);
  return completed.map(completedLine).join('\n');
}

// The generated view can lag the folders in exactly ONE way: a move happened and nobody re-ran
// write-active. So the check is not "which entries are wrong" — it is a byte comparison against a
// fresh render, and the repair is always the same single command. Prompting an agent to hand-edit
// individual stale entries would reintroduce the hand-maintained backlog this file exists to end.
// Both generated files are covered by the ONE staleness check: either disagreeing with a fresh
// render means a move happened and write-active did not run — the same single repair.
function activeViewIsStale(tasksRoot: string, records: TaskRecord[]): boolean {
  const viewPath = activeViewPath(tasksRoot);
  const logPath = completedLogPath(tasksRoot);
  if (!existsSync(viewPath) || !existsSync(logPath)) return true;
  const expectedView = ACTIVE_VIEW_HEADER + renderActiveView(records) + '\n';
  const expectedLog = COMPLETED_LOG_HEADER + renderCompletedLog(records) + '\n';
  return (
    readFileSync(viewPath, 'utf8') !== expectedView ||
    readFileSync(logPath, 'utf8') !== expectedLog
  );
}

// The self-test writes the views exactly the way write-active does — through the SAME code path —
// so the arms exercise the real writer rather than a test-local imitation of it.
function backlogWriteForTest(tasksRoot: string, records: TaskRecord[]): void {
  writeFileSync(
    activeViewPath(tasksRoot),
    ACTIVE_VIEW_HEADER + renderActiveView(records) + '\n',
  );
  writeFileSync(
    completedLogPath(tasksRoot),
    COMPLETED_LOG_HEADER + renderCompletedLog(records) + '\n',
  );
}

function backlog(tasksRoot: string, writeActiveFile: boolean): number {
  const records = readTaskRecords(tasksRoot);
  const view = renderActiveView(records);
  console.log(view);
  if (writeActiveFile) {
    backlogWriteForTest(tasksRoot, records);
    console.log('wrote project.active-tasks.md + project.tasks-completed.md');
  }
  return 0;
}

function report(tasksRoot: string): number {
  const records = readTaskRecords(tasksRoot);
  const findings = findDrift(records);

  console.log('TASKS');
  for (const state of TASK_STATES) {
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

  // STALE-ACTIVE-VIEW: a task moved states and nobody regenerated the derived view — a done task
  // still listed as active, or a filed task missing. Detected by byte-diff against a fresh render,
  // and the repair is always the one command, never an edit to individual entries.
  if (activeViewIsStale(tasksRoot, records)) {
    findings.push({
      signal: 'STALE-ACTIVE-VIEW',
      taskNumber: 0,
      folderName: 'project.active-tasks.md',
      directoryState: 'active',
      detail:
        'the generated view disagrees with the folders — run `bun scripts/tasks/tasks-status.ts write-active`',
    });
  }

  console.log('');
  if (findings.length === 0) {
    console.log('DRIFT: none of the five signals fired.');
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
    'STALE-ACTIVE-VIEW',
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
  // The tasks root sits TWO levels inside the sandbox, mirroring .invar/tasks/ inside the repo, so
  // activeViewPath's ../../ resolves to the sandbox — not to / (the first run tried to write
  // /project.active-tasks.md, and the EACCES was the only thing that stopped it).
  const sandbox = mkdtempSync(join(tmpdir(), 'tasks-status-selftest-'));
  const root = join(sandbox, '.invar', 'tasks');
  mkdirSync(root, { recursive: true });
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
    'active',
    '901-planted-report-in-open',
    'task-901-planted-report-in-open.md',
    fullTask('ACTIVE'),
  );
  write(
    'active',
    '901-planted-report-in-open',
    'report-901-planted-report-in-open.md',
    'delivered',
  );
  // STATE-MISMATCH: file says DONE, folder says todo.
  write(
    'active',
    '902-planted-state-mismatch',
    'task-902-planted-state-mismatch.md',
    fullTask('COMPLETED'),
  );
  // DONE-NO-EVIDENCE: done, no report, no commit named.
  write(
    'completed',
    '903-planted-done-no-evidence',
    'task-903-planted-done-no-evidence.md',
    fullTask('COMPLETED'),
  );
  // THIN: a stub.
  write(
    'active',
    '904-planted-thin',
    'task-904-planted-thin.md',
    '# 904 — planted\n\nState: ACTIVE\n\nstub.\n',
  );
  // A clean control that must produce NOTHING, so the checker is not merely firing on everything.
  write(
    'completed',
    '905-planted-clean',
    'task-905-planted-clean.md',
    fullTask('COMPLETED — merged 1a2b3c4d'),
  );
  write(
    'completed',
    '905-planted-clean',
    'report-905-planted-clean.md',
    'delivered',
  );

  const plantedRecords = readTaskRecords(root);
  const findings = findDrift(plantedRecords);

  // STALE-ACTIVE-VIEW, both arms. A view listing a DONE task must read stale; a freshly
  // generated one must read fresh. The sandbox nests .invar/tasks so the view path resolves inside
  // it, not to /.
  writeFileSync(
    activeViewPath(root),
    ACTIVE_VIEW_HEADER + '- #903 planted-done-no-evidence\n',
  );
  const staleDetected = activeViewIsStale(root, plantedRecords);
  backlogWriteForTest(root, plantedRecords);
  const freshMisreported = activeViewIsStale(root, plantedRecords);
  rmSync(sandbox, { recursive: true, force: true });

  const expected: Array<[DriftSignal, number]> = [
    ['REPORT-IN-OPEN', 901],
    ['STATE-MISMATCH', 902],
    ['DONE-NO-EVIDENCE', 903],
    ['THIN', 904],
  ];
  let failures = 0;
  console.log(
    `  ${staleDetected ? 'PASS' : 'FAIL'}  STALE-ACTIVE-VIEW fires when a done task is still listed`,
  );
  if (!staleDetected) failures++;
  console.log(
    `  ${freshMisreported ? 'FAIL' : 'PASS'}  a freshly generated view reads fresh`,
  );
  if (freshMisreported) failures++;
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
const tasksRoot = join(repositoryRoot, '.invar', 'tasks');
process.exit(
  process.argv.includes('--self-test')
    ? selfTest()
    : process.argv.includes('backlog')
      ? backlog(tasksRoot, false)
      : process.argv.includes('write-active')
        ? backlog(tasksRoot, true)
        : report(tasksRoot),
);
