# Brief #365 round 1 — namespace the gate's machine-global scratch paths

codex auto-reads [AGENTS.md](../../../../AGENTS.md). Reason with IBR.

## The task (user-directed: increase gate parallelism safely)

Two gate scratch paths are machine-global; doctrine says gates MAY
overlap, so their artifacts must not collide:

1. The binary build path (one /tmp merge-gate-binary-build/iv for every
   gate on the machine). #90's census ran 5/5 concurrent pairs green, but
   that is evidence only as far as 5 pairs reach; a per-worktree suffix
   costs one string.
2. The failures symlink (/tmp/merge-gate-failures points at the NEWEST
   gate's failure directory) — two gates leave it pointing at whichever
   started later, so a builder can read another builder's red (the
   read-the-verdict class).

## Work

1. Read scripts/merge-gate.sh: find every /tmp path the gate writes that
   lacks a per-worktree (or per-run) component. The two above are known;
   census the rest of the script the same way (#90's method).
2. Namespace by worktree path hash or basename. Keep a stable well-known
   pointer per WORKTREE (a builder reading its own failures must still
   find them without guessing), and keep any machine-wide pointer only if
   something genuinely consumes it — check consumers by grep before
   deciding (shared seam: verify every consumer).
3. Positive controls, both polarities: two concurrent gates in two
   worktrees — each reads ONLY its own binary and its own failure dir
   (plant a distinguishable failure in one, prove the other never sees
   it); and a single gate still finds its own artifacts at the documented
   location.
4. Update any doc/skill text that names the old paths (grep for the
   literal strings across the checkout).

## Rules

- No merge-gate.sh full runs by hand for iteration — test the PATH logic
  with targeted probes; the final commit's hook gate is the one full run.
  No SKIP_GATE. Commit BEFORE writing READY; real hash + GATE_EXIT in the
  report header. Report to the main checkout task folder (absolute path).
- Known flaky classes: #214, #359, #362, #371, #374. Name, do not chase.
- Builders never push; the conductor lands.

## Invariants in scope

- Gate/harness records that name failure artifacts or the binary build
  (grep the contracts for the literal path strings). The quiet-lock and
  retry-tally records if they share the pattern. Answer record by record;
  list missed records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md) taxonomy; include ## Bycatch even if "None observed."

## Definition of done

READY report in this folder, standard naming (report prefix, number 365,
the task slug, md extension): the /tmp census, the namespacing design,
both-polarity concurrent-gate proof, gate chain, invariants answered,
bycatch.
