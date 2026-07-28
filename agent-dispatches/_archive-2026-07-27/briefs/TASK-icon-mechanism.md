# TASK — Icon mechanism now, glyph vocabulary for the user to veto

Branch: create `feat-icon-mechanism` from `origin/main`.
Worktree: `/tmp/conductor-altdelete`. Do not touch any other directory.

## Split the task the way the decision splits

The user asked for: better activity-bar glyphs (file tree / git / plugins), and panel heading controls
where `+` and Expand show a small tooltip explaining what they do, controls highlight on hover, and close
is "a nicer glyph and not red".

MECHANISM is engineering and is in scope. VOCABULARY — which glyph means which thing — is the user's
taste and is NOT yours to land. Build the mechanism so any vocabulary can be dropped in, then RENDER
candidate sets as previews for the user to choose from. Do not pick one and call the task done.

## In scope (build and prove)

1. **Tooltip on hover for every panel-heading control** (`+` add, Expand/Restore, Close). Reuse the
   existing tooltip surface — there is one, and the display-only hit-transparent text renderable already
   exists. Do NOT write a second tooltip.
2. **Hover highlight on every clickable control**, consistent with how the status bar and breadcrumb
   segments already render hover. Reuse that affordance; do not invent a third highlight style.
3. **Close control restyled**: not red. Use the theme's ordinary foreground with the same hover treatment
   as its siblings, so it stops reading as a destructive action.
4. **A glyph SLOT indirection** so the activity-bar and heading vocabularies are data, resolved through
   the existing capability ladder (nerd → unicode → ascii). The point is that swapping a glyph is a
   one-line data change, not a code change — that is what lets the user choose later without a refactor.

## The deliverable that needs the user: rendered previews

Produce a preview artifact showing AT LEAST THREE candidate vocabularies for the activity bar (file tree,
git, plugins/extensions, search, settings) and for the heading controls (add, expand, restore, close),
each rendered at all three capability tiers. Write it as a file the user can read in the terminal — real
rendered rows, not a table of codepoints, because the whole question is how they LOOK in a cell grid.
Path: `/tmp/icon-vocabulary-previews.txt`.

For each candidate say what it costs: does it need a nerd font, does it occupy one cell or two (East
Asian width!), does it collide visually with an existing marker (the diff `▎`, the dirty `●`, the
powerline separator). A glyph that renders as two cells or duplicates an existing marker is disqualified
regardless of taste — say so and drop it.

## Verification — by driving

Extend the PTY harness: hover each heading control and assert from OBSERVED CELLS that a tooltip appears
naming that control, and that the control's own cells change attributes on hover. Pair each with a
control proving the un-hovered siblings did NOT change in the same frame. Assert the close control's
foreground is NOT the theme's error/red colour. Drive the activity bar's glyph slots at each capability
tier and assert the expected fallback renders.

Use named grid conditions. The harness wait invariant forbids a bare sleep between a drive and its
assertion, and forbids a predicate the pre-action state already satisfies;
`assertContentInvariantAcrossAction` exists for "this held still while that changed".

## House rules (non-negotiable)

- Full descriptive identifier names, no abbreviations. Name the STATE established, not the steps.
- Class-first ivue conventions; `protected` floor; `.prettierrc` (80 columns).
- Add/refine the invariant with ALL fields including **Scope**; verify with EXIT CODES, not a log tail.
  The invariant worth writing is that appearance is DATA resolved through a capability ladder — swapping
  a vocabulary must not touch behaviour.
- Run and report exact exit codes: `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`,
  both invariant checker passes, `bash scripts/conventions-gate.sh`,
  `bun scripts/check-coverage-ratchet.ts`, and every smoke you touch three times.
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>` (use `-F`). Do NOT run
  the merge gate, push, merge, tag, or delete a branch — the conductor does that.
- Leave the worktree CLEAN; `git ls-files | grep '^TASK'` must return nothing.
- Report to `/tmp/icon-mechanism-READY.md`: the slot indirection, which existing surfaces you reused
  rather than duplicated, the disqualified glyphs and why, and the preview file's path. State plainly
  that the vocabulary choice is left to the user.
