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
// THIS FILE IS ALSO THE SEAM. The in-app tasks dashboard pane
// (src/modules/tasks-dashboard/) imports the exported readers below —
// readTaskRecords, builderStanding, startedAtMilliseconds, landingStamp,
// tasksTreeStamp — so the terminal lenses and the pane read the SAME
// generator. The CLI entry point runs only under `import.meta.main`, so an
// import executes nothing.
//
// POSITIVE CONTROL. `--self-test` builds a throwaway task tree in a temp directory
// containing one planted instance of each signal, runs the same analysis over it, and
// requires every signal to fire. A checker whose only possible output is "clean" is
// indistinguishable from a healthy repo, which is the defect class this repo has now
// found eight times. The control fails loudly and exits non-zero.
//
// invariant: Child synchronized updates commit as one repaint (src/modules/terminal/terminal.invariants.md)

import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
  TasksWatchRenderer,
  type TasksWatchAnimationRow,
} from './TasksWatchRenderer';

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
  /** The folder's task-<n>-<slug>.md file name, so a consumer can open the record. */
  taskFileName: string | null;
  /** The newest brief by modification time, so consumers never guess the round naming form. */
  latestBriefFileName: string | null;
  /** The newest report by modification time, including later-round report names. */
  latestReportFileName: string | null;
  directoryState: TaskState;
  declaredState: string | null;
  taskFileLineCount: number;
  briefCount: number;
  reportCount: number;
  newestBriefMtimeMs: number;
  newestReportMtimeMs: number;
  summaryCount: number;
  namesACommit: boolean;
  priorityGroup: string | null;
  assignedEngine: string | null;
  assignedModel: string | null;
  assignedEffort: string | null;
}

export interface TaskMotionColour {
  readonly ansi: string;
  readonly color: string;
}

export interface TaskMotionFrame extends TaskMotionColour {
  readonly glyph: string;
}

