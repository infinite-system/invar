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
  assignedEngine: string | null;
  assignedModel: string | null;
  assignedEffort: string | null;
}

// A header field like `Engine: codex` from a task file's front block.
function headerField(taskFileText: string, fieldName: string): string | null {
  return (
    taskFileText
      .split('\n')
      .find((line) => line.startsWith(`${fieldName}:`))
      ?.slice(fieldName.length + 1)
      .trim()
      .split(/\s/)[0] ?? null
  );
}

// The compact agent identity for the lenses: `claude·opus-5·high`.
function agentIdentity(record: TaskRecord): string | null {
  if (record.assignedEngine === null) return null;
  return [
    record.assignedEngine,
    record.assignedModel ?? 'unknown',
    record.assignedEffort ?? 'default',
  ].join('·');
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
        assignedEngine: headerField(taskFileText, 'Engine'),
        assignedModel: headerField(taskFileText, 'Model'),
        assignedEffort: headerField(taskFileText, 'Effort'),
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
    for (const record of inProgress) {
      // A delivered report means the builder finished and the session is idle.
      // Derived from the folder (the same fact REPORT-IN-OPEN reads), so the
      // view stays deterministic — no liveness probe, no machine-dependent output.
      const builderStatus =
        record.reportCount > 0
          ? 'READY delivered — builder idle, awaiting landing'
          : 'building';
      outputLines.push(`${taskLine(record)}  [${builderStatus}]`);
      // The attach command rides the entry, so joining the session is one
      // copy-paste. Session naming is dispatch.sh's convention: invar/<folder-name>.
      outputLines.push(`  \`tmux attach -t invar/${record.folderName}\``);
    }
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

// Command-line lenses, one per state the user asks about. `live` answers "what
// is running and how do I join it"; `active` answers "what is waiting, in what
// order"; `completed` answers "what landed, with which commit".
// Colour lives ONLY in the terminal lenses — never in the generated files,
// which stay byte-deterministic. Honours NO_COLOR and non-TTY pipes.
const colourEnabled = process.stdout.isTTY === true && !process.env.NO_COLOR;

function paint(ansiCode: string, text: string): string {
  return colourEnabled ? `\x1b[${ansiCode}m${text}\x1b[0m` : text;
}

const bold = (text: string): string => paint('1', text);
const dim = (text: string): string => paint('2', text);
const green = (text: string): string => paint('32', text);
const yellow = (text: string): string => paint('33', text);
const cyan = (text: string): string => paint('36', text);
const magenta = (text: string): string => paint('35', text);
const red = (text: string): string => paint('31', text);

const PRIORITY_BADGES: Record<string, string> = {
  'user-directed': magenta('★ user-directed'),
  'verification-integrity': yellow('⚑ verification-integrity'),
  'flake-evidence': red('◍ flake-evidence'),
  'performance-behaviour': cyan('⚡performance-behaviour'),
  'architecture-hygiene': green('⬡ architecture-hygiene'),
};

// Durations are computed at VIEW time from meta.json's startedAt (written at
// dispatch) — never stored, so the generated files stay byte-deterministic.
function startedAtMilliseconds(
  tasksRoot: string,
  record: TaskRecord,
): number | null {
  const metaPath = join(
    tasksRoot,
    record.directoryState,
    record.folderName,
    'meta.json',
  );
  if (!existsSync(metaPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(metaPath, 'utf8')) as {
      startedAt?: string;
    };
    if (typeof parsed.startedAt !== 'string') return null;
    const milliseconds = Date.parse(parsed.startedAt);
    return Number.isNaN(milliseconds) ? null : milliseconds;
  } catch {
    return null;
  }
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

// End time for a completed task: the last commit that touched its folder —
// the landing's lifecycle commit, which happens in the same action as the
// merge. One git call per completed task, so this runs only in the lens.
function landedAtMilliseconds(record: TaskRecord): number | null {
  const gitResult = Bun.spawnSync(
    [
      'git',
      'log',
      '-1',
      '--format=%ct',
      '--',
      `.invar/tasks/completed/${record.folderName}`,
    ],
    { cwd: join(import.meta.dir, '..', '..') },
  );
  const seconds = Number.parseInt(gitResult.stdout.toString().trim(), 10);
  return Number.isNaN(seconds) ? null : seconds * 1000;
}

// The spinner belongs to WORK IN MOTION only: building tasks spin, READY ones
// hold still. One glyph per task, not per line — motion marks the task, the
// details stay readable.
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function live(tasksRoot: string, spinnerFrame?: number): number {
  const records = readTaskRecords(tasksRoot)
    .filter((record) => record.directoryState === 'in-progress')
    .sort(byNumberDescending);
  if (records.length === 0) {
    console.log('IN-PROGRESS: none.');
    return 0;
  }
  console.log(bold(`⛭ IN-PROGRESS (${records.length})`));
  for (const record of records) {
    const ready = record.reportCount > 0;
    const buildingGlyph =
      spinnerFrame === undefined
        ? '●'
        : (SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] ?? '●');
    const statusBadge = ready
      ? green('◉ READY — awaiting landing')
      : yellow(`${buildingGlyph} building`);
    const startedAt = startedAtMilliseconds(tasksRoot, record);
    const runningFor =
      startedAt === null
        ? ''
        : `  ${cyan(formatDuration(Date.now() - startedAt))}`;
    const identity = agentIdentity(record);
    const identitySuffix = identity === null ? '' : `  ${dim(identity)}`;
    console.log(
      `  ${bold(`#${record.taskNumber}`)} ${record.folderName.replace(/^\d+-/, '')}  ${statusBadge}${runningFor}${identitySuffix}`,
    );
    console.log(dim(`      tmux attach -t invar/${record.folderName}`));
  }
  return 0;
}

function activeOnly(tasksRoot: string): number {
  const records = readTaskRecords(tasksRoot).filter(
    (record) => record.directoryState === 'active',
  );
  if (records.length === 0) {
    console.log('ACTIVE: none.');
    return 0;
  }
  console.log(bold(`◫ ACTIVE (${records.length}) — grouped by priority`));
  for (const group of [...PRIORITY_ORDER, null]) {
    const inGroup = records
      .filter((record) => record.priorityGroup === group)
      .sort(byNumberDescending);
    if (inGroup.length === 0) continue;
    const badge =
      group === null
        ? dim('◌ unprioritised')
        : (PRIORITY_BADGES[group] ?? group);
    console.log(`  ${badge}`);
    for (const record of inGroup) {
      const identity = agentIdentity(record);
      const identitySuffix = identity === null ? '' : `  ${dim(identity)}`;
      const line = taskLine(record).replace(
        /^- #(\d+)/,
        (_, number: string) => `- ${bold(`#${number}`)}`,
      );
      console.log(`  ${line}${identitySuffix}`);
    }
  }
  return 0;
}

function completedOnly(tasksRoot: string): number {
  const records = readTaskRecords(tasksRoot);
  const completedCount = records.filter(
    (record) => record.directoryState === 'completed',
  ).length;
  if (completedCount === 0) {
    console.log('COMPLETED: none.');
    return 0;
  }
  console.log(
    bold(
      `✔ COMPLETED (${completedCount}) — latest first, duration = dispatch to landing`,
    ),
  );
  printCompleted(tasksRoot, records, Number.POSITIVE_INFINITY);
  return 0;
}

function printCompleted(
  tasksRoot: string,
  records: TaskRecord[],
  cap: number,
): void {
  const completed = records
    .filter((record) => record.directoryState === 'completed')
    .sort(byNumberDescending)
    .slice(0, cap === Number.POSITIVE_INFINITY ? undefined : cap);
  for (const record of completed) {
    const startedAt = startedAtMilliseconds(tasksRoot, record);
    const landedAt = startedAt === null ? null : landedAtMilliseconds(record);
    const duration =
      startedAt !== null && landedAt !== null && landedAt > startedAt
        ? `  ${cyan(`[${formatDuration(landedAt - startedAt)}]`)}`
        : '';
    const identity = agentIdentity(record);
    const identitySuffix = identity === null ? '' : `  ${dim(identity)}`;
    const line = completedLine(record).replace(
      /^- #(\d+)/,
      (_, number: string) => `${green('✔')} ${bold(`#${number}`)}`,
    );
    console.log(`${line}${duration}${identitySuffix}`);
  }
}

// tasks:watch — the live view as a dashboard: spinners on building tasks,
// READY rows still, durations ticking. Redraws every 2 s; Ctrl+C exits.
// Motion means work; stillness means a report is waiting for the conductor.
async function watchLenses(tasksRoot: string): Promise<number> {
  let frame = 0;
  for (;;) {
    process.stdout.write('\x1b[2J\x1b[H');
    const clock = new Date().toLocaleTimeString('en-GB', { hour12: false });
    console.log(
      `${bold('INVAR TASKS')} ${dim(`· ${clock} · refresh 2s · Ctrl+C to exit`)}`,
    );
    console.log('');
    live(tasksRoot, frame);
    console.log('');
    const records = readTaskRecords(tasksRoot);
    const completedCount = records.filter(
      (record) => record.directoryState === 'completed',
    ).length;
    const activeCount = records.filter(
      (record) => record.directoryState === 'active',
    ).length;
    console.log(
      dim(
        `◫ ${activeCount} active (bun run tasks:active) · ✔ ${completedCount} completed (bun run tasks:done)`,
      ),
    );
    frame += 1;
    await Bun.sleep(2000);
  }
}

// tasks:all — the whole system in one screenful: live, active, completed(15).
function allLenses(tasksRoot: string): number {
  live(tasksRoot);
  console.log('');
  activeOnly(tasksRoot);
  console.log('');
  const records = readTaskRecords(tasksRoot);
  const completedCount = records.filter(
    (record) => record.directoryState === 'completed',
  ).length;
  console.log(
    bold(
      `✔ COMPLETED (last ${Math.min(15, completedCount)} of ${completedCount} — bun run tasks:done for all)`,
    ),
  );
  printCompleted(tasksRoot, records, 15);
  return 0;
}

const repositoryRoot = join(import.meta.dir, '..', '..');

const tasksRoot = join(repositoryRoot, '.invar', 'tasks');

if (process.argv.includes('watch')) {
  await watchLenses(tasksRoot);
}

process.exit(
  process.argv.includes('--self-test')
    ? selfTest()
    : process.argv.includes('live')
      ? live(tasksRoot)
      : process.argv.includes('active')
        ? activeOnly(tasksRoot)
        : process.argv.includes('completed')
          ? completedOnly(tasksRoot)
          : process.argv.includes('all')
            ? allLenses(tasksRoot)
            : process.argv.includes('backlog')
              ? backlog(tasksRoot, false)
              : process.argv.includes('write-active')
                ? backlog(tasksRoot, true)
                : report(tasksRoot),
);
