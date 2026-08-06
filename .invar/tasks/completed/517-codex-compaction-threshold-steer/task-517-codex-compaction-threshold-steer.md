# Task 517 — fleet-watch steers codex builders near their context limit

Priority: architecture-hygiene
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
State: COMPLETED — 7583d179 — Codex lanes survive compaction: notify-hook threshold warning, post-compaction usage-collapse detection, idempotent doctrine re-send; bycatch converted to #523-#525.

## In plain words

Codex builders compact around 250k with no hook mechanism. The
passive defenses exist (the preamble's re-read-on-compaction standing
order; the on-disk BUILDER-FUNDAMENTALS.md). Add the ACTIVE defense:
fleet-watch reads each codex builder's rollout file for token usage
and, when a lane crosses ~70% of its window, emits a CODEX-NEAR-
COMPACT event; the conductor (or fleet-watch itself, judge which)
steers: "compaction imminent: commit WIP now, then re-read
BUILDER-FUNDAMENTALS.md and TASK.md wholesale after it happens."

## The work

1. Establish what the codex rollout JSONL exposes about token usage
   (read a real one in tmp/transcripts session links); if usage is
   absent, fall back to a bytes-of-rollout heuristic calibrated
   against tonight's sessions.
2. fleet-watch gains the check per live codex lane, throttled (one
   event per lane per threshold crossing), with both arms proven
   (a synthetic rollout above threshold fires; below stays silent).
3. Decide steer-directly vs event-for-conductor; wire it; self-test.

## Scope addition (2026-08-06): VERIFY the AGENTS.md tier empirically

Dispatch now injects the fundamentals into the worktree's AGENTS.md
(codex's mechanical re-prime tier). ASSUMED, not proven: that codex
re-includes AGENTS.md content after ITS OWN compaction, not only at
session start. Verify empirically: drive a codex session to
compaction (or study the rollout structure of tonight's long
sessions), and confirm the post-compaction context carries AGENTS.md
content. If it does NOT: the threshold steer becomes the primary
defense and this task's report says so loudly.

## Preferred mechanism (2026-08-06): the codex notify hook

Codex's config.toml supports `notify` — an external program invoked
with a JSON payload on agent-turn-complete. That is a per-turn,
codex-paid heartbeat: our notify program can check the lane's rollout
usage each turn and fire the near-compact steer EVENT-DRIVEN, no
polling. Work: dispatch plants a per-worktree codex config (or
profile) registering the notify program; the program is a small
self-tested script (lane identity from cwd/payload; threshold check;
steer or marker-file for fleet-watch). Verify the payload shape
against current codex docs FIRST — the CLI moves fast and this task
file's knowledge may lag. Fleet-watch polling remains the fallback
arm if notify proves unreliable.

## Post-compact detection (user design, 2026-08-06) — the second half

The notify program also DETECTS compaction after the fact: keep a
per-lane last-seen-usage marker (state file keyed by worktree); on
each turn-complete, compare — a collapse (e.g. >60% last turn to
<20% now) means compaction just happened. Fire the POST-COMPACT
steer immediately: "context was compacted — re-read
BUILDER-FUNDAMENTALS.md and TASK.md wholesale before continuing."
This reconstructs Claude Code's SessionStart(compact) hook from
codex's own parts. Both arms proven: a synthetic usage collapse
fires; normal growth and small dips stay silent (threshold chosen so
a long tool-output turn cannot false-positive — calibrate against
real rollouts). Task rename at dispatch: this is now "codex
compaction lifecycle via notify" — warn-before AND detect-after.

## Idempotence requirements (user, 2026-08-06) — one reload per compaction

- EDGE-TRIGGERED by construction: the marker updates every turn, so
  only the high->low TRANSITION fires; steady-low turns are growth
  comparisons and stay silent. This is the primary mechanism — prove
  it with a synthetic sequence (80,15,22,28 -> exactly one fire).
- COMPACTION GENERATION: each detection increments a per-lane
  generation in the state file; the steer carries it ("compaction
  #2 detected"); a detection with the same generation never
  re-steers (protects against notify replays/restarts).
- COOLDOWN backstop: at most one post-compact steer per lane per 5
  minutes, so a pathological oscillation cannot spam the builder
  with doctrine reloads (5 loads in a row is the named failure).
- The steer TEXT is idempotent too: "if you already re-read your
  fundamentals after this compaction, continue working" — the
  builder never stacks copies.
All four proven in the self-test: replay, oscillation, restart, and
the clean single-fire path.
