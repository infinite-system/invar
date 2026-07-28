# TASK — Git panel UX pair: hover spillover + focus-stealing (#118, #120)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-gitpanel`
(branch `fix-git-panel-ux`, forked from main at `49c6a5e`). Do NOT run `scripts/merge-gate.sh`;
do NOT push/merge/tag/delete. Commit (one commit per fix is fine) and report to
`/tmp/git-panel-ux-READY.md`. `bun install --frozen-lockfile` first.

Two user-reported defects in the source-control pane. REPRODUCE each before diagnosing — five
confident structural diagnoses died to measurement in this repo in two days.

## Defect A (#118) — staging-list hover paints onto the NEXT row

User, verbatim: "git staging files, on mouse hover, shows artifact on the next line, extending the
lines in the panel, should be fixed and asserted."

Hovering a file row in the staging list paints spillover onto the FOLLOWING line, visually
stretching rows. Suspect class (verify, do not trust): a hover background span not clipped to the
row, or a hover label painted at row+1 — the multi-line bg-SPAN mis-positioning family (see
reference: code-body bg() renders per-cell; only multi-line bg SPANS mis-position). Drive the real
pane with mouse-move through the PTY driver, byte-compare the NEXT row before/during hover: today
it CHANGES (that is the reproduction); after the fix it is IDENTICAL, and the hovered row's
decoration is confined to its own span. Ratchet exactly that assertion into the git pane smoke —
the user said "and asserted".

## Defect B (#120) — browsing commits steals focus to another pane

User, verbatim: "Selecting files in the git commits panel, or even selecting the commit causes the
focus even and refocuses to another pane, so browsing commits is not fun and doesnt work properly,
needs a solid fix and better tests for behavior."

The rule to implement: **selection previews; activation transfers.** Arrow keys and single click
on a commit or a file within it update the PREVIEW (comparison surface) WITHOUT moving focus — the
commits panel keeps focus and further arrows keep browsing. Only explicit activation (Enter or
double-click) transfers focus to the opened surface. Precedent: the filetree landing fixed a stale
focus bit with a sync-flush focus projection in Bootstrap — read that fix first; this is the same
authority family and the fix likely belongs at the same seam (whoever opens the preview must open
it WITHOUT claiming focus, not open-then-restore, which flickers and re-fires watchers).

Driven behavior tests, per the user: walk 3+ commits and files by arrows and clicks asserting
focus stays on the commits panel THROUGHOUT while the preview updates; Enter on a file asserts
focus moves; Escape returns per the existing git.leave binding. Assert from published status
(focus field), not from paint alone.

## Verification — exact exit codes

Full checker suite; the two new/extended driven assertions; three runs each on touched smokes; one
loaded run; idle-quiescence green; coverage declarations (counted grammar, APPEND). Record/refine
invariants: hover decoration confined to its row; selection previews without focus transfer.

## Rules

Full descriptive names, 80 columns, ivue conventions. The comparison surface and pane content
belong to the source-control plugin; Bootstrap focus projection is a host seam — if the fix
belongs there, keep it surgical. Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`;
clean tree; no TASK files.
