# Brief #452 round 1 — pane identity collides by name, and terminals hang

## In plain words

Panel items are identified by a name with a number on the end. Two
items can end up with the same one. Then deleting one deletes the
other, and typing into one goes nowhere. The user's terminals all died
after the app sat idle, and the shell behind the dead pane was still
alive. Prove what is actually happening before you change anything.

## This is an EXPERIMENT, not a diagnosis

The conductor has a leading candidate and it may be wrong. Your job is
to measure first and say plainly what the measurement shows, including
"both candidates died". A brief written as a diagnosis does not
survive being wrong; this one is written to survive it.

Do not start from the conductor's mechanism. Start from the
reproduction.

## The user's report — seen live, NOT reproduced by the conductor

- A terminal pane showed a blinking cursor and no prompt, and did not
  work. It had been working. It happened after sitting idle.
- Then EVERY terminal was broken, including newly created ones, in
  every workspace.
- One terminal accepted exactly ONE letter, then froze.
- Separately: two panes with the same NAME collide — deleting one
  deletes the other. Not terminal-specific; seen with Database too.

## Evidence captured from the live broken state

The shell behind the dead pane was ALIVE:

```text
3555523 /bin/bash --rcfile /tmp/invar-terminal-rc-TkrYDM/bashrc -i
```

The machine was not starved: 61 of 4096 PTYs, file descriptors far
under the limit, 17.8 GB available. The UI stayed responsive — the
user switched workspaces while every terminal was dead.

## Eliminated — do not re-derive these

- **Whole-runtime blocking deadlock in OpenPty.** A blocked event loop
  would freeze the UI. The UI was responsive.
- **PTY or file-descriptor exhaustion.** Measured, far under limits.
- **Dead child process.** The shell was alive.

Three candidates are already dead. Spend your effort past them.

## Candidate 1 — identity collision (leading, unproven)

`PaneRuntimes.allocateInstanceIdentity` mints identity from a COUNTER
plus a kind: `terminal`, `terminal-2`, `terminal@<scope>-3`. The
counter lives in the in-memory map
`instanceCountsByIdentityScopeAndKind`, which starts empty every launch
and knows nothing about RESTORED panes. After a restore, a freshly
allocated identifier can already exist.

`TerminalPlugin.panes` is a `Map<string, TerminalPaneContent>` keyed by
`content.id`. A colliding id silently replaces the entry: the first
pane's backend keeps running, its shell stays alive, and the registry
no longer points at it.

That predicts all four symptoms. It is still a hypothesis.

**Reproduce it directly, by driving:** restore a session that already
holds a terminal, add another, and read the two identifiers. If they
collide, you have the mechanism and the rest follows. If they do not,
say so and move to candidate 2 — a refuted leading candidate is a
result, not a failure.

## Candidate 2 — the read stream ends and never restarts

`OpenPty.startMasterRead` restarts on `EAGAIN`, but its `close`
handler sets `readStream = null` and stops. If the stream ends any
other way, reads never resume while the shell lives.

This explains ONE dead pane. It does not explain newly created panes
also being dead, so it is ranked second. Check it anyway: if candidate
1 proves out, candidate 2 may still be a real defect hiding behind it.

## What to build, once the measurement says which

A real unique identity per pane, minted once, never derived from a
name, a label, or a counter over live state. The name becomes pure
presentation: **duplicate names must be legal and harmless.**

Guard the seam: every id-keyed map in the app is a silent aliasing bug
the moment two panes can share an identifier. Where an id is minted,
make a collision impossible rather than unlikely.

## Folded in: #441 — status projection order and label pairing

Task #441 is RETIRED into this one by user ruling: same root, identity
carried by name and position instead of by a stable id.

`AppStatusProjection` publishes `panelContentIds` from the raw
persisted order and `panelContentLabels` from live ordered contents.
With an unregistered id in the order, the arrays differ in length and
index, so consumers pairing them by index read the wrong label.

Fix it here: one generator for both, or a single array of
`{id, label}`. Audit status consumers for index pairing before
choosing. **If ids become opaque, the projection MUST carry the label
explicitly** — nothing downstream may derive a display name from an id
again. That is the same defect in the other direction.

## Persisted state — read this before you change identity

Identifiers are persisted in the user's settings. A change to how they
are minted must not orphan existing panes on the next launch. The
user's `realized` workspace previously accumulated a pile of
`terminal@2` … `terminal@2-12` entries; #439 added sanitization. State
what your change does to already-persisted identifiers, and prove a
restore from an OLD settings file still works.

Do NOT write to the user's real `~/.config`. Copy it read-only into a
temp home if you need real data.

## Invariants in scope

- [The UI contract](../../../../src/modules/ui/ui.invariants.md) —
  panel spaces, groups, and content ordering. Read every record before
  touching PanelHost; report any the identity change stresses.
- [The app contract](../../../../src/modules/app/app.invariants.md) —
  restore and boot ordering. #439 landed the rule that the panel world
  is restored and sanitized BEFORE the task contributor registers. An
  identity change touches exactly that path.
- [The terminal contract](../../../../src/modules/terminal/terminal.invariants.md)
  — if the read-stream candidate proves real, its record is here.
- [project.invariants.md](../../../../project.invariants.md) —
  `Public classes use the namespace pattern`, and the newly landed
  `Live static reads follow the receiving class`. Any new class obeys
  both; the census now runs in the gate.
- **Propose the missing record.** If identity-is-not-presentation is
  not written down anywhere, that absence is why this defect exists.
  Propose it with an `Impossible if true` that names the collision.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Verification

- The driven reproduction, before and after, in the real PTY.
- A driven test for the user's exact gesture: two panes with the same
  name, delete one, the other survives.
- The idle case if you can characterise it: the user's trigger was
  sitting idle, and neither candidate yet explains WHY idling starts
  it. If you cannot reproduce the idle trigger, say so — an honest
  unknown is worth more than a story that fits.
- Lock it into the existing harness suite as assertions; add a new
  smoke only if this is genuinely a new surface.
- `bun test` in FULL, not focused. Two reds reached a gate on #442
  because a builder ran only focused tests.
- `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`, invariant
  checker `--all` and `--refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Report

Open with `## In plain words`. State which candidate survived, which
died, and what killed it. Answer the invariants record by record.
