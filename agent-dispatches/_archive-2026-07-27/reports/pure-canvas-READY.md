# PURE CANVAS — READY

Worktree `/tmp/conductor-canvas`, branch `refactor-workspace-pure-canvas`, merged up to main
`e7b3ac5`. Five commits, tree clean, nothing pushed/merged/tagged, merge gate not run.

| Commit | What |
| --- | --- |
| `753ae2e` | the census + a plugin boundary that can actually fail |
| `10efd91` | the capability question + the diff extraction |
| `93bbc7d` | merge main; keep this branch's boundary check, extend it to the keybindings |
| `9aa7d32` | markdown extraction; the editor-title action as a command FIELD |
| `b514d5a` | merge `origin/main` (the marks vocabulary) — see [the merge](#the-second-merge-origin-main-e7b3ac5) |

Census in the repo at **`project.canvas-census.md`**, kept current with what landed.

---

## THE HEADLINE

```
grep -icE "diff|markdown"  src/modules/workspace/Workspace.ts   ->  0
the same over src/modules/app (non-test)                        ->  0
```

**43 mode checks became 2 capability questions.** 14 diff (8 in `Workspace`, 6 in ui/app) and 29
markdown (`previewFocused` in `Bootstrap`).

`Workspace.ts` also lost a field: **`diffEditor` was deleted** — it and `emptyEditor` were two
identical document-less editors, and "empty" is the whole of either's behaviour.

---

## THE CENSUS (primary deliverable)

| Domain | Lines then | Real coupling then | Now | Status |
| --- | --- | --- | --- | --- |
| git | 0 | 0 | 0 | done (task #34) |
| **diff** | 34 | 8 state/method + 14 guards | **0** | **done** |
| **markdown** | 13 | 4 state/method + 29 guards | **0** | **done** |
| image | 5 | 1 predicate | 1 | next — third customer of the capability |
| file tree | 33 | 8 | 33 | needs only a dock-fallback flag |
| language / lsp | 61 | 18 | 61 | **blocked on the owner** |

Two corrections that changed the size of the work, both held up:

- **`resolveFileReference` is GENERIC** — path confinement, no markdown in it, one caller. It stayed
  in the host. Counting it as coupling would have inflated markdown by ~35 lines.
- **The largest domain is contracted, not drifted.** `The host canvas is complete without plugins`
  named both "language intelligence" and "Markdown" as host-canvas capabilities. Markdown had your
  direction behind it, so extracting it **refines** the record; I struck it from the enumeration and
  said so in the record, citing the direction. **`language intelligence` is deliberately still
  listed** — extracting it renegotiates the record rather than implementing it.

---

## THE CAPABILITY QUESTIONS

**Q1 `activeDocumentIsPresented`** — does the active tab's document remain the subject of the editor
surface? Collapsed the 8 `Workspace` guards (language sync, size notice, definition, hover,
completion, diagnostics, and the two content-type routers) plus `EditorPane` bracket match,
`EditorPaneRenderer`'s paint, `TabBar`'s breadcrumb controls, `RootView`'s tab/breadcrumb blanking,
and two `AppStatusProjection` bracket fields.

**Q2 `activeDocumentIsKeyboardTarget`** — does the active tab's editor own the keys and the caret?
Collapsed all 29 `previewFocused` sites.

A comparison answers *no* to Q1; a source|preview split answers **yes**, because the real editor is
embedded in its left pane. The old question could not express that at all — it conflated "occupies
the column" with "suppresses language intelligence".

Two ports, each with two customers before it was built: `workspace/EditorSurfaceClaims.ts` (the
answers) and `ui/EditorSurfaceContents.ts` (the occupant — a deliberate subset of the existing
`PaneContent` vocabulary, because the editor column is the same shape of slot as a dock).

---

## GAP D — accepted and built your way

`Command` gained `editorTitleIcon` (a key into the theme's action-icon set, so the glyph follows the
glyph-level ladder) and `toggled`, plus `CommandRegistry.editorTitleActions()` filtered by the same
guard `all()` uses. `TabBarRenderer` paints one padded cell per returned command; `TabBar` dispatches
by `commandId`. Beyond your reasoning, it keeps the toggle **one action** — one id, one guard, one
binding hint — where a separate button and command could drift apart.

**The diff view's "Open current" does NOT fit, and I left it.** `diff.invariants.md` → *Base and
current stay unambiguous* requires that affordance to be positioned **with the right pane**, and
makes "Open current appearing over the base pane" impossible-if-true. The editor-title row is one
strip across the whole column with no pane association, so moving it there would break the record
that makes base and current readable. Gap D therefore still has one customer — but it is now a field
on a many-customer contract rather than a port, which is exactly the distinction you drew.

## `activeDocumentIsKeyboardTarget` — kept, second answer landed

The 29 `previewFocused` guards became it. The invariant record now names both consumers and states
plainly that it should be folded back into presentation if a future refactor ever leaves it with one.
Movement still arrives through **rebindable commands**, not a raw-key intercept, so a remapped chord
still drives the preview — the comparison and the split share four movement verbs with a real
implementation on each side.

---

## THE BOUNDARY CHECK — mine kept, yours unioned, your gap closed

Kept this branch's structure (positive control **per matcher**, per-file shrinking allowlist).
Unioned from `dd93ba0`: **the refusal to pass having inspected zero files**, which mine lacked.

Unified to one mechanism: "zero tolerance" needed no second code path — it is the **absence of an
allowlist row**, so a finished domain simply has no rows for the files it left and one reference
there fails.

**Your gap is closed.** `src/modules/keybindings` is now scanned; it held **19** plugin names (13 git
chord identifiers + the `'git'` keybinding context, 2 diff, 3 markdown) while the gate said PASS. The
gate is green on arrival because exactly those pre-existing entries are allowlisted — and any NEW
plugin name there fails. Their proper extraction stays issue #100.

Verified by exit code, eight controls:

| Control | Result |
| --- | --- |
| clean tree | 0 |
| planted `import { GitPanel }` in `src/modules/app/HandlerGuard.ts` | 1 |
| a matcher that cannot see its own positive control | 1 |
| markdown coupling planted in an unlisted host-core file | 1 |
| a listed file grown past its allowance (12 > 10) | 1 |
| a **14th** git chord in `KeybindingDefaults.ts` (14 > 13) | 1 |
| a markdown identifier in `KeybindingRegistry.ts` (no row) | 1 |
| an allowance left slack | 0 + tighten-me notice |

---

## TWO REAL BUGS THE WORK FOUND — both cycles, both caught by driving

1. `MarkdownWorkspace.activeFileIsMarkdown` consulted the surface capability, which consults this
   claim. Infinite recursion, caught by its own unit test.
2. It then read `Workspace.editor` — which **also** consults the capability. Boot-time
   `Maximum call stack size exceeded`. **Unit tests missed it; `smoke-markdown` caught it** (exit 11,
   app never became ready), and booting the app directly named it in one line.

The claim now keys off `activeDocumentHandle`, which is the more honest subject anyway: the preview
mode belongs to the **tab**, not to whatever is painted over it. Recorded as impossible-if-true on
the capability invariant, because it is a real constraint of the port: *a claim may not derive its
occupancy from the aggregate it feeds.*

---

## VERIFY BY DRIVING

**18/18 driven runs exit 0** after the fix: `smoke-markdown`, `smoke-diff-overview`, `smoke-git-log`,
`smoke-gutter-diff`, `smoke-git-blame` × 3, plus `smoke-image-preview` (the capability's third
consumer still routes) and the activation harness.

- `behavioral-contracts.sh` **ALL-PASS**: idle-quiescence (idle frame delta 2 → 2 over 3 s untouched)
  and pane-independence across a diff open/close (`top=89, PLINE-119 rendered`).
- `smoke-workspace-tabs-harness` **ALL-PASS**: *the first switched frame arrives before the watcher
  walk completes* — the paint barrier holds; activation counters **tiny queries=2 watched=5, wide
  queries=2 watched=522** (equal query counts for 5 vs 500 directories, so the bound is depth).
- synchronous `WorkspaceSet.activate`, 400 switches: **median 0.003 ms, p95 0.013 ms, max 0.144 ms**.
- N-workspaces-≠-N-watchers: `WorkspaceSet.test.ts` passes; the git suspend/resume path untouched.

**Capability-path assertions, never mode names**: `Workspace.goToDefinition.test.ts` runs the real
`LanguageClient` over the in-process fake server, proves hover and completion **do** land, then
registers a replacing claim and asserts `hoverAt`→null, completions empty, `goToDefinition`→false,
diagnostics empty, `languageSizeNotice`→null — through the **requests**. An embedding claim keeps all
of them.

**Exit codes:** tsc **0**; `bun test` **0** (**1480 pass / 0 fail, 16364 assertions**, up from
1395/16128 at the start); file-grammar **0**; invariants `--all` **0**; `--all --refs` **0**;
conventions-gate **0**; coverage ratchet **0** (increases only — `Workspace.goToDefinition.test.ts`
`assertions 16 → 35, waits 5 → 8`; `Workspace.test.ts` `assertions 32 → 35, waits 8 → 8`; no
declaration needed); reactive-observation **0**.

---

## WHAT REMAINS, AND WHO OWNS IT

- **Gap C — no plugin port for default keybindings.** Two customers, so justified, but
  `src/modules/keybindings/` is now scanned and allowlisted, and #100 covers it properly.
- **Image (step 4)** — one predicate; it is the site that will decide whether Q1 must split into
  "presents the active document" vs "provides language intelligence". Cheap, and it validates the
  port with a third answer.
- **File tree (step 5)** — no new port needed; a dock-fallback flag plus the `focus: 'files'`
  defaults in four files.
- **Language (step 6) — the owner's decision, not ours.** Largest domain, 18 sites, a
  typescript-language-server workaround living in host core, and the only one a recorded invariant
  still assigns to the host. Its semantic-request port has one customer today, so building it now
  would be a guess.

---

## THE SECOND MERGE (origin/main `e7b3ac5`)

Main's side was the **marks vocabulary and editor overview ruler** (`a57daa8`): the gutter became the
diff column exclusively, diagnostics moved right into a new `OverviewRuler`, and `overviewMark`
joined the reserved-mark table. My side moves the diff **comparison** into the source-control plugin.
Orthogonal — one changes *where marks paint*, the other *who owns the comparison* — so every
resolution preserved both sides. Resolved by hand with `Edit`, no script rewriting markers.

### The four conflicts

**1–2. `diff/GutterDiff.ts` + `GutterDiff.test.ts` — took main's version wholesale.** My only change
to either was prettier reformatting, which I proved rather than assumed: `prettier(base)` is
byte-identical to my version. There was no intent of mine to preserve. Main renamed `statusByLine` →
`marksByLine` and changed the value from a bare kind to a mark record with `hoverLabel`. Both files
now match `origin/main` (formatting aside, after the pre-commit hook).

**3. `ui/EditorPane.ts` — nine hunks, unioned.** Kept main's `gutterHoverLabelsByRow` field, its
assignment from the render result, its `gutterBody` mouse-move/out tooltip handlers, and the
`gutterBody` + `tooltip` deps. Kept my `focusSourceEditor` rename and the capability question.

The bracket-match hunk was the one true semantic collision: main still read
`!workspaceSet.active.showingDiff.value`, which no longer exists. I kept the capability question —
which preserves main's **intent** exactly (suppress the bracket match when the source editor is not
the subject of the column) while naming no plugin.

**4. `workspace/workspace.invariants.md` — both sides added a whole record.** Unioned in order: mine
(*The editor surface answers capabilities, not plugin modes*) then main's (*One mark has one reserved
meaning*). Git had factored out the shared `Status`/`Last refined` footer as common context, so mine
needed its own footer restored; no Scope, Components, Mechanism, Rejected-alternatives, Evidence,
Impossible-if-true or Verification was dropped from either.

