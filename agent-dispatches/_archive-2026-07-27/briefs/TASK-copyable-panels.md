# TASK — every panel's content must be COPYABLE, settings first (#111)

Builder on Invar. Work ONLY in `/tmp/conductor-copyable` (branch `feat-copyable-panels`, forked
from latest LOCAL `main`). No merge-gate, no push/tag/delete. Report to `/tmp/copyable-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile`.

## The user, verbatim (finding 2 of their 12-point review)

> "Settings and any panel in the system should be copyable"

They cannot select or copy text out of Settings — or any panel. In a terminal IDE that is a real
gap: the surrounding terminal's own selection is unavailable because the app owns the alt screen.

## The reduction — find the generator before writing any UI

There is already ONE selection/copy path in this codebase: the editor selects text and copies via
OSC-52 (see the clipboard smokes and `smoke-clipboard-frame-boundary-harness.ts`). Panels are a
DIFFERENT surface but the same GENERATOR: *a rectangular region of rendered cells becomes a
selection becomes clipboard text*.

**Do not re-roll selection per panel.** Find the existing seam (selection model + OSC-52 emission +
the frame-boundary discipline the clipboard smoke gates), and make panels consumers of it. If the
existing seam genuinely cannot serve panels without suppressing its core, SAY SO with the specific
obstruction — that is the repo's tell for a wrong boundary (AGENTS.md rule 2), and the right answer
is then to extract the shared generator, not to duplicate.

Scope for THIS round: Settings first (the user named it), plus whichever panel falls out for free
once the seam is wired. Enumerate the remaining panels in the report as follow-up rather than
half-wiring them all.

## Requirements

- Mouse drag selects a region; the selection is visible (use the existing selection theming, do not
  invent a new highlight).
- Copy emits through the SAME OSC-52 path the editor uses — one clipboard authority, not two.
- Keyboard-reachable copy consistent with the editor's existing binding; route through the
  keybinding registry, never a hardcoded chord.
- Selection must not steal focus or break the panel's existing keyboard behaviour. Drive that.

## Verification — drive it

Driven smoke: open Settings, drag-select a known string, copy, and assert the clipboard emission
contains exactly that text (the harness already records clipboard emissions —
`driver.clipboardEmissions()`). Assert the panel's normal keyboard behaviour still works after
selecting. Positive control required: prove the assertion fails when the copy path is broken (e.g.
revert the wiring, quote the red).

Full checker suite ONCE at the end, exact exit codes. Drive-first per AGENTS.md Rule Zero. Bycatch
rules apply. Full descriptive names, 80 cols, ivue conventions. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; clean tree.
