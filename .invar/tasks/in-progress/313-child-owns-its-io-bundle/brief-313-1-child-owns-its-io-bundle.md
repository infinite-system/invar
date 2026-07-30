# Brief — BUNDLE: the child owns its I/O (#313 mouse passthrough + #315 child colors)

Two USER-DIRECTED tasks, one principle, same seams: what a child TUI
app requests is what it gets — its mouse events and its colors. Read
both records first; verbatim words govern:

- [task-313-terminal-mouse-passthrough-to-child-apps.md](../../active/313-terminal-mouse-passthrough-to-child-apps/task-313-terminal-mouse-passthrough-to-child-apps.md)
- [task-315-terminal-child-colors-must-not-be-themed.md](../../active/315-terminal-child-colors-must-not-be-themed/task-315-terminal-child-colors-must-not-be-themed.md)

## Work discipline

- DIAGNOSE FIRST on both, measure before briefing a cause: each record
  ranks hypotheses — verify against the actual code and quote what you
  find. Reproduce with loud positive-control child fixtures BEFORE
  fixing (an SGR-mouse echo child for #313; a color-matrix child for
  #315 — share the fixture scaffolding, one child harness can do both).
- ONE COMMIT PER TASK NUMBER (#313 then #315, or the reverse if the
  diagnosis says colors are upstream of mouse routing — say so), full
  gate through the enforcing hook, NO SKIP_GATE commits.
- The shared boundary decision — pane CHROME belongs to Invar (themed,
  clickable for Invar), child CELL CONTENT belongs to the child (its
  colors, its mouse events when it requested them) — is ONE decision
  recorded once and cited by both contracts.
- Check the OpenTUI layer for both: the bracketed-paste record shows
  the pattern (upstream parses, nothing enables/routes). Wheel-scroll
  ownership and default-fg/bg decisions follow what real terminals /
  VSCode do — cite.
- Both polarities everywhere per the records; real acceptance drives:
  Claude Code's scroll-to-bottom button responds to a click; Claude
  Code text renders its own white; oh-my-zsh prompt colors match a
  reference capture.

## Invariants in scope

terminal records, agent records, OpenTUI integration records, theme
records — the FrameProbe reference (code-point indexing, truecolor,
per-cell bg) applies to every assert.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report with per-task sections (diagnosis quoted, fix, evidence,
commit hash each), shared-fixture harness registered, final full gate
GATE_EXIT=0 through the hook. The conductor gates at landing and
completes both records.
