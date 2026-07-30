# Brief #351 round 1 — quick open search bar vanishes, list corrupts

Read [AGENTS.md](../../../../AGENTS.md) fully before any work. Load
[.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md) and the
ivue skill. The task file in this folder is the brief body: verbatim user
symptom (Ctrl+O, type "326", search bar disappears, scroll-up cannot
recover, list messed up) and THREE ranked rivals — overflow eats the input
row / stale scroll offset past a shrunken extent / long-path row wrapping
breaking fixed-row-height math.

1. Reproduce by DRIVING first, in THIS repo's tree (read-only, safe), at
   100x30 and at a small geometry. Type "326" and dump frames: where does
   the input row go? Read overlayDialogBounds/overlayScrollPositions from
   status while it happens — the numbers separate the rivals.
2. Fix the winner at its generator (likely BoundedListPopup or QuickOpen
   layout/scroll seam). No timeout, no clamp-as-bandaid without naming why
   the offset escaped.
3. Ratchet: a smoke asserting the input row is visible at EVERY scroll
   position and result-set size transition; positive control (plant, quote
   red, remove).
4. Final pass: relevant smokes + `bunx tsc --noEmit; echo TSC=$?` +
   invariants checker --all --refs. Let the commit hook run the gate (no
   SKIP_GATE); known pre-existing reds: #214 panel-chrome class, #337
   structure-outline class — quote, do not chase.

No push/merge/tag. READY report as `report-351-<slug>.md` here. END STATE:
report exists, winning rival named with driven numbers.

## Invariants in scope

- ui contract records for overlays/BoundedListPopup (overlay bounds are
  published state); scroll contract "One generator owns each scroll
  position". Report each implicated record; name any this list MISSED.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; section present even if
"None observed".
