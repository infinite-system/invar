# 238 — structure pane: enabled by default, right of files that need it, md table of contents

State: COMPLETED — 578b728a — structure default-ON right + md TOC; smoke fleet adapted to real defaults
Created: 2026-07-29
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
Priority: user-directed
Assignment note: User roadmap 2026-07-29. Strictly after #35 lands — this refines its pane.

## Outline

Three refinements to #35's structure navigator, user's intent verbatim:

1. **Enabled by default** — the plugin ships on, like the editor contributor.
2. **Shows at the RIGHT side, for files that need it** — js/ts/css get the
   symbol outline in the right dock beside the file (the user names these for
   shortcuts). Appears when the active file has structure to show; absent
   honestly otherwise (not an empty pane).
3. **Markdown gets a table of contents** — headings as the structure source
   for .md files, navigable like symbols. This makes the structure pane the
   reading companion for the md-heavy workflow (#235-#237's theme).

Structure sources compose: LSP symbols where a provider offers them (js/ts),
a css structure source, and a markdown heading source — each a provider
behind #35's seam, per the provider-kind taxonomy. Adding the md source must
be a provider registration, zero host edits (the proof standard #35
establishes).

## Invariants in scope

- Whatever [structure.invariants.md](../../../../src/modules/structure/structure.invariants.md) #35 authors — this task extends it and
  must keep it SHORTER-or-clearer per the burden-of-proof rule.
- The right-dock records in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).
- The provider-kind records (#103).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- User goal message 2026-07-29 (~02:1x).
- #35's report (once landed) — the seam this builds on.
