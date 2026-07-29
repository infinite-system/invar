# Brief — #280: comment drift — the doc must describe the code beneath it

Read first: [task-280-comment-drift-panecontent-scrollbarsync.md](task-280-comment-drift-panecontent-scrollbarsync.md)
— small documentation-integrity task; the record lists every confirmed
site including two bycatch folds from #291 and #281's landings.

Sites (the record's list governs; re-verify each against CURRENT code
before editing — some may have drifted further or been fixed):

1. [PaneContent.interface.ts](../../../../src/modules/ui/PaneContent.interface.ts)
   — says the seam is "not retrofitted onto the editor, tree, or
   Markdown panes" then names the tree and editor as citizens today.
   Confirmed twice (#281 re-read it).
2. ScrollbarSync comment drift per the record.
3. [Workspace.ts](../../../../src/modules/workspace/Workspace.ts) — two
   adjacent documentation blocks before `referenceIsExternal`; the
   first describes `resolveFileReference`, attached to the wrong
   method (#291's fold).

Rules: comments state WHY and the current contract — no history, no
"previously". If a comment describes behavior, verify the behavior by
reading the code it sits on (both polarities: the comment matches the
code, and the code does what the corrected comment claims). If any
comment is load-bearing in an invariants file, update the contract in
the same commit.

## Invariants in scope

The comment-integrity conventions in
[AGENTS.md](../../../../AGENTS.md);
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) records
only if a corrected comment is quoted there.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: each site quoted before/after with the code evidence,
any further drift found in the same files fixed, green typecheck +
conventions gate. The conductor gates at landing.
