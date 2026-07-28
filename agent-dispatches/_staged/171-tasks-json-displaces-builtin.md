# TASK — #171: adopting `.invar/tasks.json` silently deletes the user's Claude terminal

Work ONLY in this worktree. Do NOT run `scripts/merge-gate.sh`; do NOT push, merge, tag or delete.
Report to `/tmp/171-tasks-json-displaces-builtin-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`,
then `bun install` FIRST — a fresh worktree has no `node_modules` and every preflight reds on
unresolved imports until you do.

## The defect, found by the user from observation

They asked where the Claude terminal that auto-opens beside the terminal comes from.
`TaskConfiguration.resolve()` (`src/modules/tasks/TaskConfiguration.ts:30-46`) has a THIRD branch
after the two file lookups, returning a `source: 'built-in'` task when neither
`.invar/tasks.json` nor `.vscode/tasks.json` exists:

    label: 'Claude'
    command: claude --dangerously-skip-permissions --continue
             || claude --dangerously-skip-permissions
    presentationPanel: 'dedicated'
    runOnFolderOpen: true

`tasks.invariants.md` records **One task source controls each workspace**, and #156 proved by
DRIVING that adoption is REPLACEMENT rather than union — writing `.invar/tasks.json` made the
`.vscode` tasks disappear rather than merge. The built-in is simply the lowest-priority source in
that chain.

**So the first time any user writes a `.invar/tasks.json` for any reason, their Claude terminal
disappears.** They added a task and lost one. Nothing warns, nothing logs, and the symptom presents
as "the agent stopped opening" — which points at the agent, not at the config file they just
created.

This is not hypothetical for this project: the fleet plan (`project.fleet-operations.md`) requires
that exact file for builder attach-panes, so we would have hit it within a day and spent an hour
debugging the wrong subsystem.

The replacement semantics are CORRECT and deliberate. Do not change them. The problem is that one
of the things being replaced was never written down by the person it belongs to.

## Resolutions, ranked — implement 1, and 2 if it can be done cleanly

1. **REPORT the displacement.** The capability already reports unsupported fields, unsupported task
   types and compound `dependsOn` rather than silently ignoring them, and `tasks.invariants.md`
   states the principle: accepting a field you do not honour is a lie unless it is written down.
   Displacing a built-in is the same class of silent behaviour change and deserves the same
   treatment — when a file source supersedes the built-in, say so once and NAME what was displaced.
   Where that surfaces is your judgment; the status channel and the task terminal's own header are
   both plausible. It must be observable by a user who did not read the source.

2. **Scaffold instead of leaving them to discover it.** When a workspace first gains a task file,
   seed it with the built-in entry so adoption is ADDITIVE by default and removing Claude becomes a
   deliberate edit. Only do this if it can be done without the host learning what a Claude task is —
   the manifest rule is that contributors supply their own defaults and the host learns nothing
   (#100, #103). If honouring that makes scaffolding awkward, do 1 alone and say why.

3. Rejected, recorded so it is not re-proposed: document the behaviour in the invariant record and
   nothing else. Only someone already reading the record would find it, and the person who needs the
   warning is the one who has not read it.

## Verify by DRIVING — this is a two-state behavioural claim

1. Open a workspace with NO task file. Confirm the Claude pane appears.
2. Add a minimal `.invar/tasks.json` containing one unrelated task.
3. The Claude pane must not vanish **without a report**.

That assertion fails today. Make it pass, and pin it — the contract to record is roughly *adopting a
task source must not silently remove a task the user was relying on.*

## Constraints

- **Do not change the replacement semantics.** One source controls a workspace; that is a landed
  invariant proved by driving, and union semantics would be a different and worse design.
- **Do not special-case the Claude task by name in the host.** If the host has to know about Claude
  to warn about Claude, the seam is wrong — the warning should be about *a displaced built-in*,
  whatever it is.
- Positive control: with the warning implemented, remove it and require the driven assertion to red;
  restore and require green. A warning that cannot be absent is not being tested.
- The `||` in the default command is deliberate and recorded: `--continue` fails when there is no
  session to resume and the fallback starts fresh, where a single `|` would pipe one agent's stdout
  into another. If you touch that string, preserve it byte-exactly.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor
(`$Class = Static($Raw); Class = $Class`), never `Class = Static($Class)`; `Reactive()` is exempt
because it mutates in place. Invariant records live at
`src/modules/<domain>/<domain>.invariants.md` and are cited by ROOT-RELATIVE path. Full descriptive
identifier names. 80 columns.

## BYCATCH

Report every defect you SEE; fix only the one you were SENT for, under a `## Bycatch` heading with
exact reproduction, repetition count, and commit.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 913
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
driven two-state reproduction before and after.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
