# 538 — panel chrome flake second wave

Priority: flake-evidence
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: medium

## In plain words

The panel drive flaked again under gate load, twice, after #529's fixes
landed. The old causes are dead, so something else load-sensitive
remains — most likely the 100,000-line rapid expand wait. Census and fix
with #529's method.

## Evidence (post-#529 sightings)

- gate-535-r2 (/tmp/merge-gate-failures.ccd48cd6b5416f57.3535209):
  contention panel-chrome FAIL.
- gate-537 (/tmp/merge-gate-failures.62c3db60c64b5adb.3950930):
  contention panel-chrome FAIL (gate still green — tier non-blocking).
- #529's own report noted the 100k rapid-expand isolated timeout as the
  class its fixes did NOT separately reproduce (claim was by generator).

## Outline

Extract the exact failing wait from both logs; loop that step solo with
#529's autopsy probe (three clocks: screen / hit grid / status file);
reproduce under 3-4x contention; fix wait or publisher, never the
timeout. #529's probes are committed on its branch history — reuse them.
