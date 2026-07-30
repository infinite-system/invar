# Summary #386 — theme glyphs at narrow geometry

Landed 157dda25 (branch tip c325587b), 78m, 2 rounds.

What happened: the posed frame ("glyphs vanish at 120x36") was FALSE — no
width threshold. OpenTUI's post-negotiation OSC 66 explicit-width dialect
was discarded by the harness oracle; launch timing selected the dialect.
Fix at the emulator seam (payloads into the one parser), 235-case
conformance corpus, exact glyph-cell smoke arms, positive control proven.
Round 2 merged main forward (#346 shared the dashboard smoke) — no
conflicts, combined-tree ALL-PASS with empty retry tally.

Lesson instance: the width bisect the brief asked for DISPROVED the frame
instead of finding a threshold — the builder followed the evidence, not
the brief's assumption. Correct behavior; brief-as-experiment paid off.

Bycatch converted: #397 FrameProbe char-buffer misdecode (instrument lies
while the buffer carries native handles).
