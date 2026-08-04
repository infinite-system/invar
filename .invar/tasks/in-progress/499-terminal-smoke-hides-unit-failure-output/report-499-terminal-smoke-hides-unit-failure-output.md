# READY — 499 smoke output hygiene

Branch: `fleet/499-terminal-smoke-hides-unit-failure-output`
Commit: `00e5547a` (20 files, +139/-121)

## In plain words

Some tests run a helper program and threw away everything it printed.
When the helper failed, the log showed one label and no reason. Now the
test prints the helper's full output before it fails, so the reason is
in the log. Also, tests that reuse a saved settings folder now print
which folder they used and what panel order it started with. A failure
caused by old saved settings no longer looks like a code bug.

## What changed

1. New shared helper `requireChildSuccess(label, command, cwd?)` in
   `scripts/harness/HarnessSmokeSupport.ts`, delegated through
   `HarnessSmoke.Class.requireChildSuccess`. It spawns the child with
   piped streams. On nonzero exit it prints the child's full stdout and
   stderr to stderr, bounded by loud marker lines, then fails with the
   same label as before. The green path prints the same single PASS
   line as before.
2. All 13 pipe-and-drop spawn sites now call the helper (table below).
   `smoke-terminal-harness.ts` (~line 715, the gate-493 site) is one of
   them.
3. `scripts/smoke-keyboard-invariant.sh` prints two lines at the top:
   the resolved harness home (same resolution as `tui-harness.sh`:
   `INVAR_HARNESS_HOME` or `artifacts/home`) and the starting
   `panelContentOrder` read from that home's `settings.json`, with
   explicit fresh-home / not-set fallbacks.
4. `scripts/tui-harness.sh launch` prints `harness home: <path>` on
   stderr. Stderr because callers routinely send launch stdout to
   /dev/null. This one seam line makes all 37 shell smokes that launch
   through it self-describe their inherited profile.
5. Git fixture helpers that dropped stdout on failure now report both
   streams and the exit code. Git writes some failure reasons to
   stdout ("nothing to commit"), a lesson already recorded in
   `HarnessSmoke.runGit` — the sibling helpers now match it.

## Sweep table

Pattern (a) = child output piped or ignored and dropped on failure.
Pattern (b) = reused persistent home with no self-description line.

| File | Pattern | Verdict |
|---|---|---|
| scripts/harness/smoke-terminal-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-git-blame-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-bracket-match-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-pixel-preview-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-media-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-move-line-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-image-preview-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-panel-split-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-agent-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-audio-narration-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-agent-search-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-voice-picker-harness.ts | a (unit run) | fixed (helper) |
| scripts/harness/smoke-breadcrumb-harness.ts | a (fixture generator, default-piped stdout) | fixed (helper) |
| scripts/harness/HarnessSmokeSupport.ts runGit | a (stdout ignored) | fixed (both streams) |
| scripts/harness/smoke-selection-harness.ts runGit | a (stdout ignored) | fixed (both streams) |
| scripts/harness/smoke-scrollbars-harness.ts runGit | a (stdout ignored) | fixed (both streams) |
| scripts/harness/smoke-tasks-dashboard-harness.ts plantedGit | a (stdout dropped in message) | fixed (both streams) |
| scripts/harness/HarnessSmoke.ts runGit | a candidate | clean (already reports both streams) |
| 11 shell smokes running `bun test` into /tmp logs (agent, bracket-match, pixel-preview, image-preview, panel-split, move-line, audio-narration, agent-search, git-blame, terminal, voice-picker) | a candidate | clean (each tails its log on failure) |
| scripts/smoke-keyboard-invariant.sh part A | a candidate | clean (tails unit.log on failure) |
| scripts/smoke-keyboard-invariant.sh | b | fixed (home + panelContentOrder at top) |
| all 37 scripts/smoke-*.sh via tui-harness.sh | b | fixed at the seam (launch prints harness home on stderr) |
| scripts/harness/smoke-*-harness.ts (PtyTestDriver) | b candidate | clean (each makes a fresh mkdtemp home) |
| scripts/behavioral-contracts.sh | b candidate | clean (creates and exports a fresh run home) |
| scripts/harness/smoke-agent-cancel-harness.ts | a candidate | clean (the 'ignore' spawn is fixture text inside a generated child script, deliberate) |

## End-state evidence

- Positive control: a planted failing test run through
  `HarnessSmoke.Class.requireChildSuccess` printed the child's full
  `bun test` output (the exact expect diff and test name) before
  `FAIL terminal core and PanelHost unit tests`. Green control prints
  one PASS line, unchanged.
- `bun scripts/harness/smoke-terminal-harness.ts` bare: exit 0,
  ALL-PASS, 0 FAIL lines.
- `scripts/smoke-keyboard-invariant.sh` bare: exit 0, PASS. Lines 1-2
  of the log are the new self-description:
  `harness home: .../artifacts/home` and
  `starting panelContentOrder: (no settings.json - fresh home, app
  default applies)`. A planted `settings.json` with
  `{"panelContentOrder":["agent","terminal"]}` makes the same probe
  print `["agent","terminal"]`.
- Changed-consumer spot checks, all exit 0: smoke-bracket-match,
  smoke-selection, smoke-breadcrumb harnesses.
- `bun test scripts/harness/HarnessSmoke.test.ts`: 7 pass. `tsc
  --noEmit` clean. Prettier clean on all changed files.
- Full smoke set otherwise untouched: every other diff hunk is
  failure-path-only or an added print. No wait, input, or assertion
  semantics changed. The conductor's gate covers the full consumer set
  per the shared-seam record.

## Invariants in scope — record by record

- **Every wait names itself** (harness.invariants.md): upheld. No wait
  was added, removed, or renamed. The new output paths run before or
  after waits, never inside them.
- **Harness waits observe conditions not frame ordinals**: untouched.
  All changes are output hygiene on failure paths and two startup
  print lines. No wait semantics moved.
- Adjacent: **Harness app homes are complete and isolated** — the
  keyboard smoke and launch changes only NAME the home; resolution and
  isolation behavior are unchanged. **Shared seam changes verify every
  consumer** — the seam additions are new-function or failure-path-only;
  green-path behavior is byte-identical except the two self-description
  lines. Five consumers verified bare here; the full registered set
  runs in the conductor's gate.

## Bycatch

None observed. Nearest candidate recorded: the 11 shell smokes tail
only the last 20-25 log lines on unit failure. That truncation keeps
the failing test visible in practice, so it was left alone.

## Instrument feedback

- EASY: `HarnessSmoke.runGit` already carried the exact lesson (report
  both streams, name the exit code) with the reasoning in a comment.
  The fix pattern was copy-adapt.
- CONFUSING: two `runGit` implementations exist (`HarnessSmoke.runGit`
  reports both streams and returns stdout; `HarnessSmokeSupport.runGit`
  was the weaker stderr-only sibling) plus two per-smoke local copies.
  Ask: one shared `runGit`, one truth.
- MISSING: nothing in the harness said "a child's output must survive
  its failure". Ask: a `discovered`-class invariant record, e.g. "A
  failing child process prints its output" in harness.invariants.md,
  with `requireChildSuccess` as the enforcement point — a checker rule
  could then flag `stdout: 'pipe'` spawns whose result streams are
  never read.
