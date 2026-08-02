# Brief #444 round 1 — history is a sequence of editor-area view states

## In plain words

Back and forward only remember files you opened. If you look at a code
change, then open a file, back skips the change as if you were never
there. Make anything that fills the main area a place you can walk
back to. Do it so each part of the app can say "I am a place" without
history knowing what a git diff is, and without git knowing what
markdown is.

## See it first

Run `bun run drive` on this repo. Open a file, then open a git diff
from the git panel, then open another file. Press Alt+[ (Go Back).
Report the exact sequence of places you land on, from the frame, not
from reading code. That sighting is the reproduction. Today the diff
is not in the trail.

## What is true now

- `src/modules/navigation/NavigationHistory.ts` is a pure model over
  `interface Location { documentPath, line, column }`. It owns the
  ordered list, the cursor, truncate-on-record, the 100 cap, and the
  same-document-same-line collapse.
- `src/modules/workspace/Workspace.ts` is the only glue:
  `recordCurrentLocation()` reads the text editor directly, and
  `restoreNavigationLocation()` calls `openFileInTab` +
  `revealSourceLocation`. Both hard-code ONE view kind.
- That hard-coding is the whole defect. History is not missing a
  feature; it is coupled to the text editor.

## What to build

A registration seam, contributors on both sides.

1. History keeps owning the SEQUENCE: order, cursor, truncate,
   cap, back, forward, clear. It must not learn the word "diff",
   "markdown", or "editor".
2. A history entry becomes a view state: a contributor identity plus
   that contributor's own opaque payload. The current
   `{ documentPath, line, column }` becomes the text editor
   contributor's payload, not history's schema.
3. Each editor-area view registers a contributor that can (a) describe
   its current state as a payload, and (b) restore itself from a
   payload it produced. A contributor that cannot restore (its
   document is gone) says so, and history skips or drops the entry —
   your call, state which and why.
4. Registration is one seam. Editor, git, and markdown must each plug
   in without importing each other and without history importing any
   of them.
5. The same-place collapse rule stays, but the contributor decides
   what "same place" means for its own payload. Text keeps
   same-document-same-line. Do not put that rule in history.

## Settled rulings — do not relitigate

- USER RULING: every diff view pushes its own entry, exactly like a
  file open. No coalescing. No changeset-as-container. Walking 40
  files pushes 40 entries and that is correct. The conductor proposed
  the container form and the user rejected it.
- Panels and docks are NOT places. Only editor-area views are.

## Scope boundary

#442 is building the breadcrumb and history row in the editor area,
in a separate worktree. Do NOT touch editor-area chrome or rendering
of the `< >` arrows. This task supplies what the arrows walk. If your
change needs a rendering change to be visible, say so in the report
and stop there; the conductor sequences it.

Do not fix the Alt+[ / Alt+] macOS shortcut here. That is #442's row.

## Invariants in scope

- `Programmatic history navigation does not record new history`
  ([src/modules/navigation/navigation.invariants.md](../../../../src/modules/navigation/navigation.invariants.md)) — the suppression
  path must survive generalization. Restoring ANY contributor's state
  must not record. Today only `restoreNavigationLocation` suppresses;
  every contributor restore now needs the same guarantee, and the
  cleanest form puts the suppression in the seam, not in each
  contributor. Report whether the record still holds verbatim or needs
  refinement now that "navigation" means more than a cursor move.
- [src/modules/editor/editor.invariants.md](../../../../src/modules/editor/editor.invariants.md) and
  [src/modules/git/git.invariants.md](../../../../src/modules/git/git.invariants.md) — read both before adding a
  contributor to either module; report any record the new seam
  stresses.
- [project.invariants.md](../../../../project.invariants.md) — `Public classes use the namespace pattern`.
  Any new class publishes the namespace, and reads its own live
  statics through `this.constructor` (see #443, just landed).
- Any record this list MISSED is a finding about the conductor's map.
  Say so.

## Bycatch expected

Report every defect you SEE, fix only the one you were sent for, per
[AGENTS.md](../../../../AGENTS.md)'s taxonomy: runtime defects, invariant violations in
function, comment drift, distillation possibilities, generator drift
or introduced variance, plain nonsense. Write the `## Bycatch`
section even if it reads `None observed`.

## Verification

- A driven reproduction: file, diff, file, then back twice, landing on
  the diff. Frame evidence, not internal values.
- Lock it with a smoke assertion in the existing harness suite. Do not
  add a new smoke file unless this is genuinely a new surface.
- Unit tests for the seam: a fake contributor proves history never
  names a real view kind.
- `bun test`, `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`,
  and the invariant checker `--all` and `--refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`. The
  conductor gates and lands.

## Report

Open with `## In plain words`. Answer the invariants list record by
record: upheld, violated, or needs refinement.
