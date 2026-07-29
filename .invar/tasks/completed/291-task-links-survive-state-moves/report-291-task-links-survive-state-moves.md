# READY — task links survive state moves #291

## Outcome

Task links now treat the stable task-folder name as identity. The lifecycle state is a path hint.
The app and task-link linter share one structural predicate. On an exact miss under `active`,
`in-progress`, `completed`, or `retired`, they try the same task-folder name and file tail under
the other three states. They do not search by basename. They do not apply the fallback outside
the four task-state directories.

Rendered Markdown now paints a dead relative link with the active theme's error color and
underline. Current, moved, and external links keep the normal link style. Each distinct authored
target resolves once per parsed revision. Unchanged frames read the cached verdict and perform no
filesystem probes.

The [task record](task-291-task-links-survive-state-moves.md) is complete.

Commits:

- `7f61f8fca17da7722478577ac06b40f03142869c` — app resolution, linter modes,
  lifecycle hooks, preview state, contracts, and driven probes.
- `17282c97554ce1235fb490d4d09a0477cfc5b752` — one mechanical records sweep.

The worktree is clean.

## Five arms

### App link opener

[Workspace.ts](../../../../src/modules/workspace/Workspace.ts) keeps its existing confinement,
scheme rejection, and stated-miss path. An exact task-state miss now asks the shared task-path
capability for the other three structural candidates. Every candidate must still exist, be a
file, and remain inside the workspace.

The real PTY probe first reproduced the defect. Current, moved, and dead links all used foreground
`8037111`. Ctrl-clicking the moved link left the README active and stated:

```text
Link target not found: .invar/tasks/active/999-task-state-link-control/task-999-task-state-link-control.md
```

After the change, current and moved links used `8037111`, while the dead link used error foreground
`14371659`. Ctrl-click opened the exact completed record:

```text
/tmp/invar-291-task-state-links-XH4mf2/.invar/tasks/completed/999-task-state-link-control/task-999-task-state-link-control.md
```

The notice was `null`. A dead task name still returned the stated miss. A shaped source path with a
matching basename did not receive the fallback.

### Task-link linter

The [task-link linter](../../../../scripts/tasks/lint-task-links.ts) now has three task-state
outcomes:

- A current link is silent and exits 0.
- A moved link is valid, reports its current path, exits 0, and `--fix` rewrites only the
  destination.
- A dead link remains blocking and exits 1.

The self-test also proves that a dead source link is not rescued. Its planted bare reference exits
1 and rewrites only under full `--fix`. The `--fix --moved-only` control leaves that same
unambiguous bare reference byte-identical.

### Records sweep

I ran full `--fix` over 272 Markdown records under the task tree and the two generated views. The
separate sweep commit changed 210 files with 538 exact substitutions in each direction.

The sweep refreshed two moved links:

