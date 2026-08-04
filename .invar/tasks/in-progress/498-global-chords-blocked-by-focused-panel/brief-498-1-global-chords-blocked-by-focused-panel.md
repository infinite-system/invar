# Brief 498-1 — reserved-or-global chords must survive a focused panel

## In plain words

With a panel focused (agent, terminal), app chords like Ctrl+Shift+X
(Extensions) and Ctrl+P (Quick Open) die: the panel keeps every
non-reserved key. Users lose the app while inside any panel. The
applicationGlobal binding tier (built in #356) is exactly the
mechanism — decide which app chords ride it, apply, and prove by
driving from a focused terminal and a focused agent pane.

## Read first

[The task file](task-498-global-chords-blocked-by-focused-panel.md) — evidence (Ctrl+Shift+X reproduced x3 in #356;
the nearby Ctrl+P note) and the coordination note (490 landed; the
keybinding files are free). The applicationGlobal contract wording
lives in "Focus owns the keystroke" ([the keybindings contract](../../../../src/modules/keybindings/keybindings.invariants.md),
refined 2026-08-03): one modified, single-chord, effective binding;
frame-scoped action; no modal overlay; layer shadowing applies.

## The work

1. Enumerate the app-tier chords a user reasonably expects to work
   from inside a panel: view/navigation openers (Extensions, Quick
   Open, command palette F1, settings, shortcut help, panel/sidebar
   toggles, workspace cycling). For EACH, decide: applicationGlobal,
   reserved (already), or legitimately owned by the pane (e.g. the
   terminal must keep raw Ctrl+P for readline!). The terminal's
   byte-fidelity is the hard constraint — a chord the child shell
   uses NEVER becomes global; check the keyboard smoke's sweep list.
2. Apply the applicationGlobal flag where decided (bindings are data;
   no core special cases).
3. Drive from a focused terminal AND a focused agent pane: each
   promoted chord acts; each pane-owned chord still reaches the pane
   (byte sweep stays green).
4. Ratchet: extend smoke-keyboard-invariant.sh (or the panel smoke)
   with the promoted-chord arms.

## Decision discipline

Any chord where the right owner is genuinely arguable (Ctrl+P!):
implement your best call, and list it in the report under "Decisions
for the user" with the tradeoff — the conductor carries them to the
user; do not agonize.

## Invariants in scope

- Focus owns the keystroke; Bindings are intent addressed
  ([src/modules/keybindings/keybindings.invariants.md](../../../../src/modules/keybindings/keybindings.invariants.md))
- A focused panel routes keystrokes to its active pane content
  ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md))
- The terminal byte-sweep records in the keyboard smoke.
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the full gate
via the planted policy (or SKIP_GATE=1 if absent); the conductor
gates and lands.
