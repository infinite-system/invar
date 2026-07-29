# AGENTS.md — Invar

Any agent (codex, claude, fable, or a human tool) working in this repo: **load the repo's IBR
framework and conventions before writing code.**

> Parity note: `CLAUDE.md` is a REDIRECT to this file. Claude Code auto-loads CLAUDE.md; codex
> auto-loads AGENTS.md; neither reads the other's file. THIS file is the single canonical law.
> Never add rules to CLAUDE.md.
> Structural code search: prefer `bun scripts/ast-query.ts` (parse-don't-grep) for any question
> about code structure. See `.claude/skills/ast-query/SKILL.md`. grep stays for prose and logs.

Write all prose in plain language: replies, reports, briefs, comments, commit messages.
Follow `.claude/skills/ste-expression/SKILL.md`, flavored mode. Short sentences. Active
voice. Keep exact paths, counts, and hashes.

## ⚑ YOUR PRIMARY LOOP: DRIVE IT

**Read this first. It is how you work, not just how you check.**

Your inner loop is **driving the real app in your own PTY** (`scripts/harness/PtyTestDriver.ts`
+ FrameProbe) and LOOKING at what it does. Seconds per turn. No gate, no suite. Start with
[`bun run drive`](scripts/harness/drive.md) for a settled grid, published probes, scale fixtures,
and repeatable key, wheel, or click input.

1. **REPRODUCE BY DRIVING FIRST.** Write no assertion yet. If you cannot see the problem, you
   cannot fix it. If you truly cannot see it, say so and report what you tried.
2. **Iterate: drive → change → drive.** ONE instrument at a time. **Do NOT run
   `behavioral-contracts.sh` while iterating. Do NOT run it 3x. Do NOT run the full checker
   suite.** Those are the END, once.
3. **Write the contract only AFTER the symptom is gone**, to lock in what you achieved.
4. **One verification pass at the end.** Then report.

**FEEL-BISECT — when something "used to" work, go find the version that did.** History is
evidence you already have. Cut scratch worktrees at candidate commits (`git worktree add
/tmp/<name>-bisect-<sha> <sha> --detach`, then `bun install --frozen-lockfile`). Drive the
SAME gesture with the SAME settings in each, and compare. **Halve the range. Do not walk
commits one by one.**

**DEFAULTS FIRST — always.** The contract is the DEFAULT experience. That is what almost
every user runs, and it is what the app promises. Drive defaults before anything else, and
fix at defaults. A user's own settings are a SECOND probe, not the baseline. They are often
the user's attempt to COMPENSATE for the very bug being reported (a raised ceiling, changed
friction), so driving them measures bug-plus-workaround and risks tuning the fix to a
configuration nobody else has. Use them when the symptom will not reproduce at defaults, or
to confirm the fix also helps where the user actually sits. When a setting changes the
outcome, say WHICH knob moved it. That difference is itself evidence. Whatever you compare
across commits, hold the settings FIXED within the comparison.

Compare a FINGERPRINT, not a verdict. For motion, that is the per-frame row-crossing
sequence. `3,3,3,3` glides; `5,1,5,1` stumbles at the same average; a sequence that does not
GROW across successive inputs is "heavy". Judge the SHAPE. Do not invent a pass/fail
threshold for a felt quality. Once a good commit and a bad commit are identified, diff them
on the relevant path. That diff is the finding. If NO version is good, say so with the
fingerprints. The user may remember something that never existed, and that is a real answer.

**SCALE PARITY — drive SMALL and LARGE, always.** The app is named Invar because a
100,000-line file must feel identical to a 10-line one. A change on a per-row, per-item, or
per-frame path is not verified until you drive it at BOTH ends of the scale and they behave
the same. A fix that only holds at small scale is not a fix. A cost that only appears at
large scale is the defect this project exists to prevent. Use the shared scale fixtures (see
`project.tools.md`). Do NOT hand-roll another generator. Do NOT commit large fixture files.

**Assertions PREVENT REGRESSION; they do not DISCOVER FIXES.** Judge by observing the real
path. A test in your inner loop makes you optimize for making an assertion pass instead of
making it right. For felt qualities (smoothness, weight, responsiveness) the assertion is a
lossy proxy, so a green suite and an unhappy user coexist comfortably.

