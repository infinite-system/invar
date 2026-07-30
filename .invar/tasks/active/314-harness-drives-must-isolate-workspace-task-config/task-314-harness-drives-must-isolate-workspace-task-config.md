# 314 — harness drives must isolate workspace task config

State: active
Engine: codex
Effort: medium
Provenance: CONDUCTOR-DIAGNOSED 2026-07-29 (from #305 BLOCKED gate + measured control)

## Defect

A committed `.invar/tasks.json` with `runOn: folderOpen` launches its tasks
inside EVERY harness PTY drive: horizontal-extent smoke red with the file,
green without (measured both polarities, /tmp/hext-with(out)-tasksjson.log,
2026-07-29). The drive's temp HOME had no ~/.profile_env, and the spawned
zsh chain polluted panel state/timing until the smoke timed out. Any USER
with a real workspace tasks.json would break the repo's own smokes the same
way — the harness inherits the developer's workspace task config.

## Design

Harness drives pin their own task-config surface: a drive either (a) runs in
a fixture workspace root that owns its tasks.json (most drives already use
temp fixture roots — audit which drives open the REPO as workspace), or
(b) explicitly disables folder-open task auto-run via a harness-owned
setting/env. Decide at the seam, record it in the tasks + harness records.
Both polarities: a planted folder-open tasks.json in the repo root must NOT
launch in any registered smoke; a drive that legitimately tests tasks.json
still launches its fixture's tasks.

## Immediate mitigation (done by conductor)

.invar/tasks.json untracked + gitignored; the user's local file stays on
disk and works interactively.