I also corrected two statements the merge made stale in **my** record rather than leaving them to
rot: its Scope listed `activeFileIsMarkdown` as a host content-type router (markdown is a plugin now
— it is the plugin's own `previewToggleAvailable`), and it now defers to main's record for *which*
marks a surface may paint.

Both sides' intent also survived in the files that auto-merged — `Workspace.ts` holds main's
decoration `revision` hook and `owner: 'diagnostics'` alongside my eight capability guards, and
`EditorPaneRenderer.ts` holds main's `owner === 'versionControl'` filter alongside my guard.

### One inherited failure — measured, not inferred

**`smoke-gutter-diff` fails one assertion: "removed line lacks the deleted-colored `▁` hint".**
It is **not caused by this merge.** I ran it on a throwaway detached worktree at pristine
`origin/main` and it fails there identically, same single assertion (worktree removed afterwards).
Corroborating: my branch never touched that script (`git diff base..HEAD` on it is empty), and main's
source contains `▁` **only inside two invariant records as an impossible-if-true**, never as a glyph
it can paint — `a57daa8` reserved `▎` in `palette.deleted` for a deletion and left the smoke waiting
for `▁`.

**I did not edit that assertion.** It is another builder's in-flight scope (`/tmp/conductor-marks` is
at `a57daa8`), and the fix is genuinely ambiguous from here: either the smoke's glyph literal is
stale, or the renderer lost a mark it should still paint. Choosing would silently cement my guess
about their intent, so it is flagged for them instead.