Never internal values: drive the path a user drives. Reproduce before diagnosing.

**BYCATCH — report every bug you SEE, fix only the one you were SENT for.** Driving the real
app means you will notice defects outside your task: a mispainted cell, a focus jump, a
stall, a wrong glyph. Do NOT fix them (scope creep destroys reviewability) and do NOT ignore
them (an observed defect nobody records is lost evidence). Put them in a `## Bycatch` section
of your READY report, one line each: what you saw, the exact steps or frame that showed it,
and whether it reproduced a second time. If it costs under a minute, capture the reproduction
(fixture, keys sent). If not, the observation alone is still owed.

A SMALL-AND-OBVIOUS fix is allowed, under all four conditions, and it is still reported:
1. LOCAL: a few lines in one file you already understand, with an obvious correct form (a
   typo, an off-by-one, a wrong glyph constant, a stale label). Never a shared seam, a
   contract file, a binding layer, or anything another builder owns.
2. SEPARATE COMMIT: the fix rides as its OWN commit with its own message. Never fold it into
   your task's diff. Review stays clean and it can be reverted alone.
3. BOUNDED: if it is not done in ~15 minutes, or the edit starts spreading to a second file,
   STOP, revert, and report it as ordinary bycatch instead. The spread is evidence it was not
   obvious.
4. STILL REPORTED: it appears in `## Bycatch` marked FIXED, with the commit hash, so the
   conductor reviews it instead of discovering it.
Everything larger: the conductor triages bycatch into tasks. Yours is to see and to say.

## Your scratch tooling — the task folder, named and explained