export interface TaskFleetFacts {
  readonly lineDelta: { added: number; removed: number } | null;
  readonly phase: 'exploring' | 'building';
  readonly worktreePath: string | null;
  readonly sessionName: string;
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
export function agentIdentity(record: TaskRecord): string | null {
  if (record.assignedEngine === null) return null;
  // Mirror dispatch.sh's per-engine defaults: a record with no Model/Effort
  // line means the fleet default, never "unknown". Codex effort policy:
  // medium is not allowed; dispatch normalizes it to high, so the view
  // shows the normalized truth rather than the stale record field.
  const codexEngine = record.assignedEngine === 'codex';
  const defaultModel = codexEngine ? '5.6-sol' : 'fable-5';
  const declaredEffort =
    record.assignedEffort ?? (codexEngine ? 'high' : 'default');
  const effort =
    codexEngine && (declaredEffort === 'medium' || declaredEffort === 'default')
      ? 'high'
      : declaredEffort;
  return [
    record.assignedEngine,
    record.assignedModel ?? defaultModel,
    effort,
  ].join('·');
}

export interface DriftFinding {
  signal: DriftSignal;
  taskNumber: number;
  folderName: string;
  directoryState: TaskState;
  detail: string;
}

const CHECKOUT_REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const FLEET_WORKTREE_MARKER = `${sep}.invar${sep}worktrees${sep}`;
const fleetWorktreeMarkerIndex = CHECKOUT_REPOSITORY_ROOT.indexOf(
  FLEET_WORKTREE_MARKER,
);

/** The main Invar checkout that owns `.invar/worktrees/`, even when this script runs in a worktree. */
export const INVAR_FLEET_REPOSITORY_ROOT =
  fleetWorktreeMarkerIndex < 0
    ? CHECKOUT_REPOSITORY_ROOT
    : CHECKOUT_REPOSITORY_ROOT.slice(0, fleetWorktreeMarkerIndex);

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

export function readTaskRecords(tasksRoot: string): TaskRecord[] {
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
      let latestBriefFileName: string | null = null;
      let newestBriefMtimeMs = 0;
      let latestReportFileName: string | null = null;
      let newestReportMtimeMs = 0;
      for (const entry of entries) {
        if (!entry.startsWith('brief-') && !entry.startsWith('report-')) {
          continue;
        }
        try {
          const modificationTimeMilliseconds = statSync(
            join(folderPath, entry),
          ).mtimeMs;
          if (
            entry.startsWith('brief-') &&
            modificationTimeMilliseconds >= newestBriefMtimeMs
          ) {
            latestBriefFileName = entry;
            newestBriefMtimeMs = modificationTimeMilliseconds;
          }
          if (
            entry.startsWith('report-') &&
            modificationTimeMilliseconds >= newestReportMtimeMs
          ) {
            latestReportFileName = entry;
            newestReportMtimeMs = modificationTimeMilliseconds;
          }
        } catch {
          // A concurrent task move can remove one entry between readdir and stat. The next read wins.
        }
      }
      // Bundle and renamed-slug dispatches have no task file in the dispatch
      // folder; meta.json (written by dispatch.sh) is the dispatch-time truth
      // for engine/model/effort, so the view falls back to it.
      let dispatchMeta: {
        engine?: string;
        model?: string;
        effort?: string;
      } | null = null;
      try {
        dispatchMeta = JSON.parse(
          readFileSync(join(folderPath, 'meta.json'), 'utf8'),
        ) as { engine?: string; model?: string; effort?: string };
      } catch {
        dispatchMeta = null;
      }
      records.push({
        taskNumber: Number.parseInt(folderName, 10),
        folderName,
        taskFileName: taskFileName ?? null,
        latestBriefFileName,
        latestReportFileName,
        directoryState,
        declaredState:
          declaredStateLine === undefined
            ? null
            : declaredStateLine.slice('State:'.length).trim(),
        taskFileLineCount:
          taskFileName === undefined ? 0 : taskFileText.split('\n').length,
        briefCount: entries.filter((entry) => entry.startsWith('brief-'))
          .length,
        newestBriefMtimeMs,
        reportCount: entries.filter((entry) => entry.startsWith('report-'))
          .length,
        newestReportMtimeMs,
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
        assignedEngine:
          headerField(taskFileText, 'Engine') ?? dispatchMeta?.engine ?? null,
        assignedModel:
          headerField(taskFileText, 'Model') ?? dispatchMeta?.model ?? null,
        assignedEffort:
          headerField(taskFileText, 'Effort') ?? dispatchMeta?.effort ?? null,
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

export const PRIORITY_ORDER = [
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

// The view files live at the repo root (two levels above tasksRoot), so a root-relative path
// reaches the record from where the view is READ — both by a human and by the markdown preview's
// reference resolver, which tries references against the workspace root first.
function taskRecordLinkPath(record: TaskRecord): string | null {
  if (record.taskFileName === null) return null;
  return `.invar/tasks/${record.directoryState}/${record.folderName}/${record.taskFileName}`;
}

// Every task line names its record as a markdown link, so the generated views are walkable by
// click in the rendered preview. A folder with no task-*.md file has no record to link; its
// label stays plain text rather than linking to a miss.
function linkedTaskLabel(record: TaskRecord, label: string): string {
  const linkPath = taskRecordLinkPath(record);
  return linkPath === null ? label : `[${label}](${linkPath})`;
}

function taskLine(record: TaskRecord): string {
  const stateSuffix =
    record.declaredState !== null &&
    record.declaredState !== 'ACTIVE' &&
    record.declaredState !== 'IN-PROGRESS'
      ? `  [${record.declaredState}]`
      : '';
  const label = record.folderName.replace(/^\d+-/, '');
  return `- #${record.taskNumber} ${linkedTaskLabel(record, label)}${stateSuffix}`;
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
      outputLines.push(
        `- #${record.taskNumber} ${linkedTaskLabel(record, record.folderName)}`,
      );
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

// Whatever the State line carries after COMPLETED — usually the landing commit.
export function completedStateAttachment(record: TaskRecord): string {
  return (
    record.declaredState?.replace(/^COMPLETED\s*[—-]?\s*/, '').trim() ?? ''
  );
}

// One line per completed task: the subject as the short message, and the landing attachment.
function completedLine(record: TaskRecord): string {
  const stateRemainder = completedStateAttachment(record);
  const attachment = stateRemainder.length > 0 ? ` — ${stateRemainder}` : '';
  const label = record.folderName.replace(/^\d+-/, '');
  return `- #${record.taskNumber} ${linkedTaskLabel(record, label)}${attachment}`;
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
  console.log(`  ${statsLine(tasksRoot)}`);

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

  // Task-record links, both polarities (#276). Every task line in both generated views must carry
  // a markdown link whose target exists on disk; and the predicate itself must go red on a line
  // whose link is stripped, or the green above proves nothing.
  const generatedViews =
    readFileSync(activeViewPath(root), 'utf8') +
    readFileSync(completedLogPath(root), 'utf8');
  const renderedTaskLines = generatedViews
    .split('\n')
    .filter((line) => /^- #\d+ /.test(line));
  const linkPattern = /^- #\d+ \[[^\]]+\]\((\.invar\/tasks\/[^)]+)\)/;
  const linklessLines = renderedTaskLines.filter(
    (line) => !linkPattern.test(line),
  );
  const brokenLinkTargets = renderedTaskLines
    .map((line) => linkPattern.exec(line)?.[1])
    .filter(
      (target): target is string =>
        target !== undefined && !existsSync(join(sandbox, target)),
    );
  const strippedLine = renderedTaskLines[0]?.replace(linkPattern, (matched) =>
    matched.replace(/\[([^\]]+)\]\([^)]+\)/, '$1'),
  );
  const stripDetected =
    strippedLine !== undefined && !linkPattern.test(strippedLine);
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
  console.log(
    `  ${linklessLines.length === 0 ? 'PASS' : 'FAIL'}  every rendered task line links its record (${linklessLines.length} linkless)`,
  );
  if (linklessLines.length > 0) failures++;
  console.log(
    `  ${brokenLinkTargets.length === 0 ? 'PASS' : 'FAIL'}  every task-record link target exists (${brokenLinkTargets.length} broken)`,
  );
  if (brokenLinkTargets.length > 0) failures++;
  console.log(
    `  ${stripDetected ? 'PASS' : 'FAIL'}  the link check goes red on a link-stripped line`,
  );
  if (!stripDetected) failures++;

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
export function startedAtMilliseconds(
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

export function formatDuration(milliseconds: number): string {
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
// A calm breath in cool light: the dot swells through three sizes and settles while its colour
// glides teal -> cyan -> blue and back — the Claude Code gradient feel.
// Twelve frames advancing every fifth paint at 30 fps; one breath ~2 s —
// small to medium to full and back, each size holding through two or three
// colour steps so nothing jumps.
export const TASKS_BUILDING_BREATH_FRAMES: readonly TaskMotionFrame[] = [
  { glyph: '·', ansi: '38;5;30', color: '#008787' },
  { glyph: '·', ansi: '38;5;37', color: '#00afaf' },
  { glyph: '•', ansi: '38;5;37', color: '#00afaf' },
  { glyph: '•', ansi: '38;5;44', color: '#00d7d7' },
  { glyph: '•', ansi: '38;5;51', color: '#00ffff' },
  { glyph: '●', ansi: '38;5;51', color: '#00ffff' },
  { glyph: '●', ansi: '38;5;45', color: '#00d7ff' },
  { glyph: '●', ansi: '38;5;39', color: '#00afff' },
  { glyph: '●', ansi: '38;5;45', color: '#00d7ff' },
  { glyph: '•', ansi: '38;5;44', color: '#00d7d7' },
  { glyph: '•', ansi: '38;5;37', color: '#00afaf' },
  { glyph: '·', ansi: '38;5;30', color: '#008787' },
];
export const TASKS_MOTION_PAINTS_PER_STEP = 5;
export const TASKS_BUILDING_MONOCHROME_GLYPHS = ['·', '•', '●', '•'] as const;

// Lines of code, live, as the agents write: each in-progress task's worktree
// diffed against its merge-base with main — committed AND uncommitted edits
// both count, because the point is watching the code grow under the cursor.
//
// The merge-base is recomputed every tick, NOT cached: a builder that merges
// main moves its base forward, and a stale cached base counts every landed
// line since dispatch as the builder's own (2026-07-29: #289 read +5,037
// while its true authored delta was +1,331). For the same reason a worktree
// with an in-flight uncommitted merge (MERGE_HEAD present) is measured
// committed-only — mid-merge working-tree content is main's, not authored.
export function readTaskLineDelta(
  fleetRepositoryRoot: string,
  folderName: string,
): { added: number; removed: number } | null {
  const worktreePath = join(
    fleetRepositoryRoot,
    '.invar',
    'worktrees',
    folderName,
  );
  if (!existsSync(worktreePath)) return null;
  const baseResult = Bun.spawnSync(['git', 'merge-base', 'main', 'HEAD'], {
    cwd: worktreePath,
  });
  const base =
    baseResult.exitCode === 0 ? baseResult.stdout.toString().trim() : null;
  if (base === null || base === '') return null;
  const mergeInFlight =
    Bun.spawnSync(['git', 'rev-parse', '-q', '--verify', 'MERGE_HEAD'], {
      cwd: worktreePath,
    }).exitCode === 0;
  const diffArguments = mergeInFlight
    ? ['git', 'diff', '--shortstat', base, 'HEAD', '--', 'src', 'scripts']
    : ['git', 'diff', '--shortstat', base, '--', 'src', 'scripts'];
  const diffResult = Bun.spawnSync(diffArguments, { cwd: worktreePath });
  const summary = diffResult.stdout.toString();
  const added = /(\d+) insertion/.exec(summary);
  const removed = /(\d+) deletion/.exec(summary);
  if (added === null && removed === null) return { added: 0, removed: 0 };
  return {
    added: added === null ? 0 : Number.parseInt(added[1] ?? '0', 10),
    removed: removed === null ? 0 : Number.parseInt(removed[1] ?? '0', 10),
  };
}

// Deltas refresh on the DATA tick, never per paint — 30 fps must not mean
// 30 git spawns a second. The badge reads the cache; refreshLineDeltas()
// fills it (watch calls it every ~2 s; the static lens once).
const lineDeltaCache = new Map<
  string,
  { added: number; removed: number } | null
>();

function refreshLineDeltas(
  records: TaskRecord[],
  fleetRepositoryRoot = INVAR_FLEET_REPOSITORY_ROOT,
): void {
  // Both polarities: entries are ADDED for current in-progress tasks and
  // REMOVED for tasks that left in-progress. Before 2026-07-29 the cache
  // only grew, so a long-running watch counted every builder it had ever
  // seen ("5 builder(s)" while 2 were live — the count could never
  // decrease until restart).
  const inProgressFolderNames = new Set<string>();
  for (const record of records) {
    if (record.directoryState !== 'in-progress') continue;
    inProgressFolderNames.add(record.folderName);
    lineDeltaCache.set(
      record.folderName,
      readTaskLineDelta(fleetRepositoryRoot, record.folderName),
    );
  }
  for (const cachedFolderName of lineDeltaCache.keys()) {
    if (!inProgressFolderNames.has(cachedFolderName)) {
      lineDeltaCache.delete(cachedFolderName);
    }
  }
}

// THE GATE GLANCE. The merge gate registers its log in /tmp/fleet-watch-gates
// (the same registry fleet-watch consumes). The glance derives, mechanically:
//   phase   — the last `== merge-gate: <phase> ==` banner in the log tail
//   timer   — since the run START. The log FILE is truncated between runs, so
//             birthtime lies for reruns; the watch detects a size DROP (a new
//             run truncating the log) and re-anchors the timer at that moment.
//   verdict — the GATE_EXIT=<n> sentinel, once present.
// Flyweight: one stat + one 16KB tail read per data tick, cached between.
export interface GateGlance {
  phase: string;
  startedAtMilliseconds: number;
  exitCode: number | null;
  finishedAtMilliseconds: number | null;
}
let gateGlanceCache: GateGlance | null = null;
let gateRunAnchor: {
  logPath: string;
  sizeAtLastTick: number;
  startedAtMilliseconds: number;
} | null = null;

function refreshGateGlance(): void {
  gateGlanceCache = null;
  try {
    const registryPath = '/tmp/fleet-watch-gates';
    if (!existsSync(registryPath)) return;
    const registered = readFileSync(registryPath, 'utf8')
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);
    for (let index = registered.length - 1; index >= 0; index -= 1) {
      const logPath = registered[index] ?? '';
      if (!existsSync(logPath)) continue;
      const stats = statSync(logPath);
      if (
        gateRunAnchor === null ||
        gateRunAnchor.logPath !== logPath ||
        stats.size < gateRunAnchor.sizeAtLastTick
      ) {
        // First sighting, or the log shrank: a new run truncated it. Anchor
        // the timer now (birthtime as the cold-start fallback for a log that
        // was never seen larger).
        const coldStart =
          gateRunAnchor === null && stats.birthtimeMs > 0
            ? stats.birthtimeMs
            : Date.now();
        gateRunAnchor = {
          logPath,
          sizeAtLastTick: stats.size,
          startedAtMilliseconds: coldStart,
        };
      } else {
        gateRunAnchor.sizeAtLastTick = stats.size;
      }
      const sliceSize = Math.min(stats.size, 16384);
      const buffer = Buffer.alloc(sliceSize);
      const descriptor = openSync(logPath, 'r');
      readSync(descriptor, buffer, 0, sliceSize, stats.size - sliceSize);
      closeSync(descriptor);
      const tail = buffer.toString('utf8');
      const exitMatch = tail.match(/GATE_EXIT=(\d+)/);
      const banners = [...tail.matchAll(/== merge-gate: ([^=]+?) ==/g)];
      const lastBanner = banners.at(-1)?.[1] ?? 'starting';
      gateGlanceCache = {
        phase: lastBanner.replace(/\s*\(.*$/, '').trim(),
        startedAtMilliseconds: gateRunAnchor.startedAtMilliseconds,
        exitCode: exitMatch ? Number(exitMatch[1]) : null,
        finishedAtMilliseconds: exitMatch ? stats.mtimeMs : null,
      };
      return;
    }
  } catch {
    gateGlanceCache = null;
  }
}

/** Read the fleet gate registry through the same parser used by `tasks:watch`. */
export function readFleetGateGlance(): GateGlance | null {
  refreshGateGlance();
  return gateGlanceCache;
}

function gateBadge(spinnerFrame?: number): string {
  if (gateGlanceCache === null) return '';
  const glance = gateGlanceCache;
  // A FINISHED gate's verdict is a fact about the LAST run, not a claim that
  // this task's commits were covered — a fresh READY delivered after the run
  // must not wear "gate green" as if it were gated (that lie was seen live on
  // #243, 07-29). Say "last gate", say how long ago, and let the conductor
  // judge coverage.
  const finishedAgo =
    glance.finishedAtMilliseconds === null
      ? ''
      : ` ${formatDuration(Date.now() - glance.finishedAtMilliseconds)} ago`;
  if (glance.exitCode === 0)
    return `  ${green(`⛩ last gate green${finishedAgo}`)}`;
  if (glance.exitCode !== null)
    return `  ${red(`⛩ last gate red (exit ${glance.exitCode})${finishedAgo}`)}`;
  const elapsed = formatDuration(Date.now() - glance.startedAtMilliseconds);
  // A running gate flows its OWN gold current — motion says running, and the
  // color says judge, not builder. The ⛩ glyph rides the flow's leading color.
  if (spinnerFrame === undefined) {
    return `  ${paint('38;5;220', '⛩')} ${paint('38;5;220', `gate: ${glance.phase}`)} ${cyan(elapsed)}`;
  }
  const leadingColor =
    TASKS_GATE_RAMP[spinnerFrame % TASKS_GATE_RAMP.length]?.ansi ?? '38;5;220';
  return `  ${paint(leadingColor, '⛩')} ${gradientWord(`gate: ${glance.phase}`, spinnerFrame, TASKS_GATE_RAMP)} ${cyan(elapsed)}`;
}

function fleetDeltaTotals(): {
  added: number;
  removed: number;
  builders: number;
} {
  let added = 0;
  let removed = 0;
  let builders = 0;
  for (const delta of lineDeltaCache.values()) {
    if (delta === null) continue;
    builders += 1;
    added += delta.added;
    removed += delta.removed;
  }
  return { added, removed, builders };
}

function lineDeltaBadge(folderName: string): string {
  const delta = lineDeltaCache.get(folderName) ?? null;
  if (delta === null) return '';
  if (delta.added === 0 && delta.removed === 0) return dim('  ±0');
  const parts = [];
  if (delta.added > 0)
    parts.push(rollingBadge(`added-${folderName}`, delta.added, '+', green));
  if (delta.removed > 0)
    parts.push(rollingBadge(`removed-${folderName}`, delta.removed, '-', red));
  return `  ${parts.join(' ')}`;
}

// Odometer numbers: when a tracked value changes, the displayed value ROLLS
// toward it over ~half a second (ease-out: 20% of the remaining gap per
// paint, minimum 1), glowing bright while in motion. A number seen for the
// first time snaps — only CHANGES animate.
const numberTweens = new Map<string, number>();

// Change pops: when a tracked value JUMPS, the jump itself appears beside the
// number ("+37") and fades over ~2 s — bold, then normal, then dim, then
// gone. A paint-frame clock drives the decay; the static lens never pops.
let currentPaintFrame = -1;
const targetsSeen = new Map<string, number>();
const recentPops = new Map<string, { delta: number; atFrame: number }>();
const POP_LIFETIME_FRAMES = 60;

function notePop(key: string, target: number): void {
  const seen = targetsSeen.get(key);
  targetsSeen.set(key, target);
  if (seen === undefined || seen === target || currentPaintFrame < 0) return;
  recentPops.set(key, { delta: target - seen, atFrame: currentPaintFrame });
}

function popSuffix(key: string): string {
  const pop = recentPops.get(key);
  if (pop === undefined || currentPaintFrame < 0) return '';
  const age = currentPaintFrame - pop.atFrame;
  if (age > POP_LIFETIME_FRAMES) {
    recentPops.delete(key);
    return '';
  }
  const signed = pop.delta > 0 ? `+${pop.delta}` : String(pop.delta);
  if (age < POP_LIFETIME_FRAMES / 3) return ` ${paint('1;38;5;51', signed)}`;
  if (age < (POP_LIFETIME_FRAMES * 2) / 3)
    return ` ${paint('38;5;44', signed)}`;
  return ` ${dim(signed)}`;
}

function rollingNumber(
  key: string,
  target: number,
): {
  shown: number;
  rolling: boolean;
} {
  const previous = numberTweens.get(key);
  if (previous === undefined || previous === target) {
    numberTweens.set(key, target);
    return { shown: target, rolling: false };
  }
  const gap = target - previous;
  const step = Math.sign(gap) * Math.max(1, Math.floor(Math.abs(gap) * 0.2));
  const shown = Math.abs(gap) <= 1 ? target : previous + step;
  numberTweens.set(key, shown);
  return { shown, rolling: shown !== target };
}

function rollingBadge(
  key: string,
  target: number,
  prefixText: string,
  colour: (t: string) => string,
): string {
  notePop(key, target);
  const { shown, rolling } = rollingNumber(key, target);
  const rendered = `${prefixText}${shown.toLocaleString('en-US')}`;
  return (
    (rolling ? paint('1;38;5;51', rendered) : colour(rendered)) + popSuffix(key)
  );
}

// The word itself carries the current: a cool gradient flows through the
// letters, one step per spinner advance — Claude Code's shimmer, in teal.
export const TASKS_BUILDING_RAMP: readonly TaskMotionColour[] = [
  { ansi: '38;5;30', color: '#008787' },
  { ansi: '38;5;37', color: '#00afaf' },
  { ansi: '38;5;44', color: '#00d7d7' },
  { ansi: '38;5;51', color: '#00ffff' },
  { ansi: '38;5;45', color: '#00d7ff' },
  { ansi: '38;5;39', color: '#00afff' },
];

// Exploring wears quieter weather: white through light blue into navy grey.
// Reading is motion too, but it should not shout like building does.
export const TASKS_EXPLORING_RAMP: readonly TaskMotionColour[] = [
  { ansi: '38;5;231', color: '#ffffff' },
  { ansi: '38;5;189', color: '#d7d7ff' },
  { ansi: '38;5;153', color: '#afd7ff' },
  { ansi: '38;5;110', color: '#87afd7' },
  { ansi: '38;5;103', color: '#8787af' },
  { ansi: '38;5;60', color: '#5f5f87' },
];

// Exploring's icon is a compass needle sweeping the points — a builder
// finding its bearings before the first edit.
export const TASKS_EXPLORING_GLYPHS = [
  '↑',
  '↗',
  '→',
  '↘',
  '↓',
  '↙',
  '←',
  '↖',
] as const;

// The gate flows gold — a torii's color, and unmistakably not a builder.
// Three motions, three currents: teal builds, white-navy reads, gold judges.
export const TASKS_GATE_RAMP: readonly TaskMotionColour[] = [
  { ansi: '38;5;178', color: '#d7af00' },
  { ansi: '38;5;214', color: '#ffaf00' },
  { ansi: '38;5;220', color: '#ffd700' },
  { ansi: '38;5;221', color: '#ffd75f' },
  { ansi: '38;5;214', color: '#ffaf00' },
  { ansi: '38;5;172', color: '#d78700' },
];

function gradientWord(
  word: string,
  shift: number,
  ramp: readonly TaskMotionColour[] = TASKS_BUILDING_RAMP,
): string {
  return word
    .split('')
    .map((letter, index) =>
      paint(ramp[(index + shift) % ramp.length]?.ansi ?? '38;5;44', letter),
    )
    .join('');
}

// Folders whose worktree has shown at least one changed line this session —
// the sticky exploring→building transition.
const firstEditSeen = new Set<string>();

/** One in-progress task's fleet-only facts, all anchored to the main Invar checkout. */
export function readTaskFleetFacts(
  fleetRepositoryRoot: string,
  record: TaskRecord,
): TaskFleetFacts {
  const lineDelta =
    record.directoryState === 'in-progress'
      ? readTaskLineDelta(fleetRepositoryRoot, record.folderName)
      : null;
  if (lineDelta !== null && lineDelta.added + lineDelta.removed > 0) {
    firstEditSeen.add(record.folderName);
  }
  const worktreePath = join(
    fleetRepositoryRoot,
    '.invar',
    'worktrees',
    record.folderName,
  );
  return {
    lineDelta,
    phase: firstEditSeen.has(record.folderName) ? 'building' : 'exploring',
    worktreePath: existsSync(worktreePath) ? worktreePath : null,
    sessionName: `invar/${record.folderName}`,
  };
}

// The round stamp from a task's meta.json, written by round-brief.sh at the
// filing act. Absent (or unreadable) for round-1 tasks and pre-round history.
export function roundStamp(
  tasksRoot: string,
  record: TaskRecord,
): { round: number; roundBriefedAtMs: number } | null {
  try {
    const metaPath = join(
      tasksRoot,
      record.directoryState,
      record.folderName,
      'meta.json',
    );
    if (!existsSync(metaPath)) return null;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (
      typeof meta.round === 'number' &&
      typeof meta.roundBriefedAtMs === 'number'
    ) {
      return { round: meta.round, roundBriefedAtMs: meta.roundBriefedAtMs };
    }
    return null;
  } catch {
    return null;
  }
}

// ROUNDS AND READINESS, the one rule. Round 1 is dispatch.sh's act; later
// rounds are round-brief.sh's, which stamps meta.json (round + roundBriefedAtMs)
// AT FILING TIME. The stamp is the authoritative anchor: a report newer than it
// is READY, older is an unanswered round. A backfilled brief file cannot demote
// a delivered report, because the anchor is the filing act, not a file mtime.
// Folders without a stamp fall back to newest-brief mtime (pre-round history).
// Exported so the in-app dashboard paints the same standing the live lens does.
export function builderStanding(
  tasksRoot: string,
  record: TaskRecord,
): { round: number; ready: boolean } {
  const stamp = roundStamp(tasksRoot, record);
  const round = stamp?.round ?? Math.max(1, record.briefCount);
  const roundAnchorMs = stamp?.roundBriefedAtMs ?? record.newestBriefMtimeMs;
  return {
    round,
    ready: record.reportCount > 0 && record.newestReportMtimeMs > roundAnchorMs,
  };
}

// The landing facts a completed task's meta.json carries (written at landing).
export function landingStamp(
  tasksRoot: string,
  record: TaskRecord,
): { landedAt: string | null; durationMinutes: number | null } {
  try {
    const metaPath = join(
      tasksRoot,
      record.directoryState,
      record.folderName,
      'meta.json',
    );
    if (!existsSync(metaPath)) return { landedAt: null, durationMinutes: null };
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as {
      landedAt?: string;
      durationMinutes?: number;
    };
    return {
      landedAt: typeof meta.landedAt === 'string' ? meta.landedAt : null,
      durationMinutes:
        typeof meta.durationMinutes === 'number' ? meta.durationMinutes : null,
    };
  } catch {
    return { landedAt: null, durationMinutes: null };
  }
}

function live(
  tasksRoot: string,
  spinnerFrame?: number,
  preloadedRecords?: TaskRecord[],
  outputLine: (line: string) => void = (line) => console.log(line),
  outputAnimatedLine?: (
    lineForAnimationFrame: (animationFrame: number) => string,
  ) => void,
): number {
  const allRecords = preloadedRecords ?? readTaskRecords(tasksRoot);
  if (preloadedRecords === undefined) {
    refreshLineDeltas(allRecords);
    refreshGateGlance();
  }
  const records = allRecords
    .filter((record) => record.directoryState === 'in-progress')
    .sort(byNumberDescending);
  if (records.length === 0) {
    outputLine('IN-PROGRESS: none.');
    return 0;
  }
  outputLine(bold(`⛭ IN-PROGRESS (${records.length})`));
  for (const record of records) {
    // ROUNDS. One rule for the CLI and the pane — see builderStanding above.
    const { round, ready } = builderStanding(tasksRoot, record);
    const roundSuffix =
      round > 1 ? ` ${paint('38;5;179', `round ${round}`)}` : '';
    // EXPLORING vs BUILDING. Until the worktree diff shows one changed line,
    // the builder is READING — records, code, the brief. The first ±line flips
    // the word to building, stickily (a later revert to ±0 does not demote it;
    // firstEditSeen remembers per watch session). Each phase wears its own
    // gradient — building in the teal current, exploring in white-to-navy —
    // and the breathing glyph rides its phase's ramp, icon and text as one.
    const delta = lineDeltaCache.get(record.folderName) ?? null;
    const hasEdits = delta !== null && delta.added + delta.removed > 0;
    if (hasEdits) firstEditSeen.add(record.folderName);
    const exploring = !firstEditSeen.has(record.folderName);
    const phaseWord = exploring ? 'exploring' : 'building';
    const phaseRamp = exploring ? TASKS_EXPLORING_RAMP : TASKS_BUILDING_RAMP;
    const startedAt = startedAtMilliseconds(tasksRoot, record);
    const identity = agentIdentity(record);
    const identitySuffix = identity === null ? '' : `  ${dim(identity)}`;
    const lineDeltaSuffix = lineDeltaBadge(record.folderName);
    const lineForAnimationFrame = (currentAnimationFrame?: number): string => {
      const animationFrame = currentAnimationFrame ?? 0;
      const breath =
        currentAnimationFrame === undefined
          ? null
          : (TASKS_BUILDING_BREATH_FRAMES[
              animationFrame % TASKS_BUILDING_BREATH_FRAMES.length
            ] ?? null);
      const phaseGlyph =
        breath === null
          ? paint(exploring ? '38;5;153' : '38;5;45', exploring ? '➤' : '●')
          : exploring
            ? paint(
                TASKS_EXPLORING_RAMP[
                  animationFrame % TASKS_EXPLORING_RAMP.length
                ]?.ansi ?? '38;5;153',
                TASKS_EXPLORING_GLYPHS[
                  animationFrame % TASKS_EXPLORING_GLYPHS.length
                ] ?? '➤',
              )
            : paint(
                breath.ansi,
                colourEnabled
                  ? breath.glyph
                  : (TASKS_BUILDING_MONOCHROME_GLYPHS[
                      animationFrame % TASKS_BUILDING_MONOCHROME_GLYPHS.length
                    ] ?? breath.glyph),
              );
      const statusBadge = ready
        ? `${green('◉ READY')}${roundSuffix}${gateGlanceCache !== null ? gateBadge(currentAnimationFrame) : green(' — awaiting landing')}`
        : `${phaseGlyph} ${
            currentAnimationFrame === undefined
              ? paint(exploring ? '38;5;153' : '38;5;44', phaseWord)
              : gradientWord(phaseWord, animationFrame, phaseRamp)
          }${roundSuffix}`;
      const runningFor =
        startedAt === null
          ? ''
          : `  ${cyan(formatDuration(Date.now() - startedAt))}`;
      return `     ${statusBadge}${runningFor}${lineDeltaSuffix}${identitySuffix}`;
    };
    const rowAnimates =
      !ready || (gateGlanceCache !== null && gateGlanceCache.exitCode === null);
    // Two-line row: the name owns its line; the status lives under it — the
    // row stays whole on narrow screens instead of wrapping mid-badge.
    outputLine(
      `  ${bold(`#${record.taskNumber}`)} ${record.folderName.replace(/^\d+-/, '')}`,
    );
    if (rowAnimates && outputAnimatedLine !== undefined) {
      outputAnimatedLine((animationFrame) =>
        lineForAnimationFrame(animationFrame),
      );
    } else {
      outputLine(lineForAnimationFrame(spinnerFrame));
    }
    outputLine(
      paint('38;5;240', `       tmux attach -t invar/${record.folderName}`),
    );
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

// ---- Stats: velocity, commits, code size --------------------------------
// Cheap facts a glance deserves. Each is one spawn; the watch loop samples
// the expensive ones once a minute, not per frame.

function gitNumber(args: string[]): number | null {
  const result = Bun.spawnSync(['git', ...args], {
    cwd: join(import.meta.dir, '..', '..'),
  });
  const value = Number.parseInt(result.stdout.toString().trim(), 10);
  return Number.isNaN(value) ? null : value;
}

function commitsToday(): number | null {
  return gitNumber(['rev-list', '--count', '--since=00:00', 'HEAD']);
}

function sourceLineCount(): number | null {
  const files = Bun.spawnSync(['git', 'ls-files', 'src'], {
    cwd: join(import.meta.dir, '..', '..'),
  })
    .stdout.toString()
    .split('\n')
    .filter((line) => line.endsWith('.ts'));
  let total = 0;
  for (const file of files) {
    try {
      const text = readFileSync(
        join(import.meta.dir, '..', '..', file),
        'utf8',
      );
      total += text.split('\n').length;
    } catch {
      // a file listed but unreadable does not sink the count
    }
  }
  return files.length === 0 ? null : total;
}

function landedTodayStats(tasksRoot: string): {
  landedToday: number;
  medianMinutes: number | null;
} {
  const today = new Date().toISOString().slice(0, 10);
  const durations: number[] = [];
  let landedToday = 0;
  for (const record of readTaskRecords(tasksRoot)) {
    if (record.directoryState !== 'completed') continue;
    const { landedAt, durationMinutes } = landingStamp(tasksRoot, record);
    if (landedAt?.slice(0, 10) === today) {
      landedToday += 1;
      if (durationMinutes !== null) durations.push(durationMinutes);
    }
  }
  durations.sort((left, right) => left - right);
  const medianMinutes =
    durations.length === 0
      ? null
      : (durations[Math.floor(durations.length / 2)] ?? null);
  return { landedToday, medianMinutes };
}

function statsLine(tasksRoot: string): string {
  const { landedToday, medianMinutes } = landedTodayStats(tasksRoot);
  const commits = commitsToday();
  const lines = sourceLineCount();
  const parts = [
    `⚡${landedToday} landed today${medianMinutes === null ? '' : ` (median ${medianMinutes}m)`}`,
    commits === null ? null : `⎘ ${commits} commits today`,
    lines === null ? null : `≡ ${lines.toLocaleString('en-US')} src lines`,
  ].filter((part): part is string => part !== null);
  return parts.join(dim('  ·  '));
}

// tasks:watch — the live view as a dashboard: building marks advance only on
// data samples, READY rows stay still, and unchanged rows produce no bytes.
// Ctrl+C exits.
// Motion means work; stillness means a report is waiting for the conductor.
// Flyweight for the watch: work is proportional to what CHANGED, not to the
// clock. A seven-stat mtime probe decides whether the task tree is re-read;
// the 95k-line source count recomputes only when the commit count moves
// (a landing), never on schedule.
export function tasksTreeStamp(tasksRoot: string): string {
  const parts: string[] = [];
  for (const state of TASK_STATES) {
    try {
      parts.push(String(statSync(join(tasksRoot, state)).mtimeMs));
    } catch {
      parts.push('0');
    }
  }
  try {
    for (const folder of readdirSync(join(tasksRoot, 'in-progress'))) {
      parts.push(
        String(statSync(join(tasksRoot, 'in-progress', folder)).mtimeMs),
      );
    }
  } catch {
    // no in-progress directory yet
  }
  return parts.join(':');
}

async function watchLenses(tasksRoot: string): Promise<number> {
  // Deltas are measured against the moment the watch started: "what grew
  // while you were looking". The expensive samples refresh once a minute.
  const baselineCommits = commitsToday();
  const baselineLines = sourceLineCount();
  const baselineLanded = landedTodayStats(tasksRoot).landedToday;
  let sampledCommits = baselineCommits;
  let sampledLines = baselineLines;
  const tasksWatchRenderer = new TasksWatchRenderer.Class();
  const restoreScreen = (): void => {
    tasksWatchRenderer.dispose();
    process.stdout.write(TasksWatchRenderer.Class.restoreScreen());
    process.exit(0);
  };
  process.on('SIGINT', restoreScreen);
  process.on('SIGTERM', restoreScreen);
  const DATA_MILLISECONDS = 2_000;
  const STATS_MILLISECONDS = 60_000;
  let cachedRecords = readTaskRecords(tasksRoot);
  let cachedLanded = baselineLanded;
  let lastTreeStamp = tasksTreeStamp(tasksRoot);
  let nextStatsSample = performance.now() + STATS_MILLISECONDS;
  let firstFrame = true;
  for (;;) {
    const stamp = tasksTreeStamp(tasksRoot);
    if (stamp !== lastTreeStamp) {
      lastTreeStamp = stamp;
      cachedRecords = readTaskRecords(tasksRoot);
      cachedLanded = landedTodayStats(tasksRoot).landedToday;
    }
    // Builder diffs always refresh on the data tick. The worktrees are where
    // the motion is, and this remains one cached-base spawn per builder.
    refreshLineDeltas(cachedRecords);
    refreshGateGlance();
    if (performance.now() >= nextStatsSample) {
      nextStatsSample = performance.now() + STATS_MILLISECONDS;
      const commitsNow = commitsToday();
      if (commitsNow !== sampledCommits) {
        sampledCommits = commitsNow;
        sampledLines = sourceLineCount(); // only when a landing moved main
      }
    }
    currentPaintFrame = tasksWatchRenderer.animationFrame;
    const frameLines: string[] = [];
    const animationRows: TasksWatchAnimationRow[] = [];
    const animatedLineRenderers: Array<(animationFrame: number) => string> = [];
    const outputLine = (line: string): void => {
      frameLines.push(line);
    };
    const outputAnimatedLine = (
      lineForAnimationFrame: (animationFrame: number) => string,
    ): void => {
      animationRows.push({
        rowIndex: frameLines.length,
        line: lineForAnimationFrame(tasksWatchRenderer.animationFrame),
      });
      animatedLineRenderers.push(lineForAnimationFrame);
      frameLines.push(animationRows.at(-1)?.line ?? '');
    };
    const clock = new Date().toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const fleet = fleetDeltaTotals();
    outputLine(
      `${bold('INVAR TASKS')} ${dim(`· ${clock} · 60fps motion · ledger ticks · Ctrl+C to exit`)}`,
    );
    outputLine(
      `  ${bold('tonight')} ${rollingBadge('fleet-added', fleet.added, '+', green)} ${rollingBadge('fleet-removed', fleet.removed, '-', red)} ${dim(`lines in flight · ${fleet.builders} builder(s)`)}`,
    );
    outputLine('');
    live(
      tasksRoot,
      tasksWatchRenderer.animationFrame,
      cachedRecords,
      outputLine,
      outputAnimatedLine,
    );
    outputLine('');
    const completedCount = cachedRecords.filter(
      (record) => record.directoryState === 'completed',
    ).length;
    const activeCount = cachedRecords.filter(
      (record) => record.directoryState === 'active',
    ).length;
    const delta = (now: number | null, base: number | null): string =>
      now !== null && base !== null && now > base
        ? green(` +${now - base}`)
        : '';
    outputLine(
      dim(`◫ ${activeCount} active · ✔ ${completedCount} completed`) +
        dim('  ·  ') +
        `⚡${cachedLanded} landed today${delta(cachedLanded, baselineLanded)}` +
        dim('  ·  ') +
        `⎘ ${rollingBadge('commits', sampledCommits ?? 0, '', (t) => t)} commits${delta(sampledCommits, baselineCommits)}` +
        dim('  ·  ') +
        `≡ ${rollingBadge('src-lines', sampledLines ?? 0, '', (t) => t)} src lines${delta(sampledLines, baselineLines)}`,
    );
    const animationRowsForFrame =
      animationRows.length === 0
        ? null
        : (animationFrame: number): readonly TasksWatchAnimationRow[] => {
            for (
              let animationRowIndex = 0;
              animationRowIndex < animationRows.length;
              animationRowIndex += 1
            ) {
              const animationRow = animationRows[animationRowIndex];
              const animatedLineRenderer =
                animatedLineRenderers[animationRowIndex];
              if (
                animationRow === undefined ||
                animatedLineRenderer === undefined
              ) {
                continue;
              }
              animationRow.line = animatedLineRenderer(animationFrame);
            }
            return animationRows;
          };
    tasksWatchRenderer.renderDataFrame(
      frameLines,
      animationRowsForFrame,
      firstFrame,
    );
    firstFrame = false;
    await Bun.sleep(DATA_MILLISECONDS);
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

// The CLI entry point. Guarded so importing the readers above (the in-app
// dashboard's seam) executes nothing — no lens run, no process.exit.
if (import.meta.main) {
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
}
