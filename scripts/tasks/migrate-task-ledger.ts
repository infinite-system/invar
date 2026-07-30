/**
 * Build `.invar/tasks/` — one folder per task, four state directories, everything dated.
 *
 * WHY THIS EXISTS. The complete task record used to live in the conductor's session state (every
 * mechanism, measurement and refutation) while the durable record, `project.tasks.md`, was a
 * hand-maintained mirror seventeen tasks behind. The detailed record was ephemeral and the durable one
 * was partial — the same defect this project keeps finding in its own instruments.
 *
 * `agent-dispatches/<n>-<slug>/` already held brief/meta/report per dispatched task. Building a second
 * home beside it would recreate the split, so this MIGRATES rather than duplicates: dispatch folders
 * move in, and `scripts/fleet/dispatch.sh` writes here afterwards.
 *
 * IDEMPOTENT and NON-DESTRUCTIVE. Re-running skips what already exists and never deletes; the repo
 * rule is that things are parked, not removed. Run with --dry-run to see the plan first.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import { execSync } from 'node:child_process';
const repositoryRoot = execSync('git rev-parse --show-toplevel', {
  encoding: 'utf8',
}).trim();

const tasksRoot = join(repositoryRoot, '.invar', 'tasks');

const dispatchRoot = join(repositoryRoot, 'agent-dispatches');

const dryRun = process.argv.includes('--dry-run');

/** The four states a task can occupy. A task lives in exactly one. */
const STATE_DIRECTORIES = ['todo', 'live', 'done', 'retired'] as const;

type TaskState = (typeof STATE_DIRECTORIES)[number];

interface TaskRecord {
  number: number;
  /** 3-4 words minimum — the folder name must say what the task IS without opening it. */
  descriptiveName: string;
  state: TaskState;
  subject: string;
  /** Landing commit for done tasks, branch for live ones. */
  resolution?: string;
}

/**
 * The task table. `descriptiveName` is deliberately longer than the old dispatch slugs: `fold-flyweight`
 * became `folded-editing-scale-invariance`, because a folder name is read far more often than it is
 * typed and the old slugs required opening the brief to learn what they meant.
 */
