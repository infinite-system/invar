# Brief 538-1 — the panel-chrome flake, second wave

## In plain words

The panel drive flaked twice more under gate load after the first fix
landed. The old causes are dead, so a different load-sensitive wait
remains. Find it with the proven autopsy method and fix the wait or its
publisher, never the timeout.

## End state (mechanically checkable)

A report newer than dispatch containing: the exact failing wait from
BOTH post-fix logs (below), a reproduction verdict under 3-4x
contention with run counts, and either a fix whose smoke passes 5x solo
+ 5x under 3x contention, or a precise diagnosis naming which clock
each side of the wait reads.

## Evidence

- gate-535-r2: /tmp/merge-gate-failures.ccd48cd6b5416f57.3535209/
  contention-panel-chrome-*.log
- gate-537: /tmp/merge-gate-failures.62c3db60c64b5adb.3950930/
  contention-panel-chrome-*.log
- Prior art: #529 (completed folder) killed the status-publisher and
  blind-press classes; its report flagged the 100,000-line rapid expand
  wait as the class it proved by generator only. Its two looping
  autopsy probes are committed in its branch history
  (probe-529-press-cancel-loop.ts, probe-529-drag-span-loop.ts) — reuse
  the pattern: loop the failing step solo, autopsy at timeout asking
  which clock (emulator screen / native hit grid / settled status file)
  each side of the wait reads, liveness-jiggle to prove quiescence.

## The bar

A wait must be a condition. No timeout widening, no assertion
weakening, no tier skip. If the publisher genuinely starves under load,
that is a product defect — name the starved path.

## Invariants in scope

"Rendering is one coarse frame effect"
([app.invariants.md](../../../../src/modules/app/app.invariants.md)) —
refined by #529 with the starved-wait impossible-shape; answer whether
the second wave stresses it further.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
