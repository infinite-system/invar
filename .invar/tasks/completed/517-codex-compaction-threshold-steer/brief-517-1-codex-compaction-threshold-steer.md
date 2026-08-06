# Brief 517-1 — codex compaction lifecycle via notify

## In plain words

Give codex builders the same compaction survival claude builders
have, built from codex's own parts: the notify hook fires per turn;
our program warns BEFORE compaction (~70% usage), detects it AFTER
(usage-collapse edge), and steers the re-read — idempotently, one
reload per compaction. [The task file](task-517-codex-compaction-threshold-steer.md) is the full
accumulated spec: read EVERY section (mechanism, empirical
[AGENTS.md](../../../../AGENTS.md) verification, post-compact detection, idempotence — all
four layers with their self-test requirements).

## Order of work

1. VERIFY CURRENT DOCS FIRST: the codex notify payload shape and
   config registration (the task file's knowledge may lag the CLI).
   Then verify empirically whether codex re-includes [AGENTS.md](../../../../AGENTS.md) after
   MID-SESSION compaction (drive a session to compaction or study
   tonight's long rollouts) — report the answer loudly either way.
2. The notify program: small self-tested script (lane identity,
   usage read from payload/rollout, threshold warn, collapse detect,
   generation counter + cooldown state file, steer via
   scripts/fleet/steer.sh or a marker fleet-watch consumes — judge
   and say why).
3. Dispatch integration: plant the per-worktree codex config/profile
   registering the program at builder launch; land.sh cleanup if
   anything worktree-local is planted.
4. Self-test proving ALL arms: synthetic 80,15,22,28 fires once;
   replay same generation silent; oscillation capped by cooldown;
   below-threshold silent; restart resumes correctly.
5. Fleet-watch polling fallback arm only if notify proves unreliable
   — evidence first.

## Invariants in scope

none expected (fleet tooling); refute if wrong. The steer path must
use the confirmed-landing steer machinery, never raw send-keys.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the gate via
the planted policy; the conductor gates and lands.
