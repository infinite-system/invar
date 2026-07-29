# TASK — reserved-chord's Quick Open timeout: the last thing blocking every landing

This is the ONLY red standing between a large body of verified work and main. Three prior attempts
produced no mechanism. You are not starting from where they started: there is now a deterministic
reproduction and a named candidate. Your first job is to settle a contradiction, not to write a fix.

## Read these first

- `.claude/skills/invariants/` — record format and the checker.
- The conductor skill's sections on **asking for evidence of a change that will not happen** (this
  repo's dominant defect class, seven spellings) and on **a pre-satisfied wait**. Also the newest
  section: *a repaired instrument needs its subject's states enumerated, not the last failure
  replayed*. All three bear directly on this task.
- IBR: reduce to the load-bearing generator. Two defects below are separable; do not merge them.

## What is reproduced, and what it rules out

`bun scripts/harness/smoke-reserved-chord-harness.ts` run standalone, interleaved across two arms,
six runs each, load average 0.27–0.58 throughout:

- combined tree carrying the editor work: **0 pass / 6 fail**
- plain main at `a93b7e8`: **0 pass / 6 fail**

Identical. That EXONERATES the editor work and makes this a pre-existing defect. Every failure is the
same wait: `Timed out waiting for Quick Open selects small.txt from the typed query`, at
`scripts/harness/smoke-reserved-chord-harness.ts:90`.

## THE CONTRADICTION — settle this before touching anything

A prior task measured this same smoke **10/10 passing standalone at `a93b7e8`**, and it failed in
**none of eleven full gates** on that commit. I measured 12/12 failures on that same commit. A
deterministic mechanism cannot produce both results, so one of these observations is wrong or is
measuring something different, and WHICH ONE decides whether the repair belongs in the smoke or in the
app.

One explanation is already eliminated: the gate registers this smoke through `parallel_safe_smoke`,
which only records the command into an array — it provisions no environment, no HOME, no TMPDIR, no
PATH. So there is no gate-versus-direct environment difference to appeal to. Find another explanation
or demonstrate that the prior 10/10 was misread. Both are respectable outcomes; an unexamined
contradiction is not.

## The candidate mechanism, traced but NOT confirmed

`QuickOpen.enumerateProjectFiles` (`src/modules/search/QuickOpen.ts:258-286`) is a three-step chain:

1. `rg --files` — **ripgrep is not installed on this machine.** `env rg` is ENOENT. The `rg` that
   resolves in an interactive shell is a Claude Code shell FUNCTION, which a spawned child never
   inherits. `scripts/merge-gate.sh:630` already records this fact in a comment — it once cost 14
   silent gate runs.
2. `git ls-files --cached --others --exclude-standard` — the smoke's workspace is
   `mkdtempSync(join(tmpdir(), 'invar-reserved-chord-workspace-'))`, a bare `/tmp` directory. Verified:
   git exits 128, "not a repository". No `TMPDIR` override exists anywhere in `scripts/`.
3. `return []` — **silently.**

With zero candidates `quickOpenSelectedIdentifier` never becomes `small.txt` and the wait cannot be
satisfied. Confirm or refute this by instrumenting what the app actually publishes; do not accept it
because it is written here.

## Two defects, separable — fix the SMOKE, and split the predicate

1. **The smoke depends on an uninstalled binary and never says so.** It times out on a downstream
   symptom instead of naming the missing dependency. Either provision enumeration explicitly (the
   `enumerateProjectFiles` seam already exists and is injected in `QuickOpen.test.ts`) or make the
   workspace a real git repository. A contract whose subject is absent must fail LOUDLY, naming what is
   missing.
2. **Line 90 is a COMPOUND predicate** — it ANDs `quickOpenQuery === 'small'` with the selection
   identifier. On timeout it cannot say which half failed, which is exactly why four prior sightings
   produced no mechanism. Split it before touching either half; the split is what names the cause. This
   is the same repair that settled the terminal-stage blocker.

## Explicitly OUT of scope

The application defect — that `enumerateProjectFiles` returns `[]` silently, so Quick Open finds
nothing in a non-git folder on a machine without ripgrep — is a SEPARATE task and a user-facing one.
Do not fix it here and do not conflate them. If repairing the smoke requires touching `QuickOpen.ts`
at all, say so explicitly and justify it rather than quietly widening scope.

## What must be proven

- The contradiction resolved, with numbers, and a statement of which observation was wrong and why.
- The smoke green **repeatedly** — at least 10 consecutive standalone runs, exit code quoted each time,
  plus its behaviour under the concurrent pool. Do not declare a flake fixed on one pass.
- A positive control: break the thing you fixed and show the smoke RED, then restore it green. A smoke
  that passes because its subject is absent is the failure mode you are repairing; prove yours can
  still fail.
- If the missing-dependency path is the cause, the failure message must NAME the missing dependency.
  Demonstrate that message by removing the provisioning again.

Do NOT widen any timeout or tolerance. Do NOT reclassify the smoke out of the pool to make it pass.
Do NOT run `scripts/merge-gate.sh`, push, merge, tag, or delete branches.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor; `Reactive()` is
exempt. Invariant records at `src/modules/<domain>/<domain>.invariants.md`, cited by ROOT-RELATIVE
path. Full descriptive identifier names. 80 columns. This is a FRAGMENT, not a substitute for the
conventions and skills.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (zero problems; read the
annotation count off this tree rather than chasing a number from a brief),
`bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean. Report to
[/tmp/194-reserved-chord-READY.md](../../../../../../../../../../../tmp/194-reserved-chord-READY.md): the contradiction's resolution, the run tables with exit codes, the
positive control shown red then green, and anything you could not establish. An honest negative is a
valid deliverable; a confident claim measurement does not support is not.
