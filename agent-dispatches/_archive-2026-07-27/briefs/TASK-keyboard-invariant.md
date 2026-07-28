# TASK — The keyboard invariant: focus owns the keystroke (#91, #93, #101)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-keyboard`
(branch `feat-keyboard-invariant`, forked from `main` at `e12206e`).

Do NOT run `scripts/merge-gate.sh`. Do NOT push, merge, tag, or delete branches — the conductor
does that. Commit to this branch and write your report.

## What the user asked for, verbatim (three requests, one structure)

> "inside editor tab/shift+tab causes to move focus to another pane … tab/shift-tab should be
> reserved for indentation of code only like all IDEs"

> "F keys, stop using them, they are hard to use on macos keyboard we need to press fn + F8 / F9
> to use them, so shortcut combos are better"

> "for short cuts need to map out how to have great usability in windows, linux, macos and how to
> have 1 invariant in all of them still retained, and also how to pass through all the keyboard
> strokes and shortcuts safely down to the agent and terminal panels, so users don't feel that our
> 'emulator' is incapable"

These are one problem. Solve the structure, not the three symptoms.

## Phase 1 — the reduction (write it before you change behaviour)

Produce the reduction as a short document (`project.keyboard.md`) and an invariant record. It must
answer, with justification rather than preference:

1. **Who owns a keystroke?** The candidate invariant is *the focused surface owns the keystroke;
   the host may claim a key only from a minimal, justified reserved set.* Test it: does it
   generate every correct existing binding, and does it predict the Tab bug as a violation? If a
   better generator exists, take that one and say why.
2. **What justifies reservation?** A chord may be host-reserved only if it satisfies a stated
   test — e.g. it must be reachable when the focused surface is a full-screen terminal running a
   TUI that itself wants every key. Write the test, then apply it to produce the reserved set.
   The set should be SMALL and each member should carry its justification inline. Everything not
   reserved passes through to the focused surface unmodified.
3. **One invariant across macOS / Linux / Windows.** The existing split is
   `KeybindingDefaults.ts` + `KeybindingMac.ts`. Decide what is genuinely platform-variant (the
   primary modifier: Cmd vs Ctrl) and what must be identical everywhere (the chord's MEANING and
   its position in the reserved set). Platform difference should be a single substitution applied
   by one generator, not a parallel table that can drift.
4. **Deliverability is a hard constraint, not a preference.** A chord that a terminal swallows or
   cannot encode is not a binding, it is a wish. `KeybindingDefaults.ts` already carries good
   reasoning about this (see the F1/F8 comments around lines 177–195) — read it, keep what is
   true, and note that this is exactly why the F-keys were chosen. Retiring them means the
   replacements must be PROVEN to arrive, not assumed.

## Phase 2 — the three changes

### Tab belongs to the focused surface (#91)

In the editor, `Tab` indents and `Shift+Tab` outdents (with a selection: indent/outdent every
selected line; without: insert/remove one indent unit at the caret, respecting the file's indent
settings). Pane cycling must move OFF Tab. Note `Shift+Tab` in the agent pane already means
"cycle permission mode" (`AgentPaneContent.ts:692`) — that is the focused surface owning the key,
which your invariant should permit, but make sure the reduction says so explicitly rather than
leaving it as an exception.

### Retire the F-keys (#93)

Every `F<n>` binding gets a modifier chord. Constraints:

- `Ctrl+Shift+T` is NOT available — it collides with "new tab" in most terminal emulators. This
  was proposed earlier in this project and is wrong; do not re-propose it.
- Each replacement must be **proven to arrive** through the real PTY. Drive it in the harness and
  assert the app acted. A chord that fails to arrive gets replaced, and you report which ones
  failed — that list is valuable output, not a failure of the task.
- There are ~41 `F<n>` occurrences under `scripts/` (smokes drive `F8`, `F9`, …). Sweeping those
  is part of the task. Search for the BARE token with no quoting assumption and re-run until the
  search returns nothing unexpected — a quoted search missed live call sites in this codebase
  last night.
