# Brief — #254: move the workers guard before the gate's side effects

Read first:
`.invar/tasks/in-progress/254-gate-workers-validated-after-side-effects/task-254-*.md`.

One move, proven #251's way: `INVAR_GATE_WORKERS` validation (currently
~line 407 of `scripts/merge-gate.sh`) joins the preflight block at entry,
BEFORE pid publication, orphan reaping, and failure-log publication
(~279-338). Guards go first or they are not guards — this exact rule has
three prior bites in [project.conductor.md](../../../../project.conductor.md) family 10, and #251 found this
fourth by inspection.

Verify OUTSIDE the apparatus, both polarities, in a scratch tree:

- Invalid `INVAR_GATE_WORKERS` (e.g. `banana`, `0`, `-3`): the gate refuses
  BEFORE any side effect — assert the pid file, reap output, and failure-log
  publication are ABSENT after the refusal, and quote the refusal + exit
  code.
- Valid value: preflight passes silently and the run proceeds to its normal
  next step (you may stop it there; do not run the full gate).

While you are in the entry neighborhood: #251's report suspected siblings —
any other check that runs after a side effect is bycatch.

## Invariants in scope

- The gate's preflight contract (merge-gate.sh header, extended by #251) —
  add the workers clause to the stated preflight facts.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy — guards-after-side-effects siblings especially.
The READY report carries `## Bycatch` even if it reads `None observed`.

## Verification

`bash -n` exit 0; both control arms quoted with exit codes; prettier check
on touched files. Do not run the full merge gate. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored.
