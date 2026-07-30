# 321 — terminal: child TUI repaints flicker (tasks:watch at 30fps); honor synchronized updates

State: COMPLETED — f0a860bf — DEC 2026 child synchronized repaints + tasks:watch diff frames; flicker gone (landed in #320 bundle merge f64f85ef)
Engine: codex
Model: 5.6-sol
Effort: high
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> another detail, the 30fps bun tasks:watch inside Invars terminal is
> flickering any way to reduce or get rid of flicker altogether?

## Design — two arms, both ends of the pipe

Diagnose FIRST (measure before briefing a cause): capture what
tasks:watch actually emits per frame (clear-screen? cursor-home
rewrite? partial diff?) and how Invar's terminal pane turns that byte
stream into paints (does a CSI 2J clear produce an intermediate blank
paint before the new frame's bytes arrive?).

1. **Terminal arm (general — fixes every child TUI)**: honor DEC 2026
   synchronized updates from CHILDREN: when a child brackets a repaint
   in ESC[?2026h … ESC[?2026l, the pane buffers and commits the frame
   atomically — no intermediate blank/partial paint. If the child does
   not use 2026, consider a short coalescing window for burst writes
   (follow what real terminals do — cite; do not invent timing
   heuristics beyond the records' wait-must-be-a-condition law).
   Note: Invar's own harness already uses a DEC-2026 end-marker for its
   OWN output path — the child-consumption side is the missing half.
2. **tasks:watch arm (specific)**: stop full clear-screen repaints —
   cursor-home + line-overwrite with per-line clear-to-EOL (or diffed
   lines), and bracket each frame in DEC 2026 so terminals that honor
   it (including Invar after arm 1) commit atomically. Frame rate can
   also drop to what the data changes (ledger ticks), not a fixed
   30fps.

Both polarities: a 2026-bracketed child repaint produces ZERO
intermediate paints (frame-capture assert between markers); a child
WITHOUT 2026 still renders correctly (no buffering deadlock — a
never-closed 2026 bracket must time out per spec, cite the timeout
convention); tasks:watch under Invar shows no blank-frame flashes in a
recorded frame sequence; other child apps (vim-style full repaints)
unaffected.

## Acceptance

PTY drive running the real tasks:watch inside the terminal pane at
both scales: frame capture proves no blank/partial intermediate frames;
synthetic 2026 child fixture proves atomic commit + unclosed-bracket
timeout; flicker gone live (user confirms).
