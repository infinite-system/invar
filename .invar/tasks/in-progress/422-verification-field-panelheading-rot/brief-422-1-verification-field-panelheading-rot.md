# Brief 422-1 — repoint three records naming removed PanelHeading artifacts

Read the task file in this folder — it carries the exact records and
evidence from #414's bycatch. The claims are true; the artifacts were
superseded when PanelTabBar took over the projection (commit
9ac75e4b). Repoint, never demote.

Work, per record:
1. "Appearance is data with a capability fallback"
   ([project.invariants.md](../../../../project.invariants.md)):
   Verification names missing src/modules/ui/PanelHeading.test.ts —
   repoint to the PanelTabBar-era test that verifies the same claim.
2. "Appearance comes only from theme data"
   ([theme.invariants.md](../../../../src/modules/theme/theme.invariants.md)):
   update $interfaceGlyphVocabularies naming and the missing test path
   to current symbols/files.
3. "Panel controls share paint and hit geometry"
   ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)):
   Scope, Mechanism, Evidence, Verification all name removed
   PanelHeading code/tests — re-derive each field against PanelTabBar.

Rules:
- Verify each repointed citation actually demonstrates the claim
  before writing it (existence is not proof).
- Contract files only; no code edits. Do not reword the invariant
  statements unless a field is now FALSE — then propose the refine in
  the report instead of applying it.
- Run both after edits, clean required:
  node .claude/skills/invariants/scripts/check_invariants.mjs --all
  node .claude/skills/invariants/scripts/check_invariants.mjs --refs
- Update Last refined dates. Do NOT run scripts/merge-gate.sh; do not
  push. Commit on your branch; READY report into this folder.

End state: report exists; three records repointed; checker clean.

## Invariants in scope
The three named records themselves — their fields are the work.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) bycatch taxonomy; include a ## Bycatch
section even when it reads: None observed.
