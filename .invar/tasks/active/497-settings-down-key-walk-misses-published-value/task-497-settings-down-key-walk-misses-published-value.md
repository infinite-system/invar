# Task 497 — settings Down-key walk cannot reach a published value

Priority: flake-evidence
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
State: ACTIVE

## In plain words

The #491 builder drove the Settings screen with Down-key steps toward
the Markdown view mode value. The labels were on screen, but two
counted walks never reached the published split value and both timed
out. Either the selection state and the labels disagree, or the walk
count is wrong, or a real navigation defect hides here. Establish
which by driving.

## Evidence

report-491 (completed folder), Bycatch: "from the default Settings
screen, two Down-key walks did not reach the published Markdown split
value even though the settings labels included Markdown view mode."
Seen once (one session, two attempts). Instrument feedback CONFUSING
names the same surface.