const TASKS: TaskRecord[] = [
  // ---- LIVE ----
  {
    number: 204,
    descriptiveName: 'drive-tool-step-model-and-targeting',
    state: 'live',
    subject:
      'drive requires every action to repaint, and targets cells by number',
    resolution: 'fleet/204-drive-tool',
  },
  {
    number: 208,
    descriptiveName: 'git-commit-collapse-wiring-gap',
    state: 'live',
    subject:
      'an expanded commit cannot be folded back — UI calls expand() where it should toggle()',
    resolution: 'fleet/208-commit-collapse',
  },

  // ---- DONE (2026-07-28) ----
  {
    number: 186,
    descriptiveName: 'max-width-rescan-at-500k',
    state: 'done',
    subject:
      'every edit lengthening the widest line rescanned the whole document',
  },
  {
    number: 187,
    descriptiveName: 'wheel-at-clamp-unreachable-wait',
    state: 'done',
    subject:
      'Drive and smoke-editor-harness awaited a repaint the clamp cannot produce',
  },
  {
    number: 188,
    descriptiveName: 'frame-ordinal-wait-regressions',
    state: 'done',
    subject:
      '#168 regressed three harnesses; its bycatch was its own regressions',
  },
  {
    number: 189,
    descriptiveName: 'gate-reds-population-separation',
    state: 'done',
    subject:
      'diff horizontal bar 28 to 44, and reserved-chord Quick Open in the pool',
  },
  {
    number: 191,
    descriptiveName: 'terminal-stage-compound-predicate',
    state: 'done',
    subject:
      'the prompt was visibly on the grid and the compound predicate timed out anyway',
  },
  {
    number: 192,
    descriptiveName: 'residual-harness-wait-audit',
    state: 'done',
    subject:
      'five residual waits from the mass conversion — one audit, not five fixes',
  },
  {
    number: 194,
    descriptiveName: 'reserved-chord-fixture-self-contained',
    state: 'done',
    subject: 'Quick Open timeout was an inherited-PATH difference, not a race',
    resolution: '42a3455',
  },
  {
    number: 196,
    descriptiveName: 'editor-flyweight-edit-path',
    state: 'done',
    subject:
      '500k editing and loading slow in the real app; #169 decline reversed',
  },
  {
    number: 197,
    descriptiveName: 'lsp-size-budget-guards-reads',
    state: 'done',
    subject:
      'the budget guarded writes but not reads; hover queried a suppressed 37 MB document',
  },
  {
    number: 201,
    descriptiveName: 'quick-open-silent-empty-enumeration',
    state: 'done',
    subject:
      'Quick Open found nothing in a non-git folder and could not say so',
    resolution: '111034d',
  },
  {
    number: 195,
    descriptiveName: 'start-script-drops-path-argument',
    state: 'done',
    subject: 'bun run start <path> silently ignored the path',
    resolution: '111034d',
  },
  {
    number: 203,
    descriptiveName: 'folded-editing-scale-invariance',
    state: 'done',
    subject:
      'folded editing, scale-invariant fold toggles, and the flat-file first-paint regression',
    resolution: 'f73dc41',
  },
  {
    number: 206,
    descriptiveName: 'gate-retry-population-repair',
    state: 'done',
    subject: 'two unreachable flake waits repaired; scrollbars not reproduced',
    resolution: '55cacb8',
  },
  {
    number: 207,
    descriptiveName: 'silently-discarded-user-input',
    state: 'done',
    subject: 'two surfaces accepted input and discarded it without a word',
    resolution: '111034d',
  },

  // ---- TODO: user-directed ----
  {
    number: 205,
    descriptiveName: 'gate-launch-time-and-memory-ceiling',
    state: 'todo',
    subject:
      'nothing gates first paint or peak RSS; prefer an RSS ceiling over milliseconds',
  },
  {
    number: 202,
    descriptiveName: 'tab-reactivation-rereads-whole-file',
    state: 'todo',
    subject: 'the flyweight covers storage but not the switch interaction',
  },
  {
    number: 199,
    descriptiveName: 'find-reveal-blank-target-line',
    state: 'todo',
    subject: 'Find reveal paints the active target line blank at 500k',
  },

  // ---- TODO: verification integrity ----
  {
    number: 90,
    descriptiveName: 'harness-diagnostic-provenance-guard',
    state: 'todo',
    subject:
      'shared artifacts/tui.log lets runs read each other; stale lines satisfy assertions',
  },
  {
    number: 177,
    descriptiveName: 'gate-retry-ratchet-and-floor',
    state: 'todo',
    subject: 'one retry per gate, never the same smoke twice',
  },
  {
    number: 179,
    descriptiveName: 'gate-compares-numbers-to-itself',
    state: 'todo',
    subject:
      'the gate reports its own numbers and never compares them to history',
  },
  {
    number: 183,
    descriptiveName: 'quiet-lock-degrades-and-runs-anyway',
    state: 'todo',
    subject:
      'concurrent measurement is not safe and the conductor assumed it was',
  },
  {
    number: 180,
    descriptiveName: 'no-smoke-runs-on-macos',
    state: 'todo',
    subject:
      'CRITICAL: the harness PTY is FFI-blocked; the gate never ran on the host machine',
  },
  {
    number: 181,
    descriptiveName: 'terminal-factory-platform-untested',
    state: 'todo',
    subject: 'the darwin arm never executes on Linux',
  },
  {
    number: 182,
    descriptiveName: 'collect-until-false-success-wait',
    state: 'todo',
    subject: 'resolves with partial text on timeout — a false-success wait',
  },
  {
    number: 105,
    descriptiveName: 'unrun-smokes-cannot-report-rot',
    state: 'todo',
    subject: 'about twenty full-tmux smokes the gate skips by default',
  },
  {
    number: 190,
    descriptiveName: 'pool-membership-must-be-earned',
    state: 'todo',
    subject: 'a smoke may not enter the concurrent pool by default',
  },
  {
    number: 75,
    descriptiveName: 'in-gate-app-crash-undiagnosed',
    state: 'todo',
    subject: 'exit 1 with no diagnosable reason; instrument first',
  },

  // ---- TODO: known flakes ----
  {
    number: 167,
    descriptiveName: 'audio-narration-pool-timeout',
    state: 'todo',
    subject: 'still times out in the parallel pool after #141 closed it',
  },
  {
    number: 164,
    descriptiveName: 'panel-chrome-ascii-tier-timeout',
    state: 'todo',
    subject: 'expand-heading condition times out in the ASCII tier',
  },
  {
    number: 176,
    descriptiveName: 'tabs-harness-retry-only-pass',
    state: 'todo',
    subject: 'passed only on retry on the #172 gate',
  },
  {
    number: 124,
    descriptiveName: 'terminal-follow-escape-intermittent',
    state: 'todo',
    subject:
      'Escape-cancellation intermittent is worsening; fails 3/3 on clean main',
  },
  {
    number: 109,
    descriptiveName: 'agent-permissions-quiet-tail-flake',
    state: 'todo',
    subject: 'flakes inside the serialized quiet tail — not a load flake',
  },
  {
    number: 193,
    descriptiveName: 'fold-dense-contract-row-shortfall',
    state: 'todo',
    subject: '100k fold-dense contract travelled 995 rows once',
  },
  {
    number: 174,
    descriptiveName: 'markdown-preview-omits-ragged-table',
    state: 'todo',
    subject: 'omitted a ragged table that was visible in source',
  },
  {
    number: 173,
    descriptiveName: 'grid-predicates-assume-contiguous-text',
    state: 'todo',
    subject: 'assert contiguous strings that wrapping legitimately splits',
  },
  {
    number: 198,
    descriptiveName: 'selection-harness-pre-satisfied-wheels',
    state: 'todo',
    subject: 'two wheel predicates pass without observing the wheel at all',
  },
  {
    number: 165,
    descriptiveName: 'glide-canary-zero-margin-boundary',
    state: 'todo',
    subject: '9 rows against an 8-row budget',
  },
  {
    number: 166,
    descriptiveName: 'latency-instrument-crashes-at-one-sample',
    state: 'todo',
    subject:
      'crashes at LATENCY_SAMPLE_COUNT=1 instead of reporting unmeasurable',
  },
  {
    number: 200,
    descriptiveName: 'input-byte-latency-above-baseline',
    state: 'todo',
    subject:
      'p50 8-12 ms against a 4.928 ms reviewed baseline in 11 of 11 gates',
  },

  // ---- TODO: performance and behaviour ----
  {
    number: 175,
    descriptiveName: 'attribute-boot-time-irreducible-cost',
    state: 'todo',
    subject: 'attribute the ~300 ms boot and decide what is irreducible',
  },
  {
    number: 185,
    descriptiveName: 'behavioral-contracts-shared-fixtures',
    state: 'todo',
    subject: 'behavioral-contracts is 62% of the gate; needs shared fixtures',
  },
  {
    number: 153,
    descriptiveName: 'overlay-horizontal-fling-slower',
    state: 'todo',
    subject:
      '2.75x slower in overlays; the one-profile fix never reached ScrollableTextViewport',
  },
  {
    number: 86,
    descriptiveName: 'wheel-first-frame-fixed-latency',
    state: 'todo',
    subject:
      '~85 ms regardless of item count — decide if that is the intended feel',
  },
  {
    number: 160,
    descriptiveName: 'context-menu-wheel-double-dispatch',
    state: 'todo',
    subject: 'one physical wheel produces two impulses',
  },
  {
    number: 94,
    descriptiveName: 'popup-arrow-keys-fall-through',
    state: 'todo',
    subject:
      'Left/Right should reach caret movement when there is no drill target',
  },
  {
    number: 104,
    descriptiveName: 'editor-glide-monotonicity-deferred',
    state: 'todo',
    subject: 'reversal check when convenient; velocity work only on trigger',
  },
  {
    number: 140,
    descriptiveName: 'real-terminal-freeze-capture',
    state: 'todo',
    subject: 'the harness cannot see the user multi-second stall',
  },
  {
    number: 154,
    descriptiveName: 'perf-baselines-reach-no-verdict',
    state: 'todo',
    subject:
      'soft, so its two measurement failures and its leaked editor reach no verdict',
  },

  // ---- TODO: architecture and hygiene ----
  {
    number: 114,
    descriptiveName: 'modularity-umbrella-provider-runtime',
    state: 'todo',
    subject: 'LSP as provider, terminal as runtime, agents via tasks and MCP',
  },
  {
    number: 122,
    descriptiveName: 'editor-becomes-final-contributor',
    state: 'todo',
    subject:
      'source-text view as default editor-column occupant; capstone, after #114',
  },
  {
    number: 46,
    descriptiveName: 'terminal-observer-reverse-presence',
    state: 'todo',
    subject: 'design doc exists, no branch cut; pairs with #114',
  },
  {
    number: 35,
    descriptiveName: 'structure-navigator-plugin-pane',
    state: 'todo',
    subject: 'first new plugin citizen',
  },
  {
    number: 31,
    descriptiveName: 'getter-census-scoped-invalidation',
    state: 'todo',
    subject: 'post-campaign getter census',
  },
  {
    number: 62,
    descriptiveName: 'parameter-count-ports-object-sweep',
    state: 'todo',
    subject: 'more than three args becomes a ports object; hot paths exempt',
  },
  {
    number: 59,
    descriptiveName: 'prettier-format-gate-and-reformat',
    state: 'todo',
    subject: '80-char width, uniform indent, format gate, one-shot reformat',
  },
  {
    number: 136,
    descriptiveName: 'shared-scale-fixture-corpus-cache',
    state: 'todo',
    subject: 'stop re-rolling large files per instrument',
  },
  {
    number: 77,
    descriptiveName: 'coverage-ratchet-remaining-holes',
    state: 'todo',
    subject: 'vague records, padding within a file, semantic weakening',
  },
  {
    number: 107,
    descriptiveName: 'emoji-width-authority-disagreement',
    state: 'todo',
    subject:
      'two icons measure 2 cells and render 1; swap glyphs or fix the authority',
  },
  {
    number: 108,
    descriptiveName: 'gear-mark-four-owners-collision',
    state: 'todo',
    subject: 'shell and yaml rows are indistinguishable in one column',
  },
];

