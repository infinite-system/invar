# Task 424 — quit-confirmation smoke asserts theme tone before repaint under load

Priority: flake-evidence
State: COMPLETED — 41715591 — Ten assert-after-switch sites converted to condition waits across four smokes; census committed; both arms proven by plants; gate green on the exact tip. Bycatch: brief's invariants-in-scope was wrong (conductor error, acknowledged); hook-vs-brief tooling conflict noted, no task needed.
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Evidence (2026-07-31, #412 gate)

Full gate on the #412 combined tree failed once:
"FAIL scale 100000: No starts focused with the light theme selection
tone" at driveScale (smoke-quit-confirmation-harness.ts:247). Artifact:
/tmp/merge-gate-failures.0b0767ba2c5fb81d.1176140/. The smoke passes
standalone on main (exit 0) AND on the branch (exit 0); the branch
diff touches monitoring/lsp only. Failure shape: after switching to
the light theme at scale 100000, the assertion samples the frame
before the recolor paints — a wait that is not a condition, in the
smoke. See the wait-must-be-a-condition family.

## Work

Make the tone assertion wait on the CONDITION (frame shows the light
selection tone, bounded retries on frame ordinal, no wall-clock
widening). Census the same smoke for sibling assert-after-switch
sites. Prove both arms: planted wrong-tone must still fail.

## Second site, same family (gate run 2, same tree)

smoke-markdown-harness.ts: "FAIL 500-line dark preview paints rounded
header, body, and footer cells with one code background and a
readable label". Also standalone-green on main AND branch (exit 0
both). Two runs, two distinct paint-timing asserts under gate load.
Widen the census to ALL harness smokes: any assertion sampling a frame
right after a theme/preview switch without a condition wait.