### Post-merge exit codes

All eight checkers on the **committed** tree (the pre-commit hook reformatted 27 files, so I
re-verified after it, not only before):

| Checker | Exit |
| --- | --- |
| `bunx tsc --noEmit` | **0** |
| `bun test` | **0** — **1489 pass / 0 fail, 16387 assertions** (up from 1480 / 16364; main's new tests included) |
| `bun scripts/check-file-grammar.ts` | **0** |
| `check_invariants.mjs --all` | **0** |
| `check_invariants.mjs --all --refs` | **0** |
| `bash scripts/conventions-gate.sh` | **0** |
| `bun scripts/check-coverage-ratchet.ts` | **0** |
| `bun scripts/check-reactive-observation.ts` | **0** |

Coverage ratchet: **increases only**, no declaration needed. Main's `project.coverage-deltas.md` rows
came through the rename untouched — `git diff origin/main` on that file is empty, so I appended
nothing and rewrote nothing.

Re-driven on the conflicted surface, **three runs each**: `smoke-markdown` 3/3, `smoke-diff-overview`
3/3, `smoke-diagnostics` 3/3, `smoke-git-log` 3/3, `behavioral-contracts` 3/3 ALL-PASS,
`smoke-workspace-tabs-harness` ALL-PASS. `smoke-gutter-diff` 0/3, on the inherited assertion above.
`smoke-markdown`, `smoke-diff-overview` and `behavioral-contracts` were re-driven once more against
the committed tree after the hook reformatted it — all exit 0.
