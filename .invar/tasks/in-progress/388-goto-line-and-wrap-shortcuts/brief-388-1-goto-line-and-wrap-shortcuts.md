# Brief 388-1 — shortcuts for go-to-line and wrap toggle

Read the task file in this folder; the user's request and boundaries
are verbatim there.

Work order:
1. Check the keybinding table AND the reserved-chord rules (task #194
   context: grep .invar/tasks for reserved-chord) for conflicts with
   Ctrl+G and Alt+Z. State the chosen chords and why in the report.
   If either standard chord conflicts, choose the nearest
   non-conflicting convention and say so.
2. Register both through the existing keybindings module — one
   registry, no parallel path.
3. Discoverability in the SAME change: keybindings help/settings
   surface, tooltips ("Go to Line (Ctrl+G)" pattern), and any help or
   welcome surface that lists shortcuts stays truthful.
4. Drive both chords in the harness FIRST (see them work), then
   extend the relevant existing smokes (goto-line and wrap smokes if
   present) with condition waits.
5. Verification: tsc, focused tests, extended smokes, checker
   --all/--refs.

Rules: no merge-gate.sh; no push; commit on the branch; READY report
here.

End state: report exists; chords stated with conflict-check evidence;
both driven; help surfaces updated; smokes green.

## Invariants in scope
- Keybinding/registry records — enumerate from the keybindings module contract if present; answer each.
- Any welcome/help truthfulness record (#354's class). Refute any missed.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
