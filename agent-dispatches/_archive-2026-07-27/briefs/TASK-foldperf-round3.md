# ROUND 3 — you broke `glide-smoothness`; fix it, then cut the depth drive to ~10s

Work ONLY in `/tmp/conductor-foldperf` (branch `fix-fold-scroll-cost`, currently at `5409344`).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Append to
`/tmp/fold-scroll-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

Your depth work is CORRECT and the numbers are accepted — do not redo it. Two jobs below.

## Job 1 — `behavioral-contracts` is RED on this branch (blocking)

### What I measured (do not re-derive these; build on them)

- `bash scripts/behavioral-contracts.sh` in this worktree: **exit 1, twice, on an IDLE machine.**
  Not load, not a flake.
- Same command on a clean `origin/main` (`de892f0`) probe worktree: **ALL-PASS, exit 0.**
  So this branch introduced it.
- Failing step: `== CONTRACT glide-smoothness ==` →
  `FAIL glide-smoothness instrument did not complete`.
- Exact error in `artifacts/scroll-smoothness.log`:
  `Timed out waiting for grid condition: the glide fixture renders its first line in the editor`
  — that is the third wait in the `surface === 'editor'` open sequence in
  `scripts/harness/measure-scroll-smoothness.ts` (~line 754), predicate
  `snapshot.findText('line 000000 content') !== null`.
- The two preceding waits PASSED (`quick open to receive the glide fixture name`, then
  `quick open to select the exact glide fixture`). So Quick Open opened, the name was typed, the
  row was visible, Enter was sent — and the editor never painted the first line. The captured
  frame shows an EMPTY editor pane.
- The contract invokes the instrument with `SMOOTHNESS_GESTURES=2`,
  `SMOOTHNESS_LINE_COUNTS=2000,26635,100000`, `SMOOTHNESS_SURFACES=editor,diff` and NO shape
  variable (`scripts/behavioral-contracts.sh` ~line 149).

### A hypothesis I tested and REFUTED — do not spend time on it

I suspected the fold-dense fixture's first line doesn't contain the probe text. It does:
`fixtureLineMarker(0, 'packages')` expands to `line 000000 content packages`, and
`line 000000 content` is a substring of it, so `findText` would match. That is NOT the cause.

### What to do

Reproduce first, then diagnose — measurement before mechanism. Instrument the failing invocation
directly (same env vars as the contract) and capture which `fixtureLineCount` / `surface` /
`fixtureShape` combination is the one that hangs; the failing fixture root in my run was
`tui-scroll-smoothness-AMRuIc`. Candidate directions, ranked, but let the measurement rank them:

1. A combination the shape matrix now produces that never existed before (shape × surface ×
   line-count), where Enter cannot open the file — e.g. a `.json` fixture on the `diff` surface, or
   a shape/extension pair Quick Open resolves differently.
2. State leaking between cases in one app session — your Find-based depth navigation opens and
   closes Find; if a later case starts with Find state, focus, or a modal still live, Enter goes
   somewhere else. The frame showing the Files pane focused with an empty editor is consistent
   with this.
3. Fixture write/index timing: a larger or newly-shaped fixture not yet visible to the file
   index when Quick Open filters, so Enter activates nothing.

Fix the mechanism, not the symptom. **Do not lengthen the 60s timeout** — a wait that needs more
time here is hiding a defect, and widening a timeout to silence a red is forbidden in this repo.

Acceptance for Job 1: `bash scripts/behavioral-contracts.sh` exits 0 **three consecutive times**
in this worktree, with exit codes quoted.

## Job 2 — the depth drive must cost about 10 SECONDS, not 52

USER, verbatim: "cut it even more so the test is around 10 seconds total not 27s, what you think? I
saw the slowness right from the start of scrolling, didn't have to scroll through even 10 screens"

Their evidence and your ratios agree: the defect showed on frame one, and every measured ratio came
back 0.999–1.000. Depth is a real axis but a cheap one to sample. Reduce to ONE checkpoint:

- **Keep exactly one**: fold-dense + indent guides + gutter marks, jump to **75,000**,
  ~1,000 rows, 28 FPS floor.
- **Drop all three flat deep checkpoints** — fold-dense-with-everything-on is a strict superset of
  the flat configuration over the same projection code.
- **Drop the depth-0 checkpoints** — the existing 100k contract already measures a gesture from the
  top. Use THAT number as the ratio reference rather than re-measuring it.
- Target ~10s added wall clock; report the measured figure. Do not go below ~1,000 rows — fewer
  frames makes the FPS sample meaningless, which trades a real measurement for a fast-looking one.
- Keep the per-checkpoint positive control: prove the single checkpoint can still go red and quote
  the failing line.

## Verification — exact exit codes

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh` **3x**, the folding
smoke 3x, the inline-rewrite smoke 3x. Report the added wall-clock for the depth drive and the
total contract runtime before and after.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never `Class`).
Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
