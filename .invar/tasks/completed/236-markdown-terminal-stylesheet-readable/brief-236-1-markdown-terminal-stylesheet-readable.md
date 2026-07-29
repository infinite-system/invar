# Brief — #236: a terminal stylesheet that makes markdown files show very well

Read first:
`.invar/tasks/in-progress/236-markdown-terminal-stylesheet-readable/task-236-*.md`
— the user's words are the requirement: "make md files have more padding to
show very well, present .md files properly (tables blockquotes, etc, make a
sort of css in terminal approach)". Reading is the new writing.

Drive first (RULE ZERO): open real markdown files in the preview —
[project.briefing.md](../../../../project.briefing.md), a README with tables, blockquotes, nested lists, code
fences — LOOK at them, then improve, then look again. Your inner loop is
seconds. The deliverable is a STYLESHEET SEAM: one place where markdown
element classes (heading levels, paragraph, table, blockquote, code fence,
list, rule) map to terminal presentation (padding, indent, color intensity,
borders) — a css-in-terminal generator, not scattered per-element literals.
Themes consume it; the markdown renderer asks it. Padding is the user's
named pain: give body text breathing room from the pane edges.

Ragged tables are #174's landed territory — extend, do not re-roll. Do not
touch preview PLACEMENT (left-side + auto-open is #237, a sibling task).

Done-test: drive the same real files before/after; the report carries
frame-grab evidence of tables, blockquotes, fences, and padding at 80 and
120 columns. A unit census proves no markdown element resolves presentation
outside the stylesheet seam.

## Invariants in scope

- The markdown module's records (`src/modules/markdown/*.invariants.md`) —
  the stylesheet seam becomes a record: *markdown presentation resolves
  through one stylesheet*.
- Theme records if the stylesheet consumes theme colors — one mark table
  law applies.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Verification

Full local verification, exact exit codes. Drive the real app; frame
evidence in the report. Do not run merge-gate. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored.
