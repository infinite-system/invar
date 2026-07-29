# Brief — #263 round 2: implement the fix your diagnosis names

Your round-1 report is accepted as the diagnosis: Bun 1.3.14's
process-level SIGWINCH callback reads stale `process.stdout.columns/rows`;
OpenTUI compares against them and never emits the renderer resize;
Bootstrap never hears it. The report's "Contract needed for completion"
section is now your own spec — build it. (Round 1 stopped at "report
only"; no such restriction existed — implement now.)

Scope, in order:

1. **The runtime resize seam.** Your named direction: observe the
   `process.stdout` resize event (fresh dimensions) and drive OpenTUI's
   PUBLIC renderer resize path. Keep it at OUR seam — do not patch
   node_modules; if the clean form is upstream, our seam still must work
   with the shipped OpenTUI (name the upstream ask in the report). A
   harness-only signal is not a fix, per your own report.
2. **Restore terminal-shrink coverage** in `smoke-markdown-harness.ts`
   exactly as your spec states: 120x40 → 60x25 through the PTY driver,
   published width 60, both panes + divider inside the viewport, small and
   large fixtures. Positive control: disable the bridge, the smoke must
   fail on published width remaining 120 (emulator width alone is not a
   control — your words).
3. **The ioctl diagnostic gap**: `OpenPty.ts:424` discards the TIOCSWINSZ
   return value — make it fail loudly (an instrument must fail loudly; a
   failed resize must not masquerade as this defect). One assertion, in
   scope because it masks this exact defect class.
4. **The dock-growth finding** (RootView.ts:1106 preferring stale positive
   canvas dims): re-drive AFTER the seam fix; remove the #238 remount
   workaround ONLY if the path settles without it, else leave it and file
   the finding as its own follow-up in Bycatch with your evidence.
5. **The contract gap you named**: add the record that owns the runtime
   boundary (a successful PTY size change reaches the renderer with the
   same rows/columns) — in the terminal or layout record, argued.

Any red you meet: control it against unmodified main before classifying
(the #266 lesson from this hour — "outside my diff" needs a green main
run, quoted).

## Invariants in scope

- `project.invariants.md` bounded-viewport; `layout.invariants.md`
  slots-from-one-configuration; `markdown.invariants.md` live-split; the
  NEW runtime-resize-boundary record (point 5).

## Bycatch expected

Per AGENTS.md's taxonomy. The refreshed READY report carries `## Bycatch`
even if it reads `None observed`.

## End state (mechanical)

An UPDATED report (newer than this round's stamp): the seam fix, the
restored smoke green with its positive control quoted, the ioctl
assertion, the workaround decision with evidence, the new record, green
`bun test` + markdown/layout smokes.
