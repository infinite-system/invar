# READY — 565 conductor action verbs and the night digest

## In plain words

The conductor's own actions now leave a paper trail and carry their
safety rules. Committing refuses wrong-scope sweeps and mid-gate
writes; testing reports parsed counts instead of a glance; gating
stamps which tree and commit it judged; landing refuses a tree that
moved after its gate. And the morning question — what did the
conductor fight with — is answered by a query over the ledger, not by
the survivor's summary.

## Delivered

- actions module: commit (pathless refused outside fleet worktrees;
  mid-gate refusal via GATE_TREE stamps; post-commit path
  verification), test (counts parsed from BOTH streams — bun test
  summarizes on stderr, the verb's own blind spot caught by its own
  colocated test), gate (stamps GATE_TREE + GATE_TREE_TIP, registers
  the log, runs the repo's own merge-gate.sh — one-place rule).
- land.sh tip guard: stamped-log tip must equal the branch tip
  (exit 6 otherwise); unstamped old logs pass unchecked.
- digest module + graph node: fights (>=2 consecutive failures of one
  subject, resolution marked), time-by-verb accounting, gate verdict
  rows with stamps. `get digest` is the night, legible.
- CLI: commit/test/gate commands; all actions ledger to
  .invar/harness-events.jsonl.

## Invariants in scope (answered)

- A wrapped script keeps its logic in one place: upheld — gate verb
  adds only metadata (stamps/registration); merge-gate.sh and land.sh
  stay the authorities; the tip guard lives ONLY in land.sh.
- Only the files arbitrate process state: upheld — mid-gate detection
  reads the registry and logs, never process state.

## Verification

- 71 tests (planted-defect arms: pathless refusal, mid-gate refusal
  with after-verdict silent arm, red-test counting, stamp+registry).
- land.sh guard driven LIVE both arms: mismatched stamp -> REFUSING
  exit 6; matched stamp -> "tip stamp verified" then normal guards.
- Gate GREEN first run (GATE_EXIT=0, /tmp/gate-565.log), hands off
  the tree during the run (the r2 lesson, applied).

## Bycatch

- bun test writes its summary to stderr — anything parsing test
  output from stdout alone reads zero counts (relevant to any future
  wrapper; encoded as a comment at the capture site).
