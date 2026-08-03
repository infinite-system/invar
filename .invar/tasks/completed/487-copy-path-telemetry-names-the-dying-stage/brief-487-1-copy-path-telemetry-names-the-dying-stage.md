# Brief 487-1 — copy-path telemetry names the dying stage

## In plain words

Copy from the agent pane fails for the user but works in our harness.
Add a small light and a log line to the copy path, so one real key
press tells us which stage dies. Prove it by driving the app yourself.

## Reproduce by DRIVING first

Use the drive-pty skill ([.claude/skills/drive-pty/SKILL.md](../../../../.claude/skills/drive-pty/SKILL.md)): one warm
headless server in your worktree, GraphClient waits, screen reads.
Open a workspace, focus the agent pane transcript, make a selection,
press Ctrl+C. Watch what actually happens before changing anything.
Also drive the composer-focused variant. tapOutput / clipboardEmissions
on PtyTestDriver shows OSC 52 emissions.

## The work

1. Instrument every copy-chord entry point that can own the agent pane
   selection: status-bar flash "Copied N chars" on success.
2. One structured log line per copy ATTEMPT (success or not) to a
   debug file (env-gated is fine; name the flag in your report):
   focused surface, selection owner + length, route taken (copy
   handler vs forwarded to child PTY), OSC 52 emitted + byte length.
3. Explicitly log the case: app selection ACTIVE but chord FORWARDED
   to the child. That is the prime suspect (user feels a "flinch").
4. Iterate drive -> change -> drive. Write the locking smoke ONLY
   after the behavior is right: a driven copy shows the flash and
   writes the log line. One verification pass at the end.
5. Do NOT fix chord routing in this task. Report what the telemetry
   shows; the routing decision comes after the user's one real press.

## Evidence you inherit (do not re-derive)

- Transport works: raw OSC 52 printf reaches the clipboard via cmux.
- #477/#482 (completed task folders) prove both focus variants emit
  OSC 52 in-harness.
- User sees the Invar-palette selection highlight when dragging: the
  drag reaches the app.

## Invariants in scope

- Check [src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md) and any contract at or
  above the files you touch (clipboard/input routing). Answer record
  by record in your report; name any record the list missed.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy (runtime defects, invariant
violations, comment drift, distillation possibilities, generator
drift, nonsense). Include the section even if it reads: None observed.

## Instrument feedback

Report what was EASY / CONFUSING / MISSING about driving the app with
the drive layer (server, GraphClient, DriveSession, MCP). Asks here
get converted into drive-layer work.

## Rules

- Never run scripts/merge-gate.sh; the conductor gates and lands.
- Commit on your branch as you go. READY report in the task folder.
