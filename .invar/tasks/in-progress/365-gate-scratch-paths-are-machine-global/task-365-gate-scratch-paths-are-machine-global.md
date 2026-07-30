# #365 — two gate scratch paths are machine-global across concurrent gates

State: IN-PROGRESS
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #90 (census findings 2 and 3)

1. /tmp/merge-gate-binary-build/iv is ONE path for every gate on the
   machine. 5/5 concurrent pairs stayed green (evidence of absence only
   that far); a per-worktree suffix costs one string.
2. /tmp/merge-gate-failures is a machine-wide symlink to the NEWEST
   gate's failure directory — two gates leave it pointing at whichever
   started later, so a builder can diagnose another builder's red (the
   read-the-verdict lesson's class).

## Work

Namespace both by worktree (gates MAY overlap by doctrine; their artifacts
must not). Positive control each: two concurrent gates, prove each reads
only its own binary and failure dir.
