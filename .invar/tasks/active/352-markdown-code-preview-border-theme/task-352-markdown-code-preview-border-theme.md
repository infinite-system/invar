# #352 — markdown code-preview side borders still black, should follow theme

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The report (user, 2026-07-30)

In markdown preview, code blocks' LEFT and RIGHT borders still render
black; they should be white (theme foreground) — an incomplete conversion
from the earlier border/color task. Find that prior task's diff (git log on
the markdown renderer for the border/color conversion), enumerate ALL
border edges (top/bottom/left/right), and finish the conversion so every
edge reads the same theme token. Drive both themes; assert border cell
colors via FrameProbe (COLORTERM=truecolor). Check other bordered elements
in preview for the same missed-edge pattern (tables, blockquotes) — same
generator, report as bycatch if found.
