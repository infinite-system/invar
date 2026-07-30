# #397 — FrameProbe misreads OpenTUI char buffer as packed code points

State: ACTIVE
Priority: verification-integrity
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Origin — #386 bycatch (instrument defect, reproduced twice)

FrameProbe.read treats OpenTUI's char buffer values as packed Unicode code
points, but the buffer now carries native character handles. The probe
displayed Linear B glyphs (for example U+100E9) while the raw PTY stream
held the correct task glyphs. #386 worked around it by using the terminal
emulator cells as its paint oracle.

FrameProbe is a core instrument: while it lies, any smoke keying on its
cell text can mis-verify. Fix the decode at the buffer seam, add a fixture
that would have caught the handle change (positive control: feed a known
glyph, assert the probe reads it back), and census existing smokes for
assertions that could have been fooled by the misdecode.

Related memory: the FrameProbe astral-remap note (index frame rows by code
points, not UTF-16) — same instrument, different defect; check both hold
after the fix.