- [TOC click drives preview scroll into view #286](../../completed/286-toc-click-drives-preview-scroll-into-view/task-286-toc-click-drives-preview-scroll-into-view.md)
- [preview scroll sync setting #289](../289-preview-scroll-sync-setting/task-289-preview-scroll-sync-setting.md)

The post-sweep census found 0 moved findings. It retained 1 deliberately illustrative dead link
and 316 bare findings that have no unique mechanical replacement. Those findings span 48 records.
The dead example is in
[task Markdown links walkable #276](../../completed/276-task-md-links-walkable/report-276-task-md-links-walkable.md).

### Land and dispatch repair

[dispatch.sh](../../../../scripts/fleet/dispatch.sh) runs `--fix --moved-only` on the one newly
copied brief. [land.sh](../../../../scripts/fleet/land.sh) runs it on the acted-on report and task
record only. Neither hook walks the repository or repairs bare references.

Twenty fresh-process invocations against the current brief averaged `14.30 ms`. The maximum was
`15.21 ms`. All 20 stayed below the `100 ms` bound, so the wiring remains enabled.

### Preview state

The final [Markdown PTY contract](../../../../scripts/harness/smoke-markdown-harness.ts) proved:

- Dark and light themes paint a missing relative link with the error color.
- Both themes keep resolving and external links on the accent color.
- The same result holds at 10 lines and 100,000 lines.
- A source edit advances the buffer and parsed revisions, changes a dead link to a stale
  task-state link, and repaints it with the normal color without reopening the preview.
- Ctrl-click then opens the moved completed record and clears the earlier stated miss.

The cache test resolved two distinct local targets exactly twice within revision 7. Repeated reads
did not add work. Revision 8 raised the total to four. The external target never called file
resolution.

## Positive controls

The linter self-test planted and observed every negative class:

- Dead relative link: exit 1.
- Bare document reference: exit 1.
- Moved task-state link: exit 0 with a moved finding.
- Dead task-state link: exit 1.
- Dead source link outside task state: exit 1.

I also temporarily changed the dead-link stylesheet slot from `error` to `accent`. The focused test
failed with:

> Expected colorSlot "error"; received "accent".

I removed the plant. The final stylesheet test and both-theme PTY contract passed.

The original PTY reproduction was the opener's positive control: before the fix, the moved link
produced the exact missing-target notice. The final drive opened the completed record.

## Invariant review

I added
[Dead relative Markdown links have one revision-stamped verdict](../../../../src/modules/markdown/markdown.invariants.md#dead-relative-markdown-links-have-one-revision-stamped-verdict).
It records the error style, external-link exception, parsed-revision cache, watcher-driven repair,
and unchanged-frame cost bound.

I refined
[A file reference opens from rendered Markdown](../../../../src/modules/markdown/markdown.invariants.md#a-file-reference-opens-from-rendered-markdown)
with the exact task-name and tail fallback. I also updated
[Capability classes are stateless and Static wrapped](../../../../src/modules/system/system.invariants.md#capability-classes-are-stateless-and-static-wrapped)
for the shared stateless path capability.

The [manage-tasks skill](../../../../.claude/skills/manage-tasks/SKILL.md) now states the convention:
link by stable task-folder name; treat the state directory as a hint.

## Verification

- `bash scripts/merge-gate.sh` — `GATE_EXIT=0`. The gate ran the full unit suite, all 62
  parallel-safe PTY jobs, the behavioral contracts, the serial smokes, and the input-byte trend
  gate. The Markdown harness passed in `18.772 s`.
- `bun test` — 1,914 passed, 0 failed, 68,565 expectations across 295 files.
- `bash scripts/smoke-markdown.sh` — ALL-PASS.
- `bun scripts/harness/smoke-markdown-harness.ts` — ALL-PASS.
- `bun scripts/tasks/lint-task-links.ts --self-test` — ALL-PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 1,123
  annotations, 220 lattice links, 0 problems.
- `git diff --check` — PASS.

## Bycatch

- [Workspace.ts](../../../../src/modules/workspace/Workspace.ts) has two adjacent documentation
  blocks before `referenceIsExternal`. The first describes `resolveFileReference`, so it attaches
  to the wrong method. This comment drift existed before the task. I did not change it.
- The final gate's panel-split smoke timed out once while reordering `agent,terminal`. Its quiet
  retry passed. An earlier gate run showed the same timeout, so this intermittent failure
  reproduced twice. I did not change the unrelated panel contract.
- The final gate's overlay-dialog smoke timed out once. Its quiet retry passed. The failure did not
  reproduce a second time.
- A pre-commit gate's git-watch smoke timed out once while waiting for Quick Open after the
  confined-symlink arm. Its quiet retry passed. The failure did not reproduce in the clean final
  gate.
- The records sweep still reports 316 non-fixable or unresolved bare references and one
  illustrative dead link across 48 legacy records. The linter cannot choose a correct target for
  them, so I left them red for later triage.
