# Brief 414-1 — repair two rotted invariant citations

You fix pointers, not claims. Two records cite files that no longer
exist. Each claim appears true; the evidence path rotted.

1. "Appearance is data with a capability fallback" in
   [project.invariants.md](../../../../project.invariants.md) cites src/modules/ui/PanelHeading.ts, which
   is absent. Find where that mechanism lives now (grep the symbol
   names in the record's Mechanism/Evidence fields). Re-point the
   citation to the current file and symbol. Verify the cited code
   still enforces the claim before you write the new path.
2. "Undo records deltas not whole-document snapshots" in
   [src/modules/editor/editor.invariants.md](../../../../src/modules/editor/editor.invariants.md) cites
   src/modules/editor/TextDocument.ts. The implementation lives at
   src/modules/text/TextDocument.ts. Confirm that file still records
   deltas, then re-point.

Rules:
- Edit ONLY the two contract records' Evidence/Mechanism citations.
  Do not reword the invariant statements. Do not touch code.
- After the edits run:
  node .claude/skills/invariants/scripts/check_invariants.mjs --all
  node .claude/skills/invariants/scripts/check_invariants.mjs --refs
  Both must be clean for the files you touched.
- Update each record's "Last refined" date.
- Do NOT run scripts/merge-gate.sh. Do not push. Commit on your
  branch and write the READY report.

End state: a report file exists in this folder; both checker runs
clean; two commits or one covering exactly the two contract files.

## Invariants in scope
- "Appearance is data with a capability fallback" — [project.invariants.md](../../../../project.invariants.md) — its own citation is the work.
- "Undo records deltas not whole-document snapshots" — [src/modules/editor/editor.invariants.md](../../../../src/modules/editor/editor.invariants.md) — its own citation is the work.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy (runtime defects, invariant
violations, comment drift, distillation possibilities, nonsense).
Include a ## Bycatch section even if it reads: None observed.
