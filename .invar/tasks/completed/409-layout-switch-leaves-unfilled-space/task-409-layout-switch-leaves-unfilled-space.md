# #409 — switching layouts back to default leaves unfilled space

State: COMPLETED — 91249982 — layout switches tile the full terminal (remainder slots owned and painted)
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The request (user, 2026-07-30, VERBATIM)

"another task or fold it into workspaces one, the layout switching going
back to default does not expand the bottom panel to full width,
basically configurations have to fill available space, right now it
leaves blank spaced under the right side panel, keeping right side panel
short and bottom panel not expanded, so layouts have to be fixed"

## Reading

Filed separately from #408 (this is layout resolution, not workspace
state leakage; the two builders must not collide — this one owns
LayoutModel arrangement, #408 owns cold-state scoping).

Defect: after switching layout configurations and returning to default,
the bottom panel does not reclaim full width and blank cells sit under
the right side panel (right panel short + bottom panel narrow). The
invariant to establish: EVERY layout configuration tiles the full
terminal — no unowned blank regions, ever. Suspect: the layout switch
path restores a stale arrangement (panel width / dock height pairing)
without re-running the full resolve against current geometry.
