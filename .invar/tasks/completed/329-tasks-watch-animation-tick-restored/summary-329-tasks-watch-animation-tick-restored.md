# Summary — #329 tasks:watch animation tick restored

Landed: b8cfdc62 (merge of cf2104e3), 34 minutes dispatch-to-landing.
Builder: codex / gpt-5.6-sol / high.

## What happened

The brief's premise held exactly: commit f0a860bf kept synchronized data
frames but removed the independent motion clock. The builder proved it by
driving before changing code. The fix restored a second clock: one
absolute 60 FPS motion timer that diffs only animated rows, skips missed
frames, and cancels when no row animates. DEC 2026 bracketing per write;
the #321 synchronized-output contract stayed green. One design addition
not in the brief: a NO_COLOR monochrome glyph cycle, needed because
color-only subframes diffed to nothing and collapsed to ~20 FPS.

## What the conductor got wrong / friction

- Nothing refuted in the report. The verdict chain was clean
  (enforcing-hook-chain, read from the rollout by commit hash).
- land.sh's session archive failed: the dispatch-time link read
  UNRESOLVED. Repaired by hand — session file identified by commit hash
  (unique among 2 candidates, 7 hits), link rewritten, archive OK with
  byte-count proof. Recurring class; see the session-link-repair lesson.

## Left undone (converted, not dropped)

- #330 filed: scripts/tasks watcher clock / bounded-frame / idle-timer
  rules have no invariant record.
- #214 census extended (34th-36th pool events + input-byte canary p50
  13.187 ms under load, report-only).
- #193 recurrence recorded (995-row shortfall, first hook only).
