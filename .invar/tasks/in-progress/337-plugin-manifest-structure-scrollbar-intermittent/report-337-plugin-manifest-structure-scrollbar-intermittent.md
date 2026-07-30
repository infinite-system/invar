# READY #337: the plugin-manifest gate red, its fix, and the intermittent it hid

State: READY
Engine: claude (opus-5)
Branch: `fleet/337-plugin-manifest-structure-scrollbar-intermittent`
Commit: `PENDING_COMMIT_HASH`
Gate: `PENDING_GATE_EXIT`

## The task numbers this report uses

Each number is named once here, so later mentions are handles and not lookups.

| number | what it is |
|---|---|
| #337 | plugin-manifest structure scrollbar settled-geometry intermittent (this task) |
| #340 | opening a file reveals and selects it in the file tree |
| #335 | gate smoke intermittents: scrollbars, thumb, tasks-watch motion |
| #339 | demo supersampled graphics tier resolution |
| #342 | tasks.json nested-shell panes proven loading, folder-open guard audited |
| #350 | the sample video is a morphing Mandelbrot instead of testsrc2 |
| #351 | quick open list rows no longer wrap, search bar stays visible |
| #90 | harness diagnostic provenance guard (`artifacts/tui.log` isolation) |
| #359 | panel-split starvation, a pre-existing gate flake named by the brief |
| #214 | panel-chrome, a pre-existing gate flake named by the brief |

## Verdict in one paragraph

The deterministic red is a real instrument defect, and it is NOT the settled-geometry
class the brief expected. The plugin-manifest smoke reached the first Git settings row by
pressing `Down` exactly once from `Show hidden files`. #340 (opening a file reveals and
selects it in the file tree) contributed a second File Tree row, `Reveal open file`,
directly below it. The single ordinal step then landed on the new neighbour, so the wait
for `Changes/log split` could never hold. The drive now walks to each row by looking for
its published label. The original intermittent, the structure scrollbar settled-geometry
wait, did not reproduce in 7 post-fix runs. That is a negative result with measurements,
not a fix, and it is stated as such below.

## 1. Reproduce by driving

Run 1, unmodified tree at `26dd04f9`, `bash scripts/smoke-plugin-manifest.sh`:

```
  PASS  the late Markdown contribution applies its stored right-side value
  PASS  the boot-time save preserves the not-yet-registered Markdown setting
  PASS  Show hidden files is contributed to the live settings schema
  PASS  the File Tree setting live-applies by removing hidden rows
error: Timed out waiting for the first Git setting is selected at /tmp/tui-plugin-manifest-home-Y8kdUM/status.json
      at awaitStatusWithoutFrame (scripts/harness/HarnessSmoke.ts:107:19)
EXIT=1
```

This is the exact failure the brief quotes. It reproduced on the first attempt.

The gate uses the same drive. `scripts/behavioral-contracts.sh` line 1253 calls
`bash "$DIR/smoke-plugin-manifest.sh"`, and `scripts/merge-gate.sh` line 767 registers
`behavioral-contracts (felt invariants)` as a serial step. The shell wrapper and the
harness are one path, so there is no second variant to drive.

## 2. The cause

`scripts/harness/smoke-plugin-manifest-harness.ts` selected `Show hidden files` by
walking to its label, toggled it, then assumed the next row was Git's first setting:

```ts
driver.sendKeys('Down');
await HarnessSmoke.Class.awaitStatus(
  driver, statusPath, 'the first Git setting is selected',
  (status) => status.settingsSelectedLabel === 'Changes/log split',
);
```

`src/modules/filetree/FileTreeContributor.ts` now registers two rows in the File Tree
section, in this order:

| order | label | added by |
|---|---|---|
| 1 | `Show hidden files` | pre-existing |
| 2 | `Reveal open file` | commit `84f0efa8`, merge `78de90d2` |

One `Down` from row 1 lands on row 2, never on `Changes/log split`. The wait names a
condition and polls the real publisher, so it is correct. The INPUT before it was wrong.

