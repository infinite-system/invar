# Task #452 — pane identity collides by name, and terminals hang

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: IN-PROGRESS

## In plain words

Every panel item is identified by a name with a number on the end,
not by a real unique id. Two items can end up with the same name. Then
deleting one deletes the other, and typing into one goes nowhere. The
user's terminals all stopped working after the app sat idle. The shell
behind the dead pane was still alive.

## The user's report, verbatim in substance

2026-08-01, seen live, NOT reproduced by the conductor:

- A terminal pane showed a blinking cursor but no prompt and did not
  work. It had been working. It happened after sitting idle.
- Then EVERY terminal was broken, including newly created ones, in
  every workspace.
- In the realized workspace a terminal accepted ONE letter, then froze.
- Separately: two panes with the same NAME collide. Deleting one
  deletes the other. It is not terminal-specific — the user saw it
  with other plugins including Database.

## Evidence captured from the live broken state

The shell behind the dead pane was ALIVE:

```text
3555523 /bin/bash --rcfile /tmp/invar-terminal-rc-TkrYDM/bashrc -i
```

The machine was NOT starved: 61 of 4096 PTYs in use, file descriptors
far below the limit, 17.8 GB available. This is app-level.

The UI stayed responsive — the user switched workspaces while the
terminals were dead.

## Eliminated, do not re-derive

- **Whole-runtime blocking deadlock in OpenPty.** A blocked event loop
  would freeze the UI. The UI was responsive. Killed by evidence.
- **PTY or file-descriptor exhaustion.** Measured, far under limits.
- **Dead child process.** The shell was alive.

## Candidate 1 — identity collision (conductor's leading read)

`PaneRuntimes.allocateInstanceIdentity` mints identity from a COUNTER
plus a kind: `terminal`, `terminal-2`, `terminal@<scope>-3`, labelled
`Terminal`, `Terminal 2`. The counter lives in the in-memory map
`instanceCountsByIdentityScopeAndKind`, which starts empty every
launch and knows nothing about RESTORED panes. So after a restore, a
newly allocated identifier can be one that already exists.

`TerminalPlugin` keeps `panes = new Map<string, TerminalPaneContent>()`
keyed by `content.id`. A colliding id silently REPLACES the entry. The
first pane's backend keeps running — its shell stays alive — while the
registry no longer points at it.

That mechanism predicts all four symptoms: delete-one-kills-both,
writes landing nowhere while the UI still paints, a shell that outlives
its pane, and the `terminal@2-12` pile found in the user's realized
settings on 2026-07-31.

This is a HYPOTHESIS. Measure before believing it.

## Candidate 2 — the read stream ends and never restarts

`OpenPty.startMasterRead` restarts on EAGAIN, but its `close` handler
sets `readStream = null` and stops. If the stream ends any other way,
reads never resume with the shell alive. This survives as a separate
candidate because it explains a single dead pane, though NOT the
newly-created panes also being dead.

If candidate 1 proves out, check whether candidate 2 is real anyway. A
killed rival is worth recording.

## Folded in: #441 — panelContentIds and panelContentLabels disagree

USER RULING 2026-08-01: fold. Same root — identity carried by name and
position instead of by a stable id.

`AppStatusProjection` publishes `panelContentIds` from the raw
persisted order and `panelContentLabels` from live ordered contents.
With an unregistered id in the order, the arrays differ in length and
index (#439 report, GENERATOR DRIFT bycatch). Consumers pairing them by
index read the wrong label.

Wanted: one generator for both, or a single array of `{id, label}`.
Audit status consumers for index pairing before choosing. If the id
becomes opaque, the projection MUST carry the label explicitly —
nothing downstream may derive a display name from an id again.

## Wanted

A real unique identity per pane, minted once, never derived from a
name, a label, or a counter over live state. The name becomes pure
presentation: duplicate names must be legal and harmless.

Reproduce the collision FIRST, driven, before changing anything.

## Invariant

Identity is not presentation. If two panes can share an identifier,
every id-keyed map in the app is a silent aliasing bug waiting for a
name to repeat.
