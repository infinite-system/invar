# Fleet operations — where dispatches live, how they are watched, how we migrate

Status: DECIDED 2026-07-27, not yet implemented. Naming, transcript retention and fleet location
are settled by the user; the migration phases below are unchanged.

**Settled:** `agent-dispatches/` for the records. ALL transcripts kept, as plain text. Fleet
worktrees at `.invar/worktrees/`, gitignored.

## The problem, stated as one thing

Everything about a dispatch currently lives somewhere with no owner, no history, and no live view:

| Artifact | Today | Consequence |
|---|---|---|
| brief | `/tmp/TASK-*.md` (89 files) | not in git, dies on reboot, cannot be reviewed or cited |
| report | `/tmp/*-READY.md` (144 files) | same; the entire campaign's evidence is volatile |
| worktree | `/tmp/conductor-*` (95, 2.5 GB) | same; uncommitted builder work dies with the machine |
| transcript | `/tmp/*-codex.log` | same, and `*.log` is gitignored anyway |
| the running agent | `nohup codex &` | **no way for the user to attach, watch, or intervene** |

Two of those are worse than they look. `.gitignore:33` ignores `tmp/`, so the Opus 5 editor review
at `tmp/TASK-wrapindex-edit-path.md` is untracked right now — a document written to the repo that
the repo does not have. And the oldest surviving artifact is from Jul 24, so the record only looks
durable because nobody has rebooted in three days.

## The reduction

The three asks — auditable briefs, visible agents, colocated work — are one requirement:

> **A dispatch's record must be a byproduct of dispatching, and its session must be attachable by
> someone who is not the dispatcher.**

The first half is the important one, and tonight proved why. Seven bycatch findings were reported
correctly and five were lost, for exactly one reason: recording them required a SEPARATE ACTION
from the work that produced them. Any record that depends on a second step eventually doesn't
happen. The same defect is currently latent in every brief I write — the brief exists only because
I chose to keep a copy, and nothing would notice if I didn't.

So the mechanism is not "a folder to put briefs in." It is **a dispatch script that cannot launch
an agent without committing its brief first.** The audit trail then cannot drift from reality,
because the same command produces both.

## Decisions

### 1. Worktrees live at `.invar/worktrees/`, gitignored

    .invar/worktrees/<task>-<slug>/     e.g. .invar/worktrees/162-quick-open-identity/

- **Not `/tmp`** — rootfs `/tmp` is cleared on boot by `systemd-tmpfiles`. A builder that dies
  mid-write today loses its uncommitted tree on the next restart. 2.5 GB of history is currently
  living on that assumption.
- **Inside the repo is SAFE, and I was wrong to doubt it.** I argued against this on the grounds
  that `check-file-grammar.ts` walks the filesystem rather than reading git — which it does, but
  `filesForArguments` defaults to `['src/modules']` and `conventions-gate.sh:40` invokes it with no
  arguments, so it never sees the repo root. The empirical proof is already in the tree:
  `.claude/worktrees/` holds 8 worktrees with roughly 800 `.ts` files, and the gate is green with
  1,692 tests — so `tsc` (no `include`/`exclude` in `tsconfig.json`, relying on TypeScript's
  skip-hidden-directories globbing) and `bun test` are both ignoring dot-directories too. The exact
  arrangement proposed here is already running.
  **The dot prefix is load-bearing** — `invar/worktrees/` without it would be walked by all three.
- **Ignore the subdirectory, not `.invar/`** — `.invar/tasks.json` is workspace configuration that
  SHOULD be committed. The gitignore entry is `.invar/worktrees/` alone.
- **Retention:** prune the worktree once its branch is merged and tagged. Per repo law branches are
  NEVER deleted — they are parked with `finished/` or `orphaned/` — but `git worktree remove` is
  already permitted, and the branch plus tag is the durable artifact. This is what reclaims the
  2.5 GB, and it loses nothing: `git show finished/<branch>` reconstructs any landed change.

### 2. Briefs and reports live in the repo, beside the code they produced

    agent-dispatches/<task>-<slug>/
      brief.md        committed AT DISPATCH, before the agent starts
      report.md       committed AT MERGE, verbatim from the builder
      meta.json       branch, worktree path, model, tmux session, start/end, commits, verdict

