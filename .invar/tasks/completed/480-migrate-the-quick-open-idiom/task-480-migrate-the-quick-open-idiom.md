# Task 480 — migrate the Quick Open idiom files

Priority: user-directed
State: COMPLETED — 04ea99ab — Landed: the Quick Open idiom retired across the suite. Migration remainder: shared machinery + agent/terminal + panel/layout + shell sites, per the #479 table.
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## Scope

Round 3 of the wait migration ("and the rest", user-authorized). The five
Quick Open idiom files from #479's remainder table: smoke-bracket-match,
smoke-git-blame, smoke-image-preview, smoke-breadcrumb, smoke-diagnostics
(-harness.ts each). One defect shape across six sites: after typing a query,
the wait matches a filename the file tree already paints, so Enter can
accept an unfiltered list. One fix shape: wait on the quickOpen model
(query, then matches[0] or selectedIndex) before Enter — proven in
smoke-horizontal-extent and by #475's landing.

Rules identical to prior rounds: graph sequences / screen asserts; both arms
where a control is converted; declare coverage deltas; measure, never
invent; honest stop at a file boundary.
Work list: the census + #479's remainder table.
Do NOT touch shared machinery (tui-harness.sh, HarnessSmoke, PtyTestDriver,
Drive.ts) — that set is reserved for a separate round to avoid conflicts.