function ensureDirectory(path: string): void {
  if (dryRun || existsSync(path)) return;
  mkdirSync(path, { recursive: true });
}

/** ISO date only — every artifact in a task folder is dated so its order is readable at a glance. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function folderFor(task: TaskRecord): string {
  return join(tasksRoot, task.state, `${task.number}-${task.descriptiveName}`);
}

/** The outline: what the task IS. Briefs are what an agent was TOLD; the summary is what happened. */
function taskOutline(task: TaskRecord): string {
  const resolutionLine = task.resolution
    ? `Resolution: \`${task.resolution}\`\n`
    : '';
  return `# ${task.number} — ${task.subject}

State: ${task.state.toUpperCase()}
Created: ${today()} (reconstructed from the conductor task list during the ledger migration)
${resolutionLine}
## Outline

${task.subject}.

> RECONSTRUCTED ENTRY. This outline was rebuilt from the session task list when \`.invar/tasks/\` was
> created. Where a brief or report exists beside this file, THOSE are the primary sources and carry the
> full mechanism, measurements and refutations. Where they do not, the detail for this task lives in
> \`project.ledger.md\` and in the commit that closed it — this file is a stub with an honest label
> rather than invented specificity.

## Files in this folder

- \`task.md\` — this outline.
- \`brief-N-<date>.md\` — each brief sent to an agent, numbered in send order. A follow-up brief is a
  NEW file, never an edit of the previous one: steering that overwrites its predecessor destroys the
  record of what the agent was actually working from when it made a decision.
- \`report.md\` — the agent's READY report, verbatim.
- \`summary.md\` — what actually happened, written after landing: outcome, what was refuted, what was
  left undone. Distinct from the report, which is the agent's own account.
- \`meta.json\` — branch, worktree, engine, base commit, timestamps.
- Transcripts are NOT stored here; they are gitignored under \`tmp/transcripts/\`.
`;
}

