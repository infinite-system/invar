# Summary #420 — terminal-stage stale expanded result

Landed 02da948e, 22m. NOT an app defect and NOT #411's load flake:
the smoke's generic "lines" locator clicked an OLDER collapsed row
(findText = first visible match top-down). Fix: bottommost locator +
real repaint boundary. Lesson: "stale content" reports must
distinguish wrong-content from wrong-ROW-selected — the instrument
clicked the wrong subject. #417's override classification (pre-existing
on main) was correct; the mechanism was benign.
