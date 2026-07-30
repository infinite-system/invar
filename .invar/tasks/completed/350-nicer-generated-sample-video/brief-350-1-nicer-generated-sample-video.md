# Brief #350 round 1 — a sample video worth watching

Read [CLAUDE.md](../../../../CLAUDE.md) and [AGENTS.md](../../../../AGENTS.md) fully first. Load the /ivue and /invariants
skill docs before touching governed code. Reason with IBR.

## The task

The demo "Sample Video" is ffmpeg's testsrc2 test pattern. The user calls
it ugly. Replace the lavfi source with something worth watching.

## Method — drive first, contract last

1. Reproduce by DRIVING: open the sample video in the real app path (PTY
   harness drive), see testsrc2 render.
2. Iterate drive -> change -> drive. Only
   src/modules/media/FfmpegVideoSource.ts sampleArgumentVector changes the
   source. Candidates: mandelbrot, life (with color), gradients, or a small
   filter chain (gradients + hue rotation). Pick the best-looking at pane
   resolution and 15fps. Subjective call is yours; put a frame capture per
   candidate in the report.
3. Compatibility: the source must exist in stock ffmpeg 6.x; prefer one
   present since ffmpeg 4. The user runs 6.1.1; /usr/bin/ffmpeg exists in
   this VM.
4. The fake-ffmpeg smoke parses size= from the filter string — confirm it
   still matches, adjust the parse if the filter string shape changed.
5. The pane label may take the source's name if that reads better.
6. Write or extend the contract assertion only AFTER the picture is right.
   One verification pass at the end.

## Rules

- Do NOT run scripts/merge-gate.sh yourself, and do NOT use SKIP_GATE.
  Commit normally and let the commit hook run the gate. A landable
  GATE_EXIT=0 verdict chain in your final commit is part of DONE.
- Builders never push. The conductor lands.
- Known pre-existing gate reds: panel-chrome Terminal-2-list-close (#214)
  and structure-outline timeouts (#337). If one of those bites, say so
  explicitly in the report; do not chase them.

## Invariants in scope

- Missing ffmpeg is loud and harmless — [src/modules/media/media.invariants.md](../../../../src/modules/media/media.invariants.md)
  — the sample pipeline must keep its loud-failure behavior when the source
  name is unavailable.
- Answer record by record in the READY report: upheld / violated / needs
  refinement, plus any record this list missed.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy (runtime defects, invariant
violations, comment drift, distillation possibilities, generator drift,
nonsense). Include a ## Bycatch section even if it reads: None observed.

## Definition of done

READY report named ``report-350-<slug>.md` (this task's slug)` in this folder:
chosen source + why, frame captures per candidate, smoke status, gate
verdict chain, invariants answered, bycatch section.
