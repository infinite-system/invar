# TASK — The file tree becomes a plugin too (#85)

You are a builder on the Invar terminal IDE. Work ONLY in the worktree you are given
(`/tmp/conductor-filetree`, branch `feat-filetree-plugin`, forked from main at `0b7ad0a`).

Do NOT run `scripts/merge-gate.sh`. Do NOT push, merge, tag, or delete branches — the conductor
does that. Commit to this branch and write your report.

## What the user asked for, verbatim

> "if there are more things like FileTree is also a separate plugin, so please decouple everything
> so everything is modular and composes like legos"

Git and Markdown have already been inverted into plugins; the host no longer knows either. The file
tree is the remaining large piece of the sidebar that the host still owns directly. Make it a
citizen of the same canvas.

## Read this first — the ground already exists

- `src/modules/app/ApplicationPlugin.interface.ts` — the contract. A plugin gets a context carrying
  the renderer, `workspaceSet`, `settings`, `theme`, `commands`, `primaryDockHost`, `contextMenu`,
  `boundedListPopup`, `overlayCoordinator`, `statusBarSegments`, `statusProjectionContributions`,
  `editorSurfaceContents`, `registerPrimaryDockContent`, `requestRender`. It extends
  `WorkspacePlugin`, so it also has the per-workspace lifecycle.
- `src/modules/git/GitPlugin.ts` and `src/modules/markdown/MarkdownPlugin.ts` — two worked examples.
  Follow their shape rather than inventing a third.
- `src/modules/plugins/DefaultPlugins.ts` — where the default set is assembled.
- `src/modules/workspace/workspace.invariants.md` — read the record *The host canvas is complete
  without plugins* and the plugin-boundary records. `scripts/plugin-boundary-baseline.txt` plus the
  boundary check in `scripts/conventions-gate.sh` will FAIL if host code names a plugin, so the
  boundary is enforced, not merely intended.
- `project.canvas-census.md` — the census of what the host still owns. The file tree should be on it.

## The reduction to do first (report it before the refactor)

The file tree is not obviously the same KIND of thing as Git or Markdown, and pretending otherwise
is how a good contract gets bent. Ask, and answer in the report:

1. **Is the tree a contributor, or is it host furniture?** The activity bar has a Files entry; the
   sidebar has a tree; the editor opens what the tree selects. If the tree becomes a plugin, then
   with zero plugins installed the app has an empty sidebar and no way to open a file. Either that
   is acceptable (the canvas claim is literal, and file-opening lives in a plugin), or the tree
   splits: a host-owned **document-opening** capability, and a plugin-owned **tree view** of it.
   Decide which, and justify it structurally rather than by preference.
2. **What does the tree need that the current context does not offer?** If the honest answer is a
   new port, say which and why the existing ports cannot carry it — but prefer a FIELD on an
   existing many-customer contract over a new one-customer port. That call was already made once on
   this canvas (the editor-title action became a `Command` field, not a port) and it is the right
   default.
3. **Does the sidebar need a contribution port at all?** `registerPrimaryDockContent` already
   exists. If the tree fits it unchanged, that is the answer and there is nothing to design.

If the reduction says the tree should NOT become a plugin — that it is genuinely host furniture and
the user's "everything composes like legos" is satisfied by something else — STOP and report that
with the structure that shows it. A reasoned no is a valid outcome; a bent contract is not.

## Constraints

- **Do not regress what the canvas work paid for.** Named, measured obligations: workspace
  activation costs O(depth) not O(repo size) and issues **2 queries whether 5 directories or 500**;
  N workspaces must not mean N watchers; the paint barrier holds; synchronous workspace switch stays
  in the sub-millisecond range. Re-measure these, do not assume them.
- **`idle-quiescence` must stay green** — the render loop stops at rest and a no-op keystroke emits
  no frame. A newly-registered pane that subscribes too eagerly breaks this, and it is a hard gate.
- Full descriptive identifier names, no abbreviations. 80 columns, `.prettierrc`.
- ivue conventions: `Static()` / `Reactive()` / raw `= $X` — pick the honest form; `protected`
  floor; `X.interface.ts`; file-name-follows-class. Never read `Class.prototype.<member>`.
- A claim may not derive its occupancy from the aggregate it feeds. That invariant was recorded
  yesterday after exactly this kind of extraction caused a boot-time stack overflow that unit tests
  missed and a smoke caught. If you add a capability question, check it against this.

## Verification — exact exit codes, never a log tail

- `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`,
  `node .claude/skills/invariants/scripts/check_invariants.mjs --all` and `--refs`,
  `bash scripts/conventions-gate.sh` (this is where the boundary check lives),
  `bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`.
- **Drive the real path.** Open a workspace through the PTY driver, navigate the tree, open a file,
  switch workspaces, and confirm from the emulator grid that the tree paints and selection opens the
  document. Three runs each on anything you had to think about, and one run with the machine
  deliberately loaded.
- Re-run the activation measurement (5 directories and 500) and report the query counts.
- Declare assertion/wait movement in `project.coverage-deltas.md` with the counted grammar
  (`path — assertions: A → B, waits: C → D — reason`). APPEND rows; other branches edit it
  concurrently.
- Update `project.canvas-census.md` so the census reflects what the host owns afterwards.

## Coordination

One other builder is live on `refactor-plugin-kinds` (naming the plugin KINDS in the contract files
`ApplicationPlugin.interface.ts` / `WorkspacePlugin.interface.ts` and the invariants records). You will
likely touch the same contracts — keep your interface edits minimal, expect to merge a moved main
before you finish, and re-run the checks after. NOTE: the keyboard invariant landed (0b7ad0a): Tab now
INDENTS in the editor; the host focus chord is Ctrl+Shift+J; smokes that press Tab from the editor are
wrong. Also run `bun install --frozen-lockfile` first — a fresh worktree has no node_modules.

## Commit and report

`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`. Leave the worktree clean;
`git ls-files | grep '^TASK'` must return nothing.

Write `/tmp/filetree-plugin-READY.md`: the reduction and which of the three questions above decided
the design; what moved and what stayed host-owned, with the boundary-check evidence; the re-measured
activation numbers; the driven-path evidence; exact exit codes; and anything you believe is a defect
but did not fix.