## 3. Deterministic since

The first commit whose tree fails every time is **`84f0efa8` (Reveal open files in the
file tree, 2026-07-30 03:16:15 -0400)**, which reached main through merge **`78de90d2`
(merge #340: opening a file reveals and selects it in the file tree)**.

Evidence, without a bisect:

```
$ git show 78de90d2^:src/modules/filetree/FileTreeContributor.ts | grep "label: '"
46:      label: 'Show hidden files',
$ git show 78de90d2:src/modules/filetree/FileTreeContributor.ts | grep "label: '"
47:      label: 'Show hidden files',
54:      label: 'Reveal open file',
$ git show --stat 78de90d2 | grep -i smoke-plugin-manifest
(no output)
```

The parent tree has one File Tree row, the merge tree has two, and #340 did not update
the smoke. The bisect would have returned this commit, so I did not cut worktrees for it.

**Why three gates still landed green after #340.** The pre-commit hook gates the
BRANCH tree, not main. #342 and #351 were cut before #340 landed, so their trees had one
File Tree row and their gates could not see the red:

```
e93995e7 (#342) branch does NOT contain #340
7f57b019 (#351) branch does NOT contain #340
4017f53c (#350) branch CONTAINS #340
```

#350 was the first branch that contained #340. That is why the escalation appeared at
#350's gate and not earlier. It also means no gate has verified any plugin-manifest arm
below the File Tree row since 03:16 on 2026-07-30. The red masked 54 of the smoke's 58
assertions.

## 4. The fix

One file, `scripts/harness/smoke-plugin-manifest-harness.ts`. The four ordinal `Down`
steps become four calls to the file's own `selectSetting` helper, which steps until the
published selected label matches and then requires the row to be painted and selected:

```ts
await selectSetting(driver, statusPath, 'Changes/log split');
await driver.awaitGridCondition(
  'the Git heading is painted above its contributed setting', ...);
await selectSetting(driver, statusPath, 'Previous/current split');
await selectSetting(driver, statusPath, 'Markdown view');
await selectSetting(driver, statusPath, 'Source/preview split');
```

No timeout changed. No product code changed. Every heading and paint assertion is
unchanged. The two grid conditions that prove the Git and Markdown headings sit above
their contributed rows are kept exactly.

This is the pattern the rest of the harness already uses. `smoke-activitybar-harness.ts`
walks with `selectSettingByLabel`. `smoke-code-folding-harness.ts` derives its step
count from the published `settingsLabels` array. The plugin-manifest smoke was the only
holdout, and its own comments state the rule twice ("Walk to the row by LOOKING for it,
not by counting keypresses").

## 5. Positive control

Three runs, one red and two green, with the cause generalized in the third.

| run | tree | result |
|---|---|---|
| 1 | ordinal drive + #340's second row | **RED**, `Timed out waiting for the first Git setting is selected` |
| 2 | repaired drive + #340's second row | GREEN, 58 PASS, `EXIT=0` |
| 3 | repaired drive + a planted THIRD File Tree row | GREEN, 58 PASS, `EXIT=0` |

Run 3 is the plant. I added a temporary contributed row to
`src/modules/filetree/FileTreeContributor.ts`:

```ts
context.registerSetting({
  identifier: 'fileTreePlantedPositiveControlRow',
  label: 'Planted positive control row',
  section: this.name,
  defaultValue: true,
  spec: { kind: 'boolean' },
});
```

The repaired drive passed with it. The old drive would have failed on it for the same
reason it failed on `Reveal open file`, so the plant proves the repair is insertion-proof
rather than tuned to one row. The plant was removed with
`git checkout -- src/modules/filetree/FileTreeContributor.ts`, and the committed diff
touches no product file.

The task folder also gains
[census-337-ordinal-settings-navigation.ts](census-337-ordinal-settings-navigation.ts), a
parse-based census of this defect shape across all 70 harness smokes. Its `--self-test`
run is its own positive control: it must report the pre-fix code verbatim and must not
report the repaired code.

```
$ bun .../census-337-ordinal-settings-navigation.ts --self-test
SELF-TEST PASS  the pre-#337 broken shape is reported
SELF-TEST PASS  the repaired shape is not reported
$ bun .../census-337-ordinal-settings-navigation.ts
scripts/harness/smoke-markdown-harness.ts:2428  Preview side
ordinal settings drives: 1 (over 70 harness smokes)
```

The one remaining finding is bycatch, below.

## 6. The original intermittent: a negative result with measurements

The task was filed for a different wait: `the structure scrollbar publishes its settled
dock-height geometry`, which timed out in the #335, #339, and #342 gates. That wait sits
below the deterministic red, so it could not run at all on a tree containing #340.

After the fix it runs, and it passed 7 times out of 7:

| runs | conditions | result |
|---|---|---|
| 5 | sequential, defaults, idle machine | 58 PASS each, `EXIT=0` |
| 2 | two instances concurrent in one worktree | 58 PASS each, `EXIT=0` |

**It did not reproduce.** I did not repair it. Two structural weaknesses are measured and
named instead.

**Weakness A. A transient `laidH=1` pass exists.** The wait is
`(latestRightDockScrollbarDiagnostic()?.height ?? 0) > 1`, read from the last
`bar right-dock-scrollbar-v:` line of the newest boot in `artifacts/tui.log`. Across
1088 such lines in 7 boots, 9 carry `laidH=1`:

```
laidH distribution: {"1":9,"33":1079}
boot 2: first10=1x1,33x9   lastIndexOfH1=0 of 159
boot 3: first10=1x1,33x9   lastIndexOfH1=0 of 149
boot 4: first10=1x1,33x9   lastIndexOfH1=0 of 151
boot 5: first10=1x1,33x9   lastIndexOfH1=0 of 163
boot 6: first10=1x2,33x8   lastIndexOfH1=1 of 158
```

The transient always sits at index 0 or 1 of a boot, about 4 ms before the settled
`laidH=33`. The line itself already reports the real overflow (`scrollSize=42
viewportSize=33`), so only the laid-out height is unsettled. The wait can therefore only
progress if the app publishes a LATER line. If the app quiesced on the transient, the
wait would poll a stale line to its deadline. The window is roughly 4 ms out of a
150-line paint sequence, which fits a rare load-dependent stall. I could not force it.

**Weakness B. The reader has no provenance.** `artifacts/tui.log` is written by
`src/modules/system/Logging.ts` at the relative path `artifacts/tui.log`, and
`PtyTestDriver` runs the app child with `cwd` set to the repository root. Every app boot
in a worktree appends to one file. With two concurrent smokes the newest boot slice holds
both instances' geometry, and I measured a foreign `laidH=1` line at index 8 of a
308-line interleaved slice. Both runs still passed, because both instances publish
identical geometry. The risk here is a FALSE GREEN, not the observed red.

Weakness B is already filed as **#90 (per-run diagnostic isolation and a provenance guard
for `artifacts/tui.log`)**. `scripts/tasks/restore-task-detail.ts` line 119 records the
same mechanism for the scrollbars smoke, and states the three items owed: an
instance-scoped log path, a provenance guard, and a positive control that rejects a
planted foreign line. One correction to that record: it says only the scrollbars smoke
enables `TUI_DEBUG_BARS`, so the gate's diverse pool never has two readers. The
plugin-manifest smoke also sets `TUI_DEBUG_BARS: '1'`. The gate still avoids the
collision, because plugin-manifest runs in the serial phase after the parallel pool has
been waited, but the "only one reader" reason no longer holds.

I did not rewrite the geometry wait. The brief allows a repair when the instrument is the
proven cause. Here the proven cause of the deterministic red was the ordinal drive, and
the geometry wait failed under gate load that I cannot recreate. Rewriting a wait I have
never seen fail, inside verification-integrity work, risks trading a known rare flake for
an unknown one. The measurements above are the honest deliverable, and #90 owns the fix
for weakness B.

## 7. Gate chain

The commit ran the pre-commit hook, which runs the full `scripts/merge-gate.sh`. I did not
run `merge-gate.sh` by hand and did not use `SKIP_GATE`. Two attempts:

**Attempt 1: `GATE_EXIT=1`.** One hard red, `smoke: markdown harness`, in the parallel
pool. The failure was an assertion, not a timeout, so the gate did not retry it:
`error: FAIL preview row missing: alpha`, at
`scripts/harness/smoke-markdown-harness.ts:173` through line 1464. The dumped grid shows
the preview pane narrower than the table it must hold, so the marker `alpha` is clipped to
`alph`. My diff touches only `scripts/harness/smoke-plugin-manifest-harness.ts` and each
smoke runs as its own process, so the two cannot interact. I proved it off-diff by driving
the markdown harness standalone twice on this same tree: 94 PASS and `EXIT=0` both times.
The same gate also recorded two retried passes, `smoke: panel-split harness` (#359) and
`smoke: panel-chrome harness` (#214), both named in the brief as pre-existing classes.
Load average was 2.51 with 6 pool workers. The markdown red belongs to the same
layout-under-load family. It is bycatch 8, named and not chased.

The behavioral-contracts step, which is the one that contains the plugin-manifest drive,
PASSED on attempt 1: `merge-gate timing: serial step 1m53.041s — behavioral-contracts
(felt invariants)`. The subject of this task was green on the first gate run.

**Attempt 2: `GATE_EXIT=PENDING_GATE_EXIT`.** Re-run with no change to the tree.

Verification also run by hand, once each:

```
bun run typecheck                                                   clean
node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
  1217 annotation(s) resolved, 223 lattice link(s) resolved, 0 problem(s)
```

## 8. Invariants in scope, record by record

### [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md)

| record | verdict |
|---|---|
| Synchronized end markers bound complete frames | upheld, untouched |
| Declared harness geometry reaches Invar | not in scope (tmux ring), untouched |
| Harness app homes are complete and isolated | upheld. The smoke keeps its own `mkdtemp` home and settings fixture |
| Harness teardown bypasses product quit confirmation only when declared | upheld, untouched |
| Harness input and output use the real PTY | upheld. The repair still sends every `Down` as PTY bytes |
| Latency measurements name their observation boundary | not in scope, untouched |
| The terminal emulator is the harness screen oracle | upheld for the change, **needs refinement** (below) |
| Harness output history stays bounded | upheld, untouched |
| The conformance corpus replaces the tmux ring | upheld, untouched |
| Smoke boots do not extract agent binaries | upheld, untouched |
| Input byte latency uses a reviewed gate baseline | upheld, untouched |
| Harness waits observe conditions not frame ordinals | upheld in letter, **needs refinement** (below) |
| Drive clicks resolve from roles and text | upheld, untouched, and it is the exact analogue this defect needed |
| Drive settled observations include declared debounced work | upheld, untouched |
| Async-published state is always awaited | upheld for the change. One pre-existing site is bycatch 4 |
| Every wait names itself | upheld, and it made the diagnosis one minute long. The timeout printed the condition name, which named the row |
| Shared seam changes verify every consumer | not triggered. The change is inside one smoke and alters no shared helper |
| Stable regions stay byte-identical across actions | upheld, untouched |
| Blocking gate verdicts use ordering and counts | upheld. No timeout was widened and no duration threshold was added |
| Soft duration reports use a machine-wide quiet lock | upheld, untouched |

**Needs refinement 1. Harness waits observe conditions not frame ordinals.** The record
forbids three shapes: a frame ordinal, a predicate the pre-action state already
satisfies, and a fixed sleep. Every wait in the failing drive avoided all three. It named
its condition, polled the real publisher, and used no sleep. The defect was one step
earlier, in the INPUT: a keypress count that assumed a position in a list the app
publishes and grows. The record's negative space does not make that unwritable, which is
the same "true invariant with a thin negative space" failure its own Evidence section
describes for shapes (b) and (c). Proposed fourth shape for the impossibility set, for
the contract owner to accept or reject:

> (d) an input step whose repeat count assumes a position in a list the application
> publishes. A drive reaches a named row by observing the published list, never by
> counting keypresses. Impossible if true: a settings, extensions, or completion drive
> that a newly contributed row can retarget.

Evidence to cite: #340 added one settings row and turned this smoke red on every run for
14 hours across three landings.

**Needs refinement 2. The terminal emulator is the harness screen oracle.** Its Scope
says visual assertions parse the byte stream, and that "semantic state assertions may
still use the existing `StatusChannel` or `FrameProbe`". The plugin-manifest structure
scrollbar arm uses a third source that the record names nowhere: a tail of the
`artifacts/tui.log` debug log. That source is shared between concurrent app instances and
carries no instance identity, so it sits outside every named source and outside the
record's guarantees. The record should either name a debug-log source with its provenance
requirement or state that it is not an allowed oracle. This overlaps #90.

### [src/modules/settings/settings.invariants.md](../../../../src/modules/settings/settings.invariants.md)

| record | verdict |
|---|---|
| Plugin settings live in contributed schema | **upheld, and it predicted this failure** |
| Settings files are external mutable state that may be absent or malformed | upheld, untouched |
| Persistence preserves unrecognized user settings | upheld. The smoke's boot-time preserve assertion passes |
| Every setting is a reactive cell read through its value ref | upheld, untouched |
| Values layer defaults then user then project in that precedence | upheld, untouched |
| Persistence writes only the user file through the injectable seam | upheld, untouched |

`Plugin settings live in contributed schema` states that `SettingsPanel` appends active
contributed descriptors generically, and Generates "plugin-owned headings and settings
rows". A row list that grows with installed plugins is the promised behaviour. The
product kept the promise. The instrument assumed a fixed order. No product change was
warranted.

### [src/modules/structure/structure.invariants.md](../../../../src/modules/structure/structure.invariants.md)

All eight records were unreachable before the fix, because the red sits above them. After
the fix every structure arm passes, so each is upheld by a driven run: Symbol structure is
analyzer knowledge; Outline labels expose source semantics; The structure navigator is a
pane content citizen; The outline projection has one depth and filter policy; A structure
source answers or declines, never blanks; The structure pane shows itself for a supported
document; Outline cost tracks the observed document; Symbol selection jumps through the
source-text view contract. None needed a change.

### Records the brief's list missed

- [src/modules/ui/scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md). The structure scrollbar arm clicks a track and
  then drives keyboard reveal, and asserts both mutate one scroll projection. That is the
  scroll family's subject, and the brief's scope list did not name it. Upheld by the
  passing arm.
- [src/modules/plugins/plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md). The smoke's whole spine is
  uninstall and reinstall symmetry for eight plugins. Upheld by the passing arms.
- [project.invariants.md](../../../../project.invariants.md) `Plugin boundaries grant one authority`. Annotated at the top
  of the smoke itself. Upheld, untouched.

## Bycatch

1. **Same defect class, still live. `scripts/harness/smoke-markdown-harness.ts:2428.**
   A bare `driver.sendKeys('Up')` followed by a wait for
   `settingsSelectedLabel === 'Preview side'`. Any new Markdown setting registered
   between `Preview side` and `Scroll source and preview together` turns that smoke
   deterministically red the same way #340 turned this one red. Found by the census, not
   by driving, so it is a static finding and not reproduced. NOT FIXED: it is a different
   smoke and needs its own verification run. Repair form: `selectSettingByLabel`, or
   derive the step count from `settingsLabels`.

2. **`artifacts/tui.log` has no instance identity.** Measured, see section 6 weakness B.
   Two concurrent plugin-manifest runs interleave geometry lines in one file, and the
   reader's newest-boot slice then holds both instances' lines. Reproduced twice out of
   two concurrent pairs. Already filed as #90 (per-run diagnostic isolation and a
   provenance guard). Named, not chased. One correction to #90's recorded detail: the
   plugin-manifest smoke also sets `TUI_DEBUG_BARS: '1'`, so "only scrollbars enables it"
   is no longer true.

3. **The right-dock scrollbar publishes an unsettled `laidH=1` first pass.** Measured,
   9 lines out of 1088, always at boot index 0 or 1, about 4 ms before the settled
   `laidH=33`. Suspect, not observed: a wait of the form `height > 1` that reads only the
   LAST line can only progress if the app repaints again, so a quiescence on the
   transient would stall it. This is the leading remaining hypothesis for the #335, #339,
   and #342 sightings. It did not reproduce in 7 runs.

4. **An unawaited input before a state read.
   `scripts/harness/smoke-plugin-manifest-harness.ts`, the structure fold arm.** Two
   `driver.sendKeys('Down')` calls, then a bare `readStatus` for `rowsBeforeFold`, then a
   `Left` whose wait assumes the selection reached the namespace row. No wait proves
   either `Down` landed. `sendKeys` only writes PTY bytes and returns. Suspect race under
   load: `Left` folds a different row and `Left folds the selected namespace row` times
   out. Bears on `Async-published state is always awaited` and on clause (c) of the wait
   record. Not observed in 7 runs.

5. **Distillation possibility: six near-copies of one settings-row walker.**
   `smoke-plugin-manifest-harness.ts` (`selectSetting`),
   `smoke-settings-applied-harness.ts:170`, `smoke-pixel-preview-harness.ts:107`,
   `smoke-activitybar-harness.ts:95` (`selectSettingByLabel`),
   `smoke-tasks-dashboard-harness.ts:89`, and `smoke-breadcrumb-harness.ts:144` each
   implement "walk the settings selection to a named published row" separately. The
   shared generator is that one sentence. Naming the sites only. The seam call is a
   design decision and not mine to make inside this task.

6. **Contract-layer: shape (b) in the shared walkers.** Each of those six walkers opens
   with a wait whose predicate is `typeof status.settingsSelectedLabel === 'string'`.
   That is exactly shape (b) of the wait record's own forbidden list, a predicate the
   pre-action state already satisfies. In practice each one reads current state rather
   than awaiting a transition, so it is harmless today, but it is written as a wait and
   the record says such a wait must not exist. If the seam in bycatch 5 is ever drawn,
   the honest form is one `readStatus` of already-open Settings, not a wait.

7. **Checker notes, pre-existing, zero problems.**
   [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) `The editor column's default occupant is a
   contribution` and [src/modules/workspace/workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md) `The editor surface
   answers capabilities, not plugin modes` both carry punctuation in their names, which
   the invariants checker flags as a note about anchor and annotation matching. Not
   introduced here. Recording it so the next reader does not re-diagnose it.

8. **`smoke: markdown harness` fails under parallel-pool load, and the gate cannot retry
   it.** Seen once in attempt 1 of my own gate, at load average 2.51 with 6 workers.
   `error: FAIL preview row missing: alpha` at
   `scripts/harness/smoke-markdown-harness.ts:173`. The preview pane came up narrower than
   the table it must hold, so `alpha` painted as `alph`. Standalone on the same tree it
   passed twice, 94 PASS each. Two points worth a triage decision. First, the shape matches
   #359 (panel-split starvation) and #214 (panel-chrome), which both retried-passed in the
   same gate run, so this looks like one layout-under-load family rather than three
   defects. Second, and more serious for the gate: because the symptom is an ASSERTION and
   not a timeout, `retry-once-on-timeout` does not cover it. A load flake that presents as
   an assertion blocks a commit outright with no retry and no RETRY TALLY line. NOT FIXED,
   off-diff, and outside this task.

## Files changed

- `scripts/harness/smoke-plugin-manifest-harness.ts`. The fix: 4 ordinal steps become 4
  label walks.
- `.invar/tasks/in-progress/337-plugin-manifest-structure-scrollbar-intermittent/census-337-ordinal-settings-navigation.ts`
  The new census, with its self-test positive control.

No product file changed. The branch is not pushed. The conductor lands.
