# #375 — the tasks live view attach-link icon is invisible

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The report (user, 2026-07-30 ~06:3x)

In the tasks LIVE view, the tmux attach link's icon is INVISIBLE — the
user found it only via its tooltip. It should be visible. (The attach
failure itself was a stale meta.json record for the manual #326 lane —
fixed by the conductor; the app read the record correctly.)

## Work

1. Find why the icon paints invisible (foreground=background? missing
   glyph in the active tier? zero-width cell?). Drive the tasks pane with
   a LIVE row and read the actual cells.
2. Make it visible in all themes and glyph tiers (ASCII fallback too).
3. Consider the lesson: also surface the attach TARGET (session name) in
   the row or tooltip so a dead/renamed session is diagnosable at a
   glance; if the session named in meta.json does not exist, show the row
   degraded rather than a silent dead link (loud over silent).

## Conductor process fix (already applied, keep as context)

Manual lanes must update meta.json (tmuxSession/branch/worktree) at
relaunch — the record is what the app trusts. Done for #326; the
manage-tasks/conductor doctrine gains this rule.

## Second defect (user, 2026-07-30 06:4x): live view does not track meta.json

After the conductor repaired the #326 meta.json, the LIVE view's attach
link still pointed at the old session — the view reads meta.json once
(load/scan time) and never re-reads it. User attached manually.

Work: the live row's attach target must track the CURRENT meta.json —
re-read on change (the tasks tree already has a refresh path; hook
meta.json into it) or resolve the target lazily AT CLICK TIME (probably
the sharper fix: the click resolves from disk, so the link can never be
stale). Add the stale-session degraded state from item 3 and assert both
in the tasks-dashboard smoke: edit meta.json mid-session, click, prove
the new target is used.