- Keeping a single unshifted F-key as a *fallback alias* may be defensible (F1 is aliased today
  for exactly that reason). If you keep any, justify it against the user's complaint — they said
  stop using them, so the burden is on keeping one, and the primary binding must be a chord.

### Pass-through to the terminal and agent panes (#101)

When a terminal or agent pane is focused, every non-reserved keystroke reaches the child process
byte-for-byte. Verify by driving a real nested program that reads raw keys and echoes what it got
— run something inside the integrated terminal that reports the exact bytes it receives, send a
broad sweep of chords, and diff received against sent. The deliverable is a **table of what gets
through and what does not**, which is the evidence the user's "users don't feel our emulator is
incapable" concern is actually satisfied. `src/modules/terminal/TerminalKeys.ts` is the encoder.

Where a chord genuinely cannot round-trip, say so with the reason (the terminal never encodes it)
rather than silently dropping it.

## Rules that have cost this project time before

- **Verify by driving the real user path**, never by unit-testing the table. A binding table test
  proves the table, not that the key arrives.
- **A wait must observe the state its assertion reads.** No bare sleeps between a drive and an
  assertion; no waiting on quiescence and then asserting content; no predicate already true
  before the action.
- **No test may find a control by its appearance.** Locate by role/text, assert through the
  lookup.
- Full descriptive identifier names, no abbreviations. 80 columns, `.prettierrc`.
- ivue conventions: `Static()` / `Reactive()`, `protected` floor, `X.interface.ts`,
  file-name-follows-class. Never read `Class.prototype.<member>`.
- Read `src/modules/keybindings/keybindings.invariants.md` and `project.invariants.md` first, and
  RECORD the keystroke-ownership invariant with Scope, Impossible-if-true, and
  Rejected-alternatives.
- **User-visible defaults are the user's call.** Choose the chords yourself (the user is asleep
  and asked you to pick), but list every changed binding in your report as a table of
  `old → new — why` so they can veto individually.

## Verification — exact exit codes, never a log tail

- `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`,
  `node .claude/skills/invariants/scripts/check_invariants.mjs --all` and `--refs`,
  `bash scripts/conventions-gate.sh`, `bun scripts/check-coverage-ratchet.ts`,
  `bash scripts/behavioral-contracts.sh`.
- Every smoke you touch, three runs each, exit codes in a table. F-key retirement touches many.
- One run with the machine deliberately loaded (a `bun test` in parallel) — load is what exposes
  wait defects.
- Declare assertion/wait count movement in `project.coverage-deltas.md` with the counted grammar
  (`path — assertions: A → B, waits: C → D — reason`). APPEND rows; other branches edit that file
  concurrently.

## Coordination — a sweeping refactor is in flight

Another builder is mid-flight in `src/modules/{workspace,git,markdown,diff,plugins}`, in
`src/modules/app/{Bootstrap,HandlerGuard,AppStatusProjection,TerminalSession,AppLoader}.ts`, in
`src/modules/commands/{CommandDefaults,CommandRegistry,CommandScoring}.ts`, and in ~28 `ui/`
files. You cannot avoid `app/` and `commands/` entirely — keep your edits there **minimal and
surgical** so the rebase is cheap, and put new structure in `src/modules/keybindings/` where you
own the ground. Expect to rebase onto a moved `main` before you finish; do that rebase yourself
and re-run the checks after it.

## Commit and report

`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`. Leave the worktree clean;
`git ls-files | grep '^TASK'` must return nothing.

Write `/tmp/keyboard-invariant-READY.md`: the reduction and the reserved-set justification test;
the full `old → new — why` binding table; the pass-through table (sent vs received, with the
chords that cannot round-trip and why); the driven-arrival evidence for every new chord; exact
exit codes; and anything you believe is a defect but did not fix.
