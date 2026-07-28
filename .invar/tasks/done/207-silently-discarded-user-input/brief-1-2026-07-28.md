# TASK — two surfaces accept input and silently discard it

Both defects were found by the USER hitting them, hours apart, and they are the same shape: a surface
takes something the user gave it, does nothing with it, and reports nothing. Fix them as one class, not
as two unrelated bugs — and if the class has a third instance, find it.

## Read these first

- `.claude/skills/invariants/` — record format, annotation discipline, the checker.
- The conductor skill on **an instrument must fail loudly** and on the **impossibility boundary applied
  to instruments** (name what a check must say NO to). Both apply to product surfaces here, not just
  test tooling: a surface that cannot report "I did nothing with your input" has the same defect as a
  check that can only report pass.
- IBR: reduce to the shared generator before writing code. Two instances are given; decide whether the
  repair is one mechanism or two, and justify the answer.

## Instance 1 — `bun run start <path>` silently ignores the path (#195)

`package.json` declares `"start": "bun src/main.ts ."` — the `.` is hardcoded, so any path the user
appends is passed as a SECOND argument and dropped. `"dev": "bun src/main.ts"` forwards correctly.

The user hit this directly: they ran `bun run start /home/parallels/dev/invar-scale`, got the wrong
workspace, and could not find the files they had just generated. They then had to be told to use `dev`
instead — a workaround for a wrapper that lies about accepting an argument.

Decide the right repair and justify it: make `start` forward its arguments and default to `.` only when
none are given, or make it REFUSE with a message naming the conflict. Silently preferring the hardcoded
`.` is the one option that is not acceptable. Check every other script in `package.json` for the same
shape while you are there — a wrapper that accepts and drops is exactly the kind of thing that exists
in more than one place.

## Instance 2 — Quick Open finds nothing in a non-git folder, silently (#201)

`QuickOpen.enumerateProjectFiles` (`src/modules/search/QuickOpen.ts:258-286`) is a three-step chain:
`rg --files`, then `git ls-files --cached --others --exclude-standard`, then `return []`. That final
`return []` is indistinguishable from "this workspace has no matching files."

Both steps fail together in a real configuration, and it is the user's own: a machine without ripgrep
installed, opened on a folder that is not a git repository. Verified on this machine — `env rg` is
ENOENT (the `rg` that works in an interactive shell is a Claude Code shell FUNCTION, which no spawned
child inherits) and `git ls-files` exits 128 outside a repo. The user's 500k scale workspace,
`/home/parallels/dev/invar-scale`, is not a git repo.

IMPORTANT CONTEXT that shows how well this hides: a previous builder concluded this candidate had been
eliminated, because codex ships its OWN ripgrep at
`~/.codex/packages/standalone/releases/*/codex-path/rg` (verified, 15.1.0 and 15.2.0) which its spawned
app inherits. So the defect is invisible to a codex-launched agent and visible to the user. **Verify
your own environment before you conclude anything here** — run `env rg --version` and say what you got.
If you have ripgrep, you must strip it from `PATH` to see the defect at all.

The repair has two parts and the second is load-bearing:

1. **A real third fallback: a bounded directory walk.** The hardened sibling-folder enumerator
   immediately below (`QuickOpen.ts:288+`) is the model — it already caps entries and survives a
   throwing `stat`, and it exists because unbounded enumeration froze the app twice. Reuse that shape;
   do not write a naive recursive walk.
2. **Make the degraded state VISIBLE.** "Empty because every strategy failed" is a different state from
   "no matches," and they must not render identically. Publish the distinction in the app status so a
   contract can assert it, and surface it to the user.

## What must be proven

- For #195: driving the real app with a path argument through `start` opens THAT workspace, or refuses
  with a message naming why. Show the before behaviour too — quote what the old form actually did.
- For #201: with ripgrep absent from `PATH` and a non-git workspace, Quick Open lists the files. Verify
  by DRIVING the real app, not by unit test alone. Then show that a workspace with genuinely no matching
  files still reports empty, and that the two states are distinguishable in the published status.
- A GATED contract for each, in `bun test` (a blocking gate step at `scripts/merge-gate.sh:696`), not a
  standalone script. Each needs a positive control: an enumeration check whose subject returns `[]` can
  only fail toward "pass", so break it deliberately, show RED, restore, show green.
- The shared-class question answered explicitly: is this one generator or two? If you find a third
  instance of "accepts input, discards it silently", report it even if you do not fix it.

## Constraints

Do NOT widen or delete any existing contract. Do NOT run `scripts/merge-gate.sh`, push, merge, tag, or
delete branches. A machine-wide quiet lock exists for timing-sensitive work; another builder is
currently taking load-sensitive measurements, so if you run anything timing-dependent, take the lock and
record the load average beside every number. This task is correctness work and should not need it.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor; `Reactive()` is
exempt. Invariant records at `src/modules/<domain>/<domain>.invariants.md`, cited by ROOT-RELATIVE
path. Full descriptive identifier names — `lineIndex` not `i`. 80 columns. A fragment, not a substitute
for the conventions and skills.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (zero problems; read the
count off this tree), `bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`,
plus the real-app drives above.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean. Report to
`/tmp/207-silent-input-dropping-READY.md`: your own `env rg` result, the before/after drive evidence,
each positive control red then green, the shared-class verdict, and anything you could not establish.
