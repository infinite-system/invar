# Brief 423-1 — class-closing sweep of PanelHeading-era naming

Read the task file in this folder. Two records are named there; the
real job is ending the chain: case-insensitive grep for
panel-heading, PanelHeading, and interfaceGlyphVocabularies across
every *.invariants.md and *.lattice.md in the checkout, and repair
EVERY remaining mention in one change. Repoint to current
PanelTabBar/ThemeIcons artifacts; verify each new citation actually
demonstrates its claim before writing it. Never demote a record whose
artifact was superseded — repoint.

Rules: contract files only; no code edits; no statement rewording
(propose refines in the report instead). After edits, clean:
  node .claude/skills/invariants/scripts/check_invariants.mjs --all
  node .claude/skills/invariants/scripts/check_invariants.mjs --refs
Update Last refined dates. No merge-gate.sh; no push; commit on the
branch; READY report here, with the full grep output before and after
(after must be empty).

End state: report exists; sweep grep empty; checker clean.

## Invariants in scope
Every record the sweep touches — list them in the report with verdicts.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
