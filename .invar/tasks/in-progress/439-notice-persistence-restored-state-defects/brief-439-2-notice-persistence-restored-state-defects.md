# Brief 439-1 — notice persistence and restored-state panel defects

Read [.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md) in full before any governed work.

## Reproduce by driving FIRST

Run the shipped probe from the repo root:

    PROBE_COPY_REAL_SETTINGS=1 bun \
      .invar/tasks/in-progress/439-notice-persistence-restored-state-defects/probe-439-close-displaced-notice.ts

It copies the user's live `~/.config/invar/settings.json` into a
temporary probe home (READ-ONLY use of the real file; never write to
the user's config). Also run it WITHOUT the variable for the
fresh-state baseline. See the four findings in the
[task file](task-439-notice-persistence-restored-state-defects.md).

## The task, in dependency order

1. NOTICES DO NOT PERSIST. `task:...:N:notice` panes must not enter
   `panelWorkspaceStates` (and existing saved entries must be dropped
   on load, a one-time sanitization). Notices are derived from
   configuration at folder open; the configuration is their only
   source of truth. Fix the save path AND the restore path.
2. DISPLACED NOTICE SUPPRESSION (user-approved design): when the file
   source declares a task whose label equals a displaced built-in's
   label, do not emit the displacement issue at all. The override is
   explicit. Keep the notice for labels the file source does NOT
   redeclare.
3. RESTORED STATE KEEPS THE LIST PINNED. Find what dismisses the
   instances list about 1.5 s after open when the session was
   restored (probe finding 2). The pinned-list behavior must be
   identical for fresh and restored sessions.
4. CLOSE CONTROL RELIABILITY. The hover-revealed close on a list row
   must work every time in restored state (probe finding 3). Diagnose
   the intermittence; do not paper over it with retries.
5. THE USER'S CASCADE: closing the Displaced row reportedly closed
   the neighboring task terminals and showed Database inside the
   Terminal space. Attempt to reproduce AFTER fixing 1-4; if it no
   longer exists, state which fix dissolved it and why. If it still
   reproduces, fix it.
6. Lock each fixed behavior in the tasks or panel smoke through the
   real gesture path (open list, hover row, click control), with a
   planted positive control for the persistence rule (a notice
   identifier planted in saved state must NOT come back as a pane).

## Invariants in scope

- Folder open starts declared tasks — [tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md).
  Restored-identifier adoption must not adopt notice identifiers as
  terminals.
- File sources report displaced built-ins — same file. Item 2 REFINES
  this record: the report exists only for labels not redeclared by the
  file source. Propose the wording.
- Unsupported tasks fail visibly — same file. Unchanged; confirm.
- Each workspace owns one panel world — [workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md).
- Panel content order is one persisted sequence — [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).
  Item 1 refines what belongs to the persisted sequence.
- The pinned-list behavior from the panel-split work; find its record
  in the panel/ui contracts and report if none exists (a `discovered`).

## Bycatch expected

Report per the [AGENTS.md](../../../../AGENTS.md) taxonomy; carry a
`## Bycatch` section even when it reads `None observed`.

## End state

A report in this folder. Probe (both arms) and smokes green. Do not
run `scripts/merge-gate.sh`; commit with SKIP_GATE=1; the conductor
gates at landing. Never write to the user's real ~/.config.
