# 287 — the preview collapses task-header lines into one line

State: COMPLETED — 98c25506 — metadata stacks render as stacks; H1 color not underline
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: USER-DIRECTED (2026-07-29 12:1x)

## Outline

User report: a task file's header block —

    State: ACTIVE
    Created: 2026-07-29
    Engine: codex
    ...

renders as ONE joined line in the markdown preview. CommonMark does join
single-newline lines into a paragraph — but these files are the app's own
first-class content now (walkable views, #276), and a Key: value stack
must READ as a stack. Decide the mechanism honestly and record it:

- soft-break-as-line-break rendering mode (GitHub-comment style) for the
  preview, OR
- recognize consecutive `Key: value` lines as a definition-list-like
  block, OR
- another principled rule.

Whatever the rule, it must be a RECORDED renderer semantic (markdown
record), not a task-file special case; normal prose paragraphs must
still reflow (both polarities: header stack stays stacked, prose joins).

## Second arm (user, 12:2x): H1 styling

Heading 1 in the preview should NOT be underlined — distinguish it by
color instead (a different color alone suffices, per the user). Both
themes; the H2+ treatments stay as they are unless consistency argues
otherwise (say so if it does). This is the #236 stylesheet's territory —
refine that record, keep its label.

## Invariants in scope

- The markdown renderer/stylesheet records (#236's family); the split
  record untouched.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 12:1x.
