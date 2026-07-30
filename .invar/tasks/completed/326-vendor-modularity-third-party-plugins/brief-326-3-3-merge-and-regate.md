# Brief #326 round 3 — merge main and re-gate; your reds are fixed or filed

Your single gate run's reds are accounted for: the plugin-manifest
ordinal-drive red is FIXED on main (#337 landed — the smoke walks by
label now), and the word-delete Alt+Delete double timeout is filed as
task 374. Main has also moved substantially (about 8 landings).

Do now, in order:
1. git merge main into fleet/326-stage-two. Resolve conflicts carefully —
   your diff is large (kernel, plugins, extensions); the moved files
   include TabBarRenderer, tasks-dashboard, media, harness scripts.
2. Re-run your focused unit set + the runtime install/relaunch harness
   after the merge (cheap confirmation the merge broke nothing local).
3. Commit through the hook — no SKIP_GATE. If the gate goes green, done.
   If a red repeats: name it against the filed classes (214 panel-chrome,
   359 panel-split, 362 markdown clipping, 371 git-watch, 374 word-delete)
   and stop; the conductor decides.
4. Append the real GATE_EXIT chain and final commit hash to your report
   (the copy in the MAIN checkout task folder, absolute path), confirm
   clean tree, stop.

## Invariants in scope

Unchanged from your stage-2 brief; already answered in your report. This
round adds no feature code.

## Bycatch expected

Only anything new the merge or gate surfaces.
