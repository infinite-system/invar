# READY #347 — markdown link resolution, and double click opens links

Commit: `5c29a8de` on `fleet/347-markdown-link-resolution-and-double-click`
GATE_EXIT: 0 (merge-gate ALL-PASS through the pre-commit hook, total 3m52s)
Base: `25237a43`

## Outcome

Two deliverables, both driven in the real application first.

1. The red links are ONE defect, not four. A document-relative link was
   confined to the DOCUMENT's own directory, so every authored `../` target
   failed to resolve. Every task record uses that form. Fixed at the resolver.
2. A plain double click on a rendered link now opens it. No keyboard, no
   modifier. Single click keeps its old meaning.

## Red-link census — driven, then classified

Instrument: [census-347-red-links-in-task-reports.ts](census-347-red-links-in-task-reports.ts).
(Both task-folder scripts are committed on the branch, so their links here resolve
once the conductor lands the merge.)
It boots the real application on this repository, opens one real task document
through Quick Open, waits for the preview to finish parsing, wheels the preview
from top to bottom, and collects every run of cells painted in the theme error
colour (dead) and the accent colour (live).

BEFORE the fix, on real completed reports:

| document | red runs | example |
|---|---|---|
| report-299 (structure filter uses shared input generator) | 10 | `` `TextInputModel` `` → `../../../../src/modules/text/TextInputModel.ts` — target exists |
| report-322 (status editor column content stale in preview) | 8 | `AppStatusProjection.ts` → `../../../../src/modules/app/AppStatusProjection.ts` — target exists |
| brief-347-2 (this task's own brief) | 2 | its [CLAUDE.md](../../../../CLAUDE.md) and [AGENTS.md](../../../../AGENTS.md) links, both four levels up — targets exist |

AFTER the fix, the same drives:

| document | red runs | accent runs |
|---|---|---|
| report-299 | 0 | 46 (whole document, scrolled to preview row 193) |
| report-322 | 0 | 21 |
| brief-347-2 | 0 | 18 |

Every red carried `target-exists`. Not one was a true miss.

### Per-rival classification — measurement, not the ranking

**a. Relative-base defect — CONFIRMED, and it is the whole population.**
`Workspace.resolveFileReference` built its document-relative candidate with
`Files.confineToRoot(dirname(activeDocument.path), reference)`. `confineToRoot`
returns null for anything that leaves the given root, and the given root was the
document's OWN directory. So a link that walked up even one level could never
resolve, from any document, anywhere. The workspace-root candidate
(`confineToRoot(this.root, '../../../../x')`) is null for the same reason. Task
records live four levels deep and cite the repository root, so their links were
red as a class.

Fix: the document directory is a STARTING POINT, not a boundary. It now uses
the existing `Files.resolveFrom`, and the workspace root stays the one
confinement boundary — the later `confineToRoot(this.root, resolvingPath)` check
was already there and is unchanged. A link that walks above the workspace root
still resolves to nothing.

**b. Anchor links — NOT a cause.** The fragment is stripped before resolution
and always was. The anchor-bearing reds in report-322
(links into [app.invariants.md](../../../../src/modules/app/app.invariants.md) carrying a record fragment) were red because of
the `../` in front, not the `#` behind: they are green now with the fragment
untouched. A same-directory link to
[project.invariants.md](../../../../project.invariants.md) carrying a `#record`
fragment resolved before the change too (asserted in `Workspace.test.ts`). No pure-fragment link (`](#…`)
exists anywhere under `.invar/tasks` — zero occurrences.

**c. Encoding — NOT a cause in this corpus.** `decodeURIComponent` already ran
before the existence check, and a malformed escape already returned null. The
six percent-encoded links under `.invar/tasks` are all external `https:` URLs,
which are correctly classified external and painted normally. I added a
regression assertion anyway — an upward link whose file name carries percent-encoded
spaces resolves — since the upward path is the newly reachable one.

**d. State-move rot — real, and correctly RED where it fires.** The application
already retries the other three lifecycle states through `TaskStatePath`, so the
26 links that `lint-task-links.ts` calls "moved relative" resolve in the preview
and paint normally. That is the tooling being stricter than the app, not a
defect. Fifteen links across the corpus are genuinely dead, and their red is
CORRECT behavior. Their dominant sub-class is not state moves at all: eleven of
the fifteen point into `.invar/worktrees/<task-slug>/…`, a builder's own worktree
that is removed once the task lands. The defect class there lives in the
report-writing convention, not in the preview. Filed below as bycatch.

## Double click opens a link

Semantics, stated plainly:

| gesture | meaning | changed? |
|---|---|---|
| single left click | focus the preview, begin a selection drag | no |
| Ctrl / Cmd / Alt + left click on a reference | open it | no |
| hovered Ctrl+Enter chord | open it | no |
| **double left click on the SAME reference span** | **open it** | **new** |
| double left click on prose or empty space | nothing (an ordinary second click) | new, deliberately inert |
| any activation of an `http(s)` link | states `External link — not opened here: <target>` | unchanged |

External behavior is the CHOICE the contract already made: the record *An
unresolvable Markdown link states why* rejects opening http(s) in a browser as
"out of scope for a terminal editor and a surprise seam", and the repository has
no external-open mechanism of any kind. A double click therefore states the same
message it already stated for Ctrl+click, rather than inventing a capability.
Driven proof below.

One event path, one hit test. The press runs `referenceAt` ONCE, and the
modified-click branch, the double-click branch and the selection drag all read
that single result — no second geometry, no parallel math. The second-press
question is not re-rolled either: it moved to
[DoubleClickGesture](../../../../src/modules/ui/DoubleClickGesture.ts), a small
shared generator, and the Git log pane (which had its own timestamp-and-index
copy with its own literal 450) now asks the same object the same question. That
rewire rides this commit rather than a separate one because it IS the seam
decision the feature required; it is called out here so the conductor reviews it
instead of discovering it. `smoke-git-log-harness` drives a real double click and
is ALL-PASS.

A press away from any reference carries the pressed CELL as its identity, so two
presses on ordinary prose can never masquerade as a link activation.

Driven proof: [probe-347-double-click-opens-a-link.ts](probe-347-double-click-opens-a-link.ts)

```
== single click keeps its existing meaning ==
  PASS  single click left the source buffer open and focused the preview (focus=preview)
== double click on a resolving link opens it ==
  PASS  double click opened /tmp/invar-probe-347-.../double-click-target.ts
== double click on an external link states why ==
  PASS  external double click stated: External link — not opened here: https://example.com/docs
== double click on plain prose activates nothing ==
  PASS  prose double click left the document open
== RESULT: ALL-PASS ==
```

## Ratcheted into the gate

New arm in [smoke-markdown-harness.ts](../../../../scripts/harness/smoke-markdown-harness.ts):
`driveUpwardLinkAndDoubleClickAtScale`, run at 12 lines and at 100,000 lines
(SCALE PARITY — the hit test is per row and per span). Its fixture puts the
document one directory BELOW the workspace root, the shape a task record has, and
asserts in one frame that the upward link paints accent, a missing upward link
paints error, and the external link paints accent; then that a single click opens
nothing, a double click opens the target, and a double click on the external link
states why.

New unit coverage: `src/modules/ui/DoubleClickGesture.test.ts` (5 tests, clock
passed in, independent surfaces stay independent) and an upward-resolution test in
`src/modules/workspace/Workspace.test.ts` that also asserts the workspace-root
boundary still refuses a walk past it.

POSITIVE CONTROLS — each new claim was made to go RED on purpose:

| planted defect | result |
|---|---|
| restore `confineToRoot` on the document candidate | `bun test` RED: `a relative link walks UP out of the document directory but never out of the workspace` |
| same plant, gated smoke | exit 1: `FAIL 12-line an upward relative link resolves while a missing one stays dead` |
| disable the double-click branch | probe RED, and smoke exit 1: `Timed out waiting for 12-line double click opens the upward link target` |

Each plant was removed and the green re-observed.

`#362` note: my arms are a new function placed after the task-presentation arms.
They do not touch the ordinal settings drive near line 2428 and add no
load-clipping preview assertion. Neither known defect is made worse.

## Gate chain

- `bunx tsc --noEmit` → TSC=0
- `bun test` → 2057 pass, 0 fail (316 files)
- `bun scripts/harness/smoke-markdown-harness.ts` → ALL-PASS, 97 PASS lines
- `bun scripts/harness/smoke-git-log-harness.ts` → ALL-PASS
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` →
  1224 annotations resolved, 223 lattice links resolved, **0 problems**
- `bash scripts/conventions-gate.sh` → PASS
- pre-commit merge-gate → **GATE_EXIT=0**, ALL-PASS, 3m52s

The gate recorded one retry: `smoke: panel-chrome harness`. Named, not chased —
the known load-flake family (`#214`, `#359`, `#371`).

## Invariants answered — record by record

Scope: [markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md)
plus the navigation-adjacent host records.

- **A file reference opens from rendered Markdown** — NEEDS REFINEMENT, and
  refined in this commit. Its statement named only Ctrl/Cmd click and the Ctrl+Enter
  chord; a third activation now exists. It also silently assumed the resolution rule
  that was wrong. The statement now names the double click AND states that a relative
  target resolves from the document's own directory with the workspace root as the
  only boundary; Mechanism gains the one-hit-test-per-press rule and the shared
  `DoubleClickGesture`; Impossible-if-true gains "an authored relative link that
  resolves on disk inside the workspace root but not in the preview", "a double click
  on prose opening anything", and "a single click acquiring the activation meaning".
  Status stays `established`.
- **An unresolvable Markdown link states why** — UPHELD, scope refined. The double
  click is another activation and reaches the same `notifyUnresolvedReference` path;
  driven proof above. Scope now says "EVERY activation gesture", the rejected
  alternative records that a double click on an external link does not acquire a new
  capability, and Impossible-if-true covers the double click. Status stays
  `provisional`.
- **Dead relative Markdown links have one revision-stamped verdict** — UPHELD,
  unchanged. The painting mechanism, the one-resolution-per-parse-revision cache and
  the external exemption are untouched; only the verdict that resolution returns
  changed. Its Impossible-if-true clause "a missing relative link using the normal
  accent style" still holds: the smoke's dead upward link paints error in the same
  frame as the live one.
- **Markdown preview selection reuses shared drag behavior** — UPHELD. The first
  press still falls through to `beginDrag`; only the second press on the same span
  diverts, and it returns before the drag begins.
- **Markdown panes keep independent find state**, **A Markdown file offers a live
  source preview split**, **The Markdown preview opens itself and sits on the
  configured side**, **Markdown presentation resolves through one stylesheet**,
  **Metadata fields preserve authored lines**, **Markdown headings are the
  document's structure**, **Markdown tables align by display cells**, **Preview
  rendering follows visible rows**, **Markdown blocks stay compact**, **Parsing
  starts only after opening**, **Applied blocks match the current revision**,
  **Closing releases all preview work**, **Markdown view mode persists across
  Markdown documents**, **A markdown parse can outlive its source revision** —
  UPHELD, untouched; the full harness re-drives them ALL-PASS.
- **Seams are drawn at the shared generator** ([project.invariants.md](../../../../project.invariants.md)) — UPHELD,
  and this task is a positive instance: the second double-click consumer wires into a
  generator instead of re-rolling the math, and the pre-existing consumer moved onto
  it. The new file carries the annotation.
- **A mouse event is consumed by exactly ONE handler path; renderer and hit-testers
  share the SAME row/geometry model** ([project.conventions.md](../../../../project.conventions.md),
  interaction discipline) — UPHELD by construction: one `referenceAt` call per press feeds every
  branch.
- MISSED RECORDS: none found in markdown. One GAP, below.

## Bycatch

- **Contract-layer gap — path confinement has no record of its own.**
  `Workspace.resolveFileReference` / `Files.confineToRoot` is host behavior with a
  security character (it is what stops a link from opening a file outside the
  workspace), and no record in
  [workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md)
  or [system.invariants.md](../../../../src/modules/system/system.invariants.md)
  claims it. Today it is described only inside a MARKDOWN record, so a change made
  from the workspace side sees no contract at all. That is exactly the blindness that
  let this defect live: the confinement rule was stated nowhere, so tightening it to
  the document directory looked safe. Not authored here; the gap is the report.
- **Fifteen genuinely dead links across task records — correct red, wrong writing
  habit.** Eleven point into `.invar/worktrees/<task-slug>/…`, a builder's own
  worktree that is removed when the task lands, so the citation is dead the moment it
  is useful to anyone else. Reproduced with
  `bun scripts/tasks/lint-task-links.ts <file>` over every `.md` under `.invar/tasks`
  (second run identical). Examples: `report-284-…:85`, `report-312-…:41,44`,
  `report-339-…:63,168`, `report-308-…:21,30`. A lint that refuses a worktree-path
  citation at write time would end the class.
- **The link lint and the application disagree about "moved" links.**
  `lint-task-links.ts` reports 26 `moved relative Markdown link` findings; the
  preview resolves all of them through `TaskStatePath` and paints them normally. The
  two are not wrong in the same direction — the lint is stricter — but a builder who
  fixes lint findings is editing links the product already handles. Worth deciding
  which one is the authority.
- **Quick Open ranks a sibling above an exact basename.** Typing the FULL basename of
  [report-299](../../completed/299-structure-filter-uses-shared-input-generator/report-299-structure-filter-uses-shared-input-generator.md)
  left
  [task-299](../../completed/299-structure-filter-uses-shared-input-generator/task-299-structure-filter-uses-shared-input-generator.md)
  selected first (2 matches). Reproduced on every census run; the census script now steps the selection
  down to the exact name to work around it. An exact-basename query losing to a
  sibling looks like a scoring defect, not a preference. Suspect, not diagnosed.
- **Distillation, FIXED in this commit (not a separate one, and stated here for
  review):** `GitPaneContent.onPointerDown` carried its own double-click detection —
  two fields, `Date.now()`, and a literal `450` — beside the new preview need. Both
  are now on `DoubleClickGesture`. It touches a module outside my task's subject,
  which is why it is reported rather than passed over; `smoke-git-log-harness` drives
  a real double click and stays ALL-PASS.
- **Observation, not a defect:** the preview's momentum scrolling means a wheel notch
  can land after the next status sample. The census script needed six consecutive
  no-movement samples before it could call the document bottom reached. A single
  sample would have stopped the census early — it did, on my first version, and
  under-reported the red count.

## Files

- `src/modules/workspace/Workspace.ts` — the resolution fix and its reasoning.
- `src/modules/system/Files.ts` — comment only: `resolveFrom`'s base is a starting
  point, not a boundary (no behavior change; the function already existed).
- `src/modules/ui/DoubleClickGesture.ts` + `.test.ts` — the shared generator.
- `src/modules/markdown/MarkdownSplitView.ts` — one hit test, three activations.
- `src/modules/git/GitPaneContent.ts` — wired onto the shared generator.
- [markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md) — two records refined.
- `src/modules/workspace/Workspace.test.ts` — upward resolution and the boundary.
- `scripts/harness/smoke-markdown-harness.ts` — the gated arm at both scales.
- `.invar/tasks/in-progress/347-…/census-347-red-links-in-task-reports.ts` and
  `probe-347-double-click-opens-a-link.ts` — the two instruments, headers explain
  how to run and how to read them.