Keyed by TASK NUMBER because that is the stable identity; chronology is recoverable from git and
from `meta.json`, so a date hierarchy would be arbitrary ordering rather than structure. Multiple
rounds append `report-round2.md` — the existing convention where a builder's second pass extends
its report rather than replacing it.

**ALL transcripts are kept** — `transcript.md`, committed with the report. The report is the
builder's own account of what it did; the transcript is what actually happened. Tonight the
difference mattered twice: #162's report refuted the premise its brief was built on, and #163's
refuted the conductor's stated hypothesis with a measurement. Neither would be re-checkable from a
summary alone.

**Plain text, never gzipped.** Git already zlib-compresses blobs in the packfile, and it can delta
similar transcripts against each other — successive codex runs share enormous structure. Committing
`.gz` defeats both: the pack cannot compress it further and cannot delta it, so the archive gets
BIGGER and stops being greppable. Raw text is the smaller *and* more useful choice, which is the
rare case where the honest option costs nothing.

**Name it `.md`, not `.log`** — `*.log` is globally gitignored (`.gitignore:7`), so a transcript
committed under that extension would silently never be added. That is precisely the failure mode
this whole plan exists to remove.

### 3. tmux is the session substrate — and this is where your PTY-driver question lands

**Use tmux, not our PTY driver, and the reason is what each one actually is.**

Our PTY layer is an INSTRUMENT FOR DRIVING THE APP UNDER TEST: `OpenPtyBackend` plus the harness
write keystrokes and read frames. It has no detach, no re-attach, no second viewer, no scrollback
that outlives the driving process. Making it a session multiplexer means building tmux inside the
thing tmux already does, and the four properties we need are exactly the four it lacks.

