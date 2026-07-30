# READY — Markdown view-only mode, persistent across Markdown files (#308)

State: READY

Branch: `fleet/308-markdown-view-only-mode-persistent`

Commits:

- `696c0c4d999db7a0005d86fce34d518a8c1c3fc4` — Add persistent Markdown view-only mode (#308).
- `70d4a03ea8afe6b11c1fe93f2471b79fd3c6b9f3` — Format completed task metadata (#305). This is a separate bycatch commit.

## Delivered

- Added the persisted `markdownViewMode` setting. Its default is `editor`.
- Added `preview` mode. It mounts one full-width rendered preview and no source editor.
- Kept `split` as an explicit compatibility value for the existing split-preview behavior.
- Made the Markdown toggle save `editor` or `preview`. The saved value applies to later Markdown files and to the next app process.
- Kept non-Markdown files outside the Markdown view-mode path.
- Made the hidden source editor ineligible for keyboard input. Editing keys in preview-only mode do not mutate the document.
- Kept full editing behavior when the toggle returns to editor mode.
- Added the persistence and input rules to the [Markdown invariant record](../../../../.invar/worktrees/308-markdown-view-only-mode-persistent/src/modules/markdown/markdown.invariants.md).
- Added the isolated [Markdown view-mode PTY smoke](../../../../.invar/worktrees/308-markdown-view-only-mode-persistent/scripts/harness/smoke-markdown-view-mode-harness.ts) and registered it in the gate.

The governing request is in the [Markdown view-only task record](task-308-markdown-view-only-mode-persistent.md).

## Driving evidence

I drove the default experience first.

1. I opened the [worktree brief](../../../../.invar/worktrees/308-markdown-view-only-mode-persistent/TASK.md) with `bun run drive`. It showed the source editor only.
2. I sent `Control+Shift+v`. The grid changed to one full-width preview. No source pane remained.
3. I sent `x`. The document content, buffer revision, and dirty state did not change.
4. I toggled back. The editor returned and accepted editing input.

The new PTY smoke uses a new `mkdtemp` home for each run. It never reads or writes the real `~/.config/invar/settings.json`. It drove these sequences:

- Editor default → first Markdown file → preview-only toggle.
- Preview-only → close first Markdown file → open second Markdown file → preview-only.
- Preview-only → open a plain-text file → no Markdown preview.
- Preview-only → stop the app → restart with the same isolated home → open a third Markdown file → preview-only.
- Preview-only → editor toggle → saved `editor` setting → editing works.
- Editor → stop the app → restart with the same isolated home → open Markdown → editor.
- Preview-only rendering at 10 lines and 100,000 lines.

The smoke also inspected the isolated settings file after each toggle. It observed the saved `preview` and `editor` values.

## Positive control

I temporarily made the hidden source editor claim keyboard eligibility. The new smoke went red on its editing-key check. It observed `x# Alpha`, `bufferRevision=2`, and `dirty=true`. I removed the planted defect. The same smoke then passed.

## Verification

- The task commit ran the enforcing pre-commit hook with no retries. All static checks, invariant checks, unit tests, 63 PTY smokes, behavioral contracts, serial smokes, and input-byte checks passed.
- The Markdown view-mode smoke passed at 10 and 100,000 lines.
- The existing Markdown split smoke passed at 500 and 100,000 lines.
- The final task gate reported `GATE_EXIT=0`.
- The separate bycatch commit also reported `GATE_EXIT=0`. Its editor smoke had one starvation-class retry. The retry tally recorded it.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` reported zero problems.
- The worktree is clean.

## Bycatch

- FIXED — The completed unknown-task variable pass-through metadata (#305) lacked its final newline. Prettier found it while checking this worktree. I added the newline in separate commit `70d4a03ea8afe6b11c1fe93f2471b79fd3c6b9f3`. See its [metadata file](../../completed/305-unknown-task-variables-pass-through/meta.json).
- The status field `editorColumnContent` remained `source-text-editor` while `editorSurfaceIdentifier` was `markdown.preview` and the grid contained only the preview. I observed it during direct driving and again in the view-mode smoke. I did not change this out-of-scope status field.
- FIXED IN THE ENVIRONMENT — The [real child color probe](../../completed/313-child-owns-its-io-bundle/315-real-child-color-probe.ts) from child-owned I/O bundle (#313) replaced `/home/parallels/.local/bin/claude` with a link into its temporary directory, then removed that directory. The broken link caused unrelated agent smokes to fail in several gate attempts. I restored the link to the installed `/home/parallels/.local/share/claude/versions/2.1.220`. I did not change the other task's files.
