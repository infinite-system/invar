# Brief — #238 round 3: your default-ON breaks six smokes' geometry + 2 file-grammar violations

The combined gate (main + #268 + your merge commit 31874403) ran RED at
06:42. Failure logs preserved at `/tmp/merge-gate-failures.2898354/`
(read them; frames included). Two defect groups, both yours:

**1. File grammar, enforced (conventions gate):**
`src/modules/markdown/MarkdownStructureSource.ts:24` — [class-file-order]
the eponymous class must be the first declaration after imports, and
[type-before-eponymous] types belong below the eponymous class and
namespace manifest. Fix the file's layout per the GLOBAL namespace-file
conventions.

**2. The structure pane's default-ON does to the whole smoke fleet what
#237's auto-open did to the editor smoke.** With your default, every smoke
whose fixture is a supported document now boots with the right dock open —
the editor narrows, and six smokes fail BOTH attempts on stale full-width
assumptions or waits that can no longer be satisfied:

- `smoke-editor-harness` — timed out on `desync)` right of
  editorPaneBorderColumn (even #268's freshly MEASURED arm: check whether
  your dock changes which `│` border the leftward scan finds, or just
  narrows the line so the text wraps/clips out of the window)
- `smoke-scrollbars-harness` — "wrap-off editor vertical thumb is painted"
- `smoke-horizontal-extent-harness` — "vertical scrolling reveals contract
  shape: dims plus rgba"
- `smoke-inline-rewrite-harness` — "first rewrite candidate is visible"
- `smoke-code-folding-harness` — grid condition timeout (frame shows the
  right pane occupying former editor columns)
- `smoke-diagnostics-harness` — same shape; the frame shows YOUR structure
  pane full of `▪ combinedLine…` entries
- `smoke-markdown-harness` — "FAIL preview row missing: alpha": with
  preview LEFT + structure RIGHT the editor is a third of the width;
  check whether the preview genuinely lost the row or the assert reads
  the wrong pane now.

THE LAW (from #268, now doctrine): **the smokes must hold under the app's
real defaults** — the user directed structure default-ON, so the smokes
adapt, not your feature. Fix by measurement (pane located at assert time),
the way #268's report shows for the editor smoke; if two smokes need the
same pane-measurement helper, extract ONE shared helper (seam at the
shared generator — do not paste it six times). Task #269 (a broader
geometry sweep) exists; fix HERE only what your default breaks in the
gate — leave #269's latent members alone but name any you notice.

Each fixed smoke keeps its property label and gets its positive control
(break the property, watch it catch).

Verify: run each of the seven smokes in your worktree, then the FULL
merge-gate (`bash scripts/merge-gate.sh`) — your round ends green end to
end, exit code read from the run itself.

## Invariants in scope

- The namespace/file-grammar conventions (MarkdownStructureSource.ts);
  each touched smoke's cited records — labels stay stable; your structure
  records from rounds 1–2 (the default stays ON).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The refreshed READY report carries `## Bycatch`
even if it reads `None observed`.

## End state (mechanical)

An UPDATED report (newer than this round's filing stamp) with: the
file-grammar fix, per-smoke fix + positive control evidence, and the full
merge-gate exit read from your own run.
