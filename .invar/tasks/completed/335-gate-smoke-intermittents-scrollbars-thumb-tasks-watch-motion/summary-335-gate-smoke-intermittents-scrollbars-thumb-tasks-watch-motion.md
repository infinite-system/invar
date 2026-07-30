# Summary — #335 (gate smoke intermittents: scrollbars thumb, tasks:watch motion)

Landed 359ca6da (25m dispatch-to-landing). Builder: codex sol high.

## What actually happened

Both intermittent reds were INSTRUMENT defects. No product paint defect, no
child starvation. The conductor's ranked-rivals brief held: for each smoke
the instrument hypothesis won.

- Scrollbars: the arm's rediscovery helper returned null on a live
  wheel-produced frame whose screen oracle contained the thumb (track 16161e,
  thumb 787c99, plainly in the preserved DIAG dump). Repair: discover the bar
  geometry once after the settled wait, then assert those exact cells in
  every driven frame.
- tasks:watch: the wait's predicate needed two live rows in
  building/exploring — a dependency on the REPOSITORY'S live task
  population. On a quiet tree the predicate was unreachable (the
  unreachable-wait family, again). Repair: a private task ledger via
  INVAR_TASKS_ROOT with one guaranteed motion row.

## Verification quality

Positive controls both ways (planted thumb-color change, planted timer stop —
each turned its arm red, quoted). Deliberate 7-process contention pool green.
Small and large drives (500 / 100,000 lines). Builder's hook gate ALL-PASS at
d0c8deae; verdict read from the cwd-resolved rollout (tmp/gate-verdict-335.log).

## Findings beyond the brief

The builder named two records the brief's invariant list MISSED (both
upheld): "Task truth lives in the folders the CLI reads" and "Dashboard
motion exists only while observed" (tasks-dashboard contract). Conductor map
gap, noted.

## Bycatch conversion

- #337 filed: plugin-manifest structure-scrollbar settled-geometry timeout,
  one retry-hidden occurrence, same defect shape #335 repaired. Accumulating,
  not dispatched.
- The tasks:watch clock record gap was already #330.

## What the conductor got wrong

- First landing attempt refused: #337's record was staged but uncommitted
  (dirty-tree). land.sh failed safe. Committed, relanded clean.