There is a second reason, and it is the stronger one: **the fleet must not run inside the artifact
the fleet is building.** Invar is pre-1.0 with known intermittents, and its terminal runtime is
mid-extraction (#114 Wave B). If the builders live inside Invar, any regression they introduce can
take down the fleet that would fix it. Tonight alone we found a panel-close publication that never
arrived and a blank file tree at boot — either would have been a fleet outage under that design.
Keep the substrate boring and external.

**But your instinct is right, and it composes rather than competing:**

    tmux owns the session.        Invar attaches to it.

Sessions named `invar/<task>-<slug>` (e.g. `invar/162-quick-open-identity`), so:

- you attach from any terminal: `tmux attach -t invar/162-quick-open-identity`
- both of us can watch the same session simultaneously, and you can TYPE INTO IT — steering a
  builder mid-run is currently impossible
- `tmux ls` is a true fleet roster
- **named sessions give precise identity for termination.** This retires a real hazard: the
  standing rule is never to `pkill -f` because the pattern matches the builder's own brief text,
  and a kill is destructive. `tmux kill-session -t invar/162-…` names one session and cannot match
  anything else.
- `tmux pipe-pane` writes the transcript, so the log is a side effect of the session rather than a
  redirect we have to remember

And the dogfooding you're after arrives through `.invar/tasks.json` (#156, landed today), where
each builder is declared as a task running `tmux attach -t invar/<name>`. Open Invar and the fleet
is in panes — but the builders are owned by tmux, so they survive Invar restarting, crashing, or
being rebuilt underneath them. That makes the tasks capability immediately load-bearing for a real
workflow instead of a demo.

Revisit hosting them natively once terminal-as-runtime (#114 Wave B) lands WITH session resume.
That is the capsule-lite work you deferred on 2026-07-26, and this is the use case that would
justify it.

### 4. The dispatch script is the actual mechanism

`scripts/fleet/dispatch.sh <task-number> <slug> <brief-file>`, in fixed order:

1. refuse if `agent-dispatches/<task>-<slug>/` already exists, or the worktree path is occupied — a
   leftover worktree has silently started a builder on the wrong base three times
2. `git worktree add -b <branch> .invar/worktrees/<task>-<slug> main`
3. **`bun install`** — not optional and not the builder's job to discover; a fresh worktree has no
   `node_modules` and the resulting preflight red looks exactly like the defect being investigated,
   which cost a builder ten baseline runs on 2026-07-27
4. copy the brief to both `agent-dispatches/<task>-<slug>/brief.md` and the worktree's `TASK.md`
5. **commit the brief to main** — the dispatch does not proceed if this fails
6. `tmux new-session -d -s invar/<task>-<slug>`, `pipe-pane` to the transcript, launch codex
7. write `meta.json`; print the attach command

Step 5 is the whole design. Everything else is convenience.

A matching `scripts/fleet/land.sh` closes the loop: copy the report in, commit it with the merge,
tag `finished/<branch>`, prune the worktree, kill the tmux session by name.

## Migration — four phases, none of which disturbs live work

**Phase 0 — now.** The three live builders (#161, #162, #163) finish exactly as they are, in
`/tmp`, under `nohup`. No change. Their briefs and reports get backfilled by hand when they report.

**Phase 1 — salvage, and do it before anything else.** 233 documents in `/tmp` are the campaign's
entire evidence base and a reboot deletes them. Copy every `/tmp/*-READY.md` and `/tmp/TASK-*.md`
into `agent-dispatches/`, matching report to brief by name, and commit. Unmatched files go to
`agent-dispatches/_unmatched/` rather than being dropped — an orphaned report still carries its
measurements. This is a pure `cp` and one commit; it competes with nothing and can be done while
builders run.

**Phase 2 — the scripts.** Write `dispatch.sh` and `land.sh`. Test with a real dispatch, not a
dry run: the failure modes here are occupied paths and missing `node_modules`, and neither shows
up in a rehearsal.

**Phase 3 — cut over.** The next dispatch after Phase 2 uses the script. Old and new coexist; no
flag day. When all `/tmp` builders have landed, `/tmp/conductor-*` becomes prunable — 2.5 GB back,
with every branch preserved under its tag.

**Phase 4 — Invar as viewer.** Add `.invar/tasks.json` entries that attach to the live sessions.
This is the dogfooding step and it is deliberately last, because it must be able to fail without
costing us the fleet.

## What I would NOT do

- **Not a separate ops repo.** The brief and the code it produced belong in one history, so that a
  merge commit can cite `agent-dispatches/162-…/brief.md` by path.
- **Not date-partitioned directories.** Discovery order is not structure; the task number is.
- **Not transcripts in git by default.** See above — say the word and it flips.
- **Not migrating the live three.** Moving a builder's worktree mid-run to make the layout tidy
  would risk real work for cosmetics.

## Settled 2026-07-27

1. **`agent-dispatches/`** — `ops/` named a category rather than its contents, so it failed the
   only test that matters: a stranger reading the repo root should know what is inside without
   being told. Runner-up was `delegation/`, matching the existing `project.delegation-log.md`
   vocabulary, but it names the act rather than the records.
2. **Keep every transcript**, plain `transcript.md`, committed with the report.
3. **`.invar/worktrees/`**, gitignored — inside the repo, validated against the working
   `.claude/worktrees/` precedent rather than against my assumption that it would break the
   checkers.

## Still open

Nothing blocking. Two things to decide when we get there, neither of which changes the layout:

- Whether `land.sh` should prune the worktree immediately on merge, or leave it until the next
  reconciliation sweep so a just-landed tree is still inspectable for a while.

## `.invar/tasks.json` — SETTLED: `runOn: folderOpen`, and the file does not exist yet

The tasks capability (#156) is live code reading a file that was never written. `TaskConfiguration`
looks for `.invar/tasks.json`, falls back to `.vscode/tasks.json`, and this repo has neither — so
the capability has never run outside its own fixtures. **A capability with no live configuration is
the #105 shape one level up:** not a smoke the gate never runs, but a feature the product never
exercises on itself, which rots exactly as invisibly.

`runOn: folderOpen` is confirmed as the intended mode. Two kinds of task, and only the second waits
on the migration:

**A. The agent terminal — buildable today, independent of everything else.** This is the default
#156 shipped and it needs no fleet infrastructure:

    claude --dangerously-skip-permissions --continue || claude --dangerously-skip-permissions

The `||` is deliberate and already recorded in `tasks.invariants.md`: `--continue` fails when there
is no session to resume and the fallback starts a fresh one, where a single `|` would pipe one
agent's stdout into another.

**B. Fleet attach-panes — only useful AFTER `dispatch.sh` exists.** These run
`tmux attach -t invar/<task>-<slug>`, and with `runOn: folderOpen` they would fire on every open. A
task attaching to a session that does not exist fails immediately and paints a dead pane, so these
must be generated per-dispatch rather than checked in as a static list — `dispatch.sh` writes the
entry, `land.sh` removes it. That keeps the roster honest: a pane exists if and only if a builder
does.

The ordering follows from that: A can land whenever, B is genuinely Phase 4.