const plan: string[] = [];

let created = 0;

let migrated = 0;

for (const stateDirectory of STATE_DIRECTORIES) {
  ensureDirectory(join(tasksRoot, stateDirectory));
}

for (const task of TASKS) {
  const destination = folderFor(task);
  if (existsSync(destination)) continue;
  ensureDirectory(destination);
  const outlinePath = join(destination, 'task.md');
  if (!existsSync(outlinePath)) {
    if (!dryRun) writeFileSync(outlinePath, taskOutline(task));
    plan.push(
      `create  ${task.state}/${task.number}-${task.descriptiveName}/task.md`,
    );
    created++;
  }

  // Migrate any existing dispatch folder for this number: brief.md becomes brief-1-<date>.md, and
  // report.md is carried over verbatim. The dispatch folder is LEFT IN PLACE (nothing is deleted here);
  // a later commit retires it once this tree is trusted.
  const dispatchMatch = existsSync(dispatchRoot)
    ? readdirSync(dispatchRoot).find(
        (entry) =>
          entry.startsWith(`${task.number}-`) &&
          statSync(join(dispatchRoot, entry)).isDirectory(),
      )
    : undefined;
  if (!dispatchMatch) continue;
  const source = join(dispatchRoot, dispatchMatch);
  for (const fileName of readdirSync(source)) {
    const sourcePath = join(source, fileName);
    if (!statSync(sourcePath).isFile()) continue;
    const targetName =
      fileName === 'brief.md' ? `brief-<number>-<count>-<slug>.md` : fileName;
    const targetPath = join(destination, targetName);
    if (existsSync(targetPath)) continue;
    if (!dryRun) writeFileSync(targetPath, readFileSync(sourcePath));
    plan.push(
      `migrate ${dispatchMatch}/${fileName} -> ${task.state}/${task.number}-${task.descriptiveName}/${targetName}`,
    );
    migrated++;
  }
}

console.log(plan.join('\n'));

console.log(
  `\n${dryRun ? 'DRY RUN — ' : ''}${TASKS.length} tasks; ${created} outlines created; ${migrated} dispatch files migrated.`,
);

console.log(
  `states: ${STATE_DIRECTORIES.map((state) => `${state}=${TASKS.filter((task) => task.state === state).length}`).join(' ')}`,
);