Any script, census, probe, or analysis you author during a task goes in **your
own task folder** (`.invar/tasks/*/<n>-<slug>/`), committed on your branch. It
rides the merge home and outlives your worktree. Tooling written to `/tmp`
dies with the machine; tooling in the task folder becomes part of the record
(#222's censuses and proposed checker are the founding example).

Three requirements, so the conductor and the user can pick your tools up cold:

1. **Descriptive names, full words** — the same naming law as code (convention
   3 below): `census-222-getter-sites.ts`, never `chk.ts` or `tmp2.ts`. Lead
   with your task number so the folder sorts by task.
2. **A header comment atop every script**, in plain English (STE): what the
   script finds out, how to run it (the exact command), and how to read its
   output. The header is the script's contract — a scratch nobody can rerun is
   an assertion nobody can check. Do NOT write a sibling `.behaviour.md` for a
   script; two files drift apart, and the header travels with the code. A
   separate `.md` is only for documents that ARE the deliverable (analysis,
   design).
3. **Say what the numbers mean, not just what they are.** A census that prints
   `42` explains in its header what 42 counts and what a change in it would
   mean.

## Where durable knowledge goes — the REPO, never a private memory

**NEVER write a lesson, convention, correction, or project fact into an agent's private
memory store** (e.g. Claude Code's `~/.claude/projects/*/memory/`). Write it where a COLD
START fetches it. That means a tracked file in this repo:

| what | where |
|---|---|
| law every agent must load | `AGENTS.md` (this file; `CLAUDE.md` redirects here) |
| operative conventions — the WHAT | `project.conventions.md` |
| the WHY and history behind a convention | `project.decisions.md` |
| an orchestration lesson — the dated account, with its evidence | `project.conductor.md` |
| the standing ORDER distilled from lessons | `.claude/skills/conductor/SKILL.md` |
| a domain's invariants | `<domain>.invariants.md` |
| how to run an instrument | `project.tools.md` |

**Why this is not a preference:** a private memory is invisible to codex builders, to any
other agent, to the user, and to a fresh session on another machine. Most of the fleet here
is codex, and codex cannot read Claude Code's memory at all. A lesson stored there is a
lesson the people who need it will never see. The repo travels; a home directory does not.

If a fact seems too small for a tracked file, it is either not worth keeping or it belongs
as one line in an existing section. Do not invent a new file for it.

**A SKILL is an order, not a log.** It loads on every session, so its cost is paid every
time: imperative, present tense, no dates, no provenance, no evidence blocks, no narrative.
A new lesson earns at most a CLAUSE there, and only if it changes what an agent must DO. The
account of how it was learned goes in the `project.*` file. When a lesson extends a rule
already written, amend that rule in place. Do not add a section beside it.

## Reporting to the user

- **Never cite a task number alone.** Write `#151 (dependency boot guard)`, never `#151`.
  The numbering is an index into a 150-entry list nobody memorises. A bare number transfers
  no information and forces a lookup, or worse, agreement without knowing which item is
  meant. Name first, number second: the name identifies, the number is a handle for tooling.
  Same for gate logs, commit subjects, branch names, and worktree names.
- **State what a task IS when you report its status.** "Closed #150" is useless. "#150
  (diagnose the statics slowdown) closed — cause was a missing `bun install`" is the report.

## Skills index (ALL agents — codex does not auto-see `.claude/skills/`; this list is your map)
- **`.claude/skills/ibr/IBR.md`** — the reasoning framework. Load before any governed/architectural work.
- **`.claude/skills/ivue/`** — the reactive substrate + namespace pattern. Load before touching `src/modules/**`.
- **`.claude/skills/invariants/`** — the contract layer + checker (`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`). Load when adding/altering behavior in a contract-governed module; run the checker before every READY.
- **`.claude/skills/agent-tmux/`** — driving an interactive claude/codex inside tmux (`.claude/skills/agent-tmux/scripts/agent-tmux.sh`: launch / send / **state** / peek). Load before talking to ANY nested agent. NEVER hand-roll `tmux send-keys`, and NEVER launch with `codex exec` / `claude -p` (no input loop — amendments cannot reach a running builder). Its `send` confirms submission by polling the busy marker; a bare send-keys leaves a large paste unsubmitted in the composer. `scripts/fleet/dispatch.sh` launches every builder through it.
- **`.claude/skills/ast-query/SKILL.md`** — parse-don't-grep structural search (`bun scripts/ast-query.ts`). Use for ANY code-structure question (call sites, constructions, censuses).
- **`.claude/skills/generator-audit/SKILL.md`** — the independent review-as-reduction procedure. Use when asked to review/audit the codebase or a module.
- **`.claude/skills/conductor/SKILL.md`** — fleet orchestration doctrine (conductor sessions; builders may read the clearance/verification sections to understand the gate protocol they operate under).
- **`.claude/skills/manage-tasks/SKILL.md`** — the task-system protocol: one folder per task under `.invar/tasks/` (active/in-progress/completed/retired), the seven-step lifecycle, number-first file naming, and the tracker (`bun scripts/tasks/tasks-status.ts`). Load when filing, dispatching, landing, or auditing tasks.
- **`.claude/skills/ste-expression/SKILL.md`** — plain prose rules (Simplified Technical English, adapted). Applies to replies, briefs, task files, reports, and script messages — never to code or invariant records. Linter: `python3 .claude/skills/ste-expression/scripts/ste-lint.py <file.md>`.

## Instruments index — `project.tools.md`
Optional measuring tools exist that are NOT wired into the gate: scroll-smoothness,
completion-list latency, graphics-capability probing, reactive-observation audit. They answer
questions no assertion can (feel, latency curves, terminal capability). **Read
`project.tools.md` before hand-rolling a measurement.** It names each instrument, the
question it answers, its known results, and the gotcha that will otherwise cost you an hour.
Adding an instrument means adding its row there. An instrument nobody can find is not
tooling.

These skills live in this repo. Read them; do not work from a second-hand summary:

>  **`.claude/skills/ibr/IBR.md`** — the Invariant-Based Reasoning framework that governs this
>  codebase. For claude agents inject it as the WHOLE system prompt, not an addition:
>  `--system-prompt USE_IBR_FOR_REASONING --append-system-prompt-file .claude/skills/ibr/IBR.md`
>  — the first flag replaces the default system prompt with the IBR trigger token, the second
>  appends the framework, so the agent reasons FROM IBR rather than layering it on the stock prompt.
>  **`.claude/skills/ivue/`** and **`.claude/skills/invariants/`** — the ivue reactive/namespace
>  conventions and the invariant-contract discipline.

Non-negotiable conventions (summarized from the `ivue` + `invariants` skills and
`project.conventions.md`; these are the ones that must not be lost in relay):

1. **ivue namespace pattern — anchored forms.** `class $X` + `namespace X`. A class declaring
   statics publishes `$Class = Static($X)`; a class without statics publishes `$Class = $X`.
   Its honest selected `Class` is `$Class` (static capability or plain service) or
   `Reactive($Class)` (stateful reactive controller). Pick the honest form. Do not default
   everything to Reactive.
2. **Distill to the shared generator — reuse the seam; do not duplicate or over-unify.** A
   behavior belongs in ONE seam only where its *generator* is the same across consumers
   (e.g. `TextEditing` word-edits, the `*Backend` provider seams, `ScrollableTextViewport`).
   A new consumer is then one wire-up, not a reimplementation. SPLIT where features only
   *look* alike. The tell that a boundary is wrong: a consumer forced to *suppress a seam's
   core* to use it (peripheral config is fine). Duplication AND over-unification are both
   failures. Invariant: *Seams are drawn at the shared generator* (`project.invariants.md`).
3. **Full descriptive identifier names, always.** `increment` not `inc`, `index` not `i`,
   `editor` not `ed`. Full property paths over short aliases. All code.
4. **Invariants govern change.** Check against the relevant `*.invariants.md`. Require zero
   problems from `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`.
   Never put a literal `// invariant: …` string in example or comment text (the checker
   scans it).
5. **Verify by DRIVING — see YOUR PRIMARY LOOP at the top of this file.** Ratchet verified
   behavior into a gated smoke so it cannot silently regress. tmux is a LEGACY opt-in audit
   tier (`INVAR_FULL_TMUX=1`), skipped by the gate. Never write a new tmux smoke. Extend a
   PTY-harness one.
6. **Every check needs a POSITIVE CONTROL — a check that can only pass is not an
   instrument.** Before you trust a green, make it go RED on purpose: plant the defect it
   claims to catch, run it, quote the failure, remove the plant. This applies to smokes,
   gate steps, counters, lints, and liveness probes alike. An assertion nobody has ever seen
   fail is a decoration.
7. **Every wait observes a CONDITION, and a timeout is never the fix.** No fixed sleeps, no
   frame ordinals, no predicate that is already true before the work happens (a grid search
   that matches text painted by a DIFFERENT surface is the classic). If a wait times out,
   the wait or the code is wrong. **Never widen the timeout to silence a red.** Prefer
   LOAD-INVARIANT quantities: counts of work (rows crossed, document reads, layout passes)
   over wall-clock. A count cannot flake under load and cannot be argued with.
8. **You do not land your own work.** Never `push`, `merge` into main, tag, or delete a
   branch. The conductor gates and lands. Commit in your worktree, leave the tree clean,
   write your READY report. When you ARE asked to resolve a merge, classify every difference
   against the **merge BASE**: ours-vs-theirs alone cannot tell "we added it" from "they
   deleted it", and resurrecting a deleted test is the signature failure.
9. **Report blockers; do not work around them. A negative result is a real deliverable.**
   If the honest finding is "cannot reproduce", "this is pre-existing", or "the premise in
   the brief is wrong", say that with the evidence. Do not manufacture a fix. If a
   constraint blocks you (a frozen value that must mutate, a contract that contradicts the
   task), REPORT it rather than cloning around it. And never read `$?` after a pipeline or
   after `A && B` — you will report the wrong command's status. Capture the exit code of the
   command you actually mean.
10. **Branches are NEVER deleted — parked and tagged.** Every branch ends in exactly one of
   two marked terminal states: `git tag -a finished/<branch>` (content fully merged into
   main) or `git tag -a retired/<branch> -m '<why>'` (content never landed: superseded,
   unadopted, or replaced by a rebase — tag the pre-rebase twin too). No `git branch -D`,
   ever. Cleanup removes WORKTREES only (`git worktree remove`). In-flight branches get
   neither tag — pending ≠ retired. Greppable: `git tag -l 'finished/*'` / `'retired/*'`.
11. The editor is named **Invar** (formerly "Fable").

Also read on entry: `CLAUDE.md`, `project.conventions.md`, `project.ivue-reference.md`,
`project.invariants.md`, `project.architecture.md`.
