# TASK — Completion items get kind glyphs, resolved by the SAME authority the file tree uses (#89)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-kindglyphs`
(branch `feat-completion-kind-glyphs`, forked from `main` at `e12206e`).

Do NOT run `scripts/merge-gate.sh`. Do NOT push, merge, tag, or delete branches — the conductor
does that. Commit to this branch when done and write your report.

## What the user asked for, verbatim

> "the lsp autocomplete dropdown items should have specific to them glyph symbols like VSCODE,
> that makes it look nicer"

and, when asked how the glyphs should be chosen:

> "icons resolved should be same way the list tree resolves them, i guess unified approach?"

The second sentence is the load-bearing one. This is not "add a switch statement mapping
CompletionItemKind to emoji". It is: **there is one icon-resolution authority in this product, and
the completion popup becomes its second consumer.** If you finish with two resolvers, the task
failed even if the glyphs look right.

## Where things are

- `src/modules/theme/ThemeIcons.ts` — the icon vocabulary. It carries a `unicode` row and an
  `ascii` row, and `ThemeIcons.Class.iconFor(icons, name, isDirectory, open)` is today's resolver
  (the file tree's). `Theme.ts:92` is the call site.
- `src/modules/ui/CompletionPopup.ts` — the popup. It renders through `BoundedListPopup`. Note
  that another builder recently made this path flyweight: **there must be no per-item work
  proportional to list size added on any movement or wheel frame.** A 5,000-item list is a real
  fixture (`scripts/harness/completion-mock-provider-preload.ts`).
- `src/modules/lsp/` — where the completion item kinds arrive from the LanguageProvider contract.

## The reduction to do first (do not skip; report it)

`iconFor(name, isDirectory, open)` takes filesystem-shaped arguments. A completion item is not a
file. So the shared authority is NOT that function's current signature — it is whatever survives
when you ask what both consumers actually need. Both are asking the same question: *given a
CLASSIFIED THING, what one-cell mark represents it at the terminal's current capability tier?*

Find that generator. The file tree's classification (directory / open directory / extension) and
the completion kind (function, method, variable, class, interface, enum, keyword, snippet,
module, property, field, constructor, …) both reduce to a **symbol class** the vocabulary can be
keyed on. Introduce that class, express both consumers in terms of it, and keep exactly one table
per capability tier.

If you conclude a genuine unification is wrong — that the two really are different questions —
STOP and report why, with the structure that shows it, rather than shipping a second resolver
quietly.

## Constraints on the glyphs themselves

1. **One cell, provably.** Terminal width disagreement is a live defect in this repo (#95: `☰`
   was swapped for `≡` because the app and the terminal disagreed on its width). Every glyph you
   introduce must be single-column. Do not trust a width table alone — assert it in a test, and
   if there is an existing width-agreement helper, use it.
2. **Do not collide with the reserved-mark table.** These marks already mean something and must
   not appear as a completion kind: `▎` (diff), `●` (dirty), `❯` (separator), `•` (overview pip),
   `↗ ↙ + ×` (heading controls), and the activity-bar row `≡ ⑂ ⬢ ⌕ ⚙`. Read the reserved list in
   `src/modules/theme/theme.invariants.md` before choosing; if the list is not recorded there,
   record it as part of this task.
3. **Group into families.** VS Code's value is not that every kind differs — it is that related
   kinds LOOK related at a glance (callables share a shape, containers share a shape, values
   share a shape). Choose families deliberately and say what they are. Fewer distinct glyphs
   grouped well beats twenty unrelated symbols.
4. **Both tiers.** The `ascii` row must degrade honestly — a legible single ASCII character per
   family is fine; do not leave the ascii tier blank or identical for every kind.

## Rules that have cost this project time before

- **No test may find a control by its appearance.** Asserting `findText('ƒ myFunction')` re-breaks
  on the next vocabulary change. Locate the row by its item TEXT and assert the mark through the
  theme lookup, not through a literal pasted into the test.
- After any vocabulary change, search for the **bare token** with no quoting assumption
  (`grep -rn 'ƒ' src scripts`) and re-run until it returns nothing unexpected. A quoted search
  (`'⌕'`) missed live call sites in this exact codebase last night.
- Full descriptive identifier names, no abbreviations (`completionItemKind`, not `kind` where the
  scope is ambiguous; never `idx`, `ed`, `inc`). 80 columns, `.prettierrc`.
- ivue conventions: `Static()` / `Reactive()`, `protected` floor, `X.interface.ts` naming,
  file-name-follows-class. Never read `Class.prototype.<member>` — it poisons later instances.
- Read `project.invariants.md` and the module `*.invariants.md` files you touch. If you establish
  a new invariant (one resolver, one-cell marks), RECORD it with Scope, Impossible-if-true, and
  Rejected-alternatives.

## Verification — exact exit codes, never a log tail

- `bunx tsc --noEmit`
- `bun test`
- `bun scripts/check-file-grammar.ts`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` and `--refs`
- `bash scripts/conventions-gate.sh`
- `bun scripts/check-coverage-ratchet.ts`
- `bash scripts/behavioral-contracts.sh`
- Every smoke you touch, run THREE times, exit codes in a table. At minimum
  `scripts/harness/smoke-completion-harness.ts` and `smoke-bounded-list-popup-harness.ts`.
- **Drive the real path.** Open a real TypeScript file through the PTY driver, trigger completion
  at a caret where kinds genuinely differ (a member access gives methods AND properties), and
  assert from the emulator grid that different kinds carry different marks. A unit test over the
  mapping table is not evidence that the popup paints it.
- Re-run `bun scripts/harness/measure-completion-list-latency.ts` (or the equivalent named in
  `project.tools.md`) at 10 / 1,000 / 5,000 items and show that popup update time stayed flat in
  item count. Adding a per-item lookup on the paint path is the obvious way to regress this.

Declare any assertion/wait count movement in `project.coverage-deltas.md` using the counted
grammar (`path — assertions: A → B, waits: C → D — reason`); APPEND rows, never rewrite the table,
because other branches are editing it concurrently.

## Do not touch

Another builder is mid-flight on a sweeping refactor in `src/modules/{workspace,git,markdown,
diff,app,commands,plugins}` and in these `ui/` files: CommandBar, ContextMenu, CoreStatusBarSegments,
EditorContentMount, EditorPane, EditorSurfaceContents, HoverCard, RootView, ScrollGesture,
ScrollbarGeometry, SelectableText, SelectionDragBehavior, StatusBar, StatusBarSegments, TabBar,
TabBarRenderer, TabStrip, TextSelectionModel, Tooltip, TreePaneRenderer, WrapText. Stay out of all
of those. `CompletionPopup.ts`, `theme/`, and `lsp/` are yours.

`TreePaneRenderer.ts` being off-limits matters: if unifying the resolver requires editing the tree
RENDERER, report that as a required follow-up instead of doing it — change the resolver, keep the
tree's call site shape.

## Commit and report

`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`. Leave the worktree clean;
`git ls-files | grep '^TASK'` must return nothing.

Write `/tmp/completion-kind-glyphs-READY.md` containing: the reduction (what the shared generator
turned out to be, and what you rejected); the family table with every glyph in both tiers; the
width proof; the driven-path evidence with grid excerpts; the flat-latency numbers; exact exit
codes; and anything you found that you believe is a defect but did not fix.
