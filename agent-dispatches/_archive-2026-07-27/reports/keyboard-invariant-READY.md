# READY — The keyboard invariant: focus owns the keystroke (#91, #93, #101)

Branch `feat-keyboard-invariant`, worktree `/tmp/conductor-keyboard`, one commit, **rebased onto
`377d260`** (main had moved twice) with every check re-run on the rebased tree. `merge-gate.sh` NOT
run, nothing pushed, no tags, no branch deletions. `git ls-files | grep '^TASK'` returns nothing;
the worktree is clean.

---

## 1. The reduction

Full write-up in `project.keyboard.md`; recorded as the invariant **"Focus owns the keystroke"** in
`src/modules/keybindings/keybindings.invariants.md` with Scope, Impossible-if-true and
Rejected-alternatives.

The three requests were one missing rule: **nothing in the codebase answered "who owns this
keystroke?"** Bindings were a flat table with an optional `context`, so the host could claim a chord
globally (`Tab → focus.toggle`) with nothing available to say the claim was wrong.

**The invariant (candidate survived, sharpened):** *the focused surface owns the keystroke; the host
may claim a chord away from it only from a minimal, admission-tested reserved set.*

It generates the correct existing bindings — every `context:`-scoped binding is the focused surface's
own choice, which is why `Ctrl+C` legitimately means three different things in the editor, the agent
pane and the terminal, and why the agent composer's `Shift+Tab` (permission-mode cycling) is
**permitted rather than excepted**: ownership follows focus, so two surfaces may spend one key
differently and both are right. And it **predicts the Tab bug**: `{ chord: { key: 'tab' }, action:
'focus.toggle' }` carried no `context`, i.e. the host claimed an unmodified whitespace key the editor
needs for content.

Two candidate generators were rejected (recorded in the contract): *"most specific binding wins"* —
describes resolution but decides nothing, since `Tab → focus.toggle` was global and unopposed, so
specificity would have KEPT it; and *"VS Code parity"* — a tie-breaker for chord choice, not a
generator, because it is silent exactly where the substrate differs.

## 2. The reserved-set justification test

A reserved chord is the host taking a key AWAY from the focused surface, so it needs a warrant. The
test has an **action** half and a **chord** half — that split is what makes it able to reject `Tab`.

**Action admission (the trapped-user test).** Both must hold:

- **A1 Frame scope** — the action operates on the host FRAME (which surfaces exist, are visible, hold
  focus), never on content inside a surface.
- **A2 Trap avoidance OR toggle symmetry** — either, with the focused surface a full-screen terminal
  running a TUI that consumes every key, the user would otherwise have NO way to reach the action at
  all; or the action is the INVERSE of the gesture that put the user inside the surface (a toggle
  whose "on" works from outside but whose "off" is swallowed from inside reads as a broken app).

**Chord admission.** All three must hold:

- **C1 Never an unmodified key** — letters, digits, punctuation, `Tab`, `Space`, `Return`,
  `Backspace`, arrows are content in some surface. *This is the clause that rejects `Tab`.* One
  bounded exception: a bare FUNCTION key kept as a deliverability fallback for a total-loss action
  (§5) — it produces no character, at the stated cost that a TUI binding the same F-key (htop binds
  F10) loses it.
- **C2 Proven deliverable** through a real PTY. A chord the terminal cannot encode is a wish.
- **C3 Low collision cost in the child** — `Ctrl+C/D/Z/A/E/R/W` are readline/job control and may never
  be reserved. `Ctrl+Shift+T` may not be used at all (terminal "new tab"; proposed earlier in this
  project and wrong — not re-proposed).

**The reserved set this produces** (7 bindings, 5 actions). Each carries its warrant INLINE on the
binding as a new `reservedBecause` field, and a test (`reservedSetProblems()`) fails any reserved
binding that lacks a warrant or a modifier:

| Chord | Action | Warrant (verbatim from the binding) |
| --- | --- | --- |
| `Ctrl+Q` | `app.quit` | trap avoidance: the guaranteed exit from a full-screen focused child that consumes every key |
| `F10` | `app.quit` | trap avoidance (fallback): the only quit chord a terminal that speaks neither kitty nor modifyOtherKeys can deliver |
| `Ctrl+J` | `panel.toggleTerminal` | toggle symmetry: the chord that opened the panel must close it while the panel holds focus |
| `` Ctrl+` `` | `panel.toggleTerminal` | (same warrant) |
| `Ctrl+Shift+A` | `panel.toggleAgent` | toggle symmetry: the chord that opened the agent pane must close it while the pane holds focus |
| `Ctrl+Shift+S` | `panel.toggleSplit` | toggle symmetry: splitting and un-splitting the panel the user is focused inside |
| `Ctrl+Alt+B` | `view.toggleRightDock` | toggle symmetry: the chord that showed the right dock must hide it while the dock holds focus |

**Deliberately NOT reserved:** `focus.toggle`. The panel toggles already release a trapped user, so
it fails A2. The palette, find, save and buffer navigation are not reserved either — they resolve
only when a surface that does not claim them holds focus. `Ctrl+X Ctrl+C` (quit) is multi-step and
therefore *cannot* be reserved (the check must be stateless), which is exactly why the single-chord
`F10` alias is kept.

## 3. One invariant across macOS / Linux / Windows

Exactly ONE thing is platform-variant: the **primary modifier** (`Ctrl` on Linux/Windows, `Cmd`/
`super` on macOS). The chord's MEANING, its action id, and its reserved-set membership must be
identical everywhere.

The two parallel tables had already drifted: `Ctrl+P` was `quickopen.open` on the floor while `Cmd+P`
was `palette.open` in the overlay — the same chord meaning different things by platform.

Realized as ONE generator: `KeybindingPlatform.primaryModifierAliases` READS the canonical floor and
re-emits the listed actions with `ctrl` replaced by `super`. `KeybindingMac` is now
`generator(floor) ++ residue`, where the residue is only what no substitution can derive (Option
word-jumps and the four `Cmd+arrow` document motions — meanings the Ctrl forms do not carry), each
with its reason inline. There is no second table to edit, so that drift class is unrepresentable, and
`KeybindingPlatform.test.ts` pins it: every generated alias must have a floor twin identical in
everything but `ctrl`, reservation and warrant survive the substitution, `Ctrl+P` and `Cmd+P` resolve
to the SAME action, no action is reachable only with `super`, and the hand-written residue is exactly
those ten chords.

## 4. Full binding table — `old → new — why`

**Every user-visible default changed by this branch.** Vetoable individually.

| Old | New | Why |
| --- | --- | --- |
| `F1` → palette | **`Ctrl+Shift+P`** primary; `F1` KEPT as alias | VS Code parity. Measurement showed `Ctrl+Shift+P` IS deliverable on legacy terminals (modifyOtherKeys), contradicting the comment that justified F1. F1 retained only as the fallback for a terminal speaking neither protocol — the palette is the universal discovery surface, so its unreachability is a total loss. |
| `Shift+F1` → cheat-sheet | **`Ctrl+Shift+H`** | H for Help. Free, owned by no terminal emulator, deliverable on both parsers. `Shift+F1` removed. |
| `F8` → panel | **`Ctrl+J`** (with `` Ctrl+` `` alias); `F8` removed | Ctrl+J was already VS Code's chord and already present — it just never worked from the raw C0 byte (see §6). No new chord to learn. |
| `F9` → panel split | **`Ctrl+Shift+S`** | S for Split. (Not `Ctrl+Shift+T` — terminal "new tab".) Note: shadows nothing; `Ctrl+S` save is now explicitly `shift:false`. |
| `F10` → quit | `Ctrl+Q` primary; **`F10` KEPT as alias** | `Ctrl+Q` is XOFF on some terminals and VS Code's terminal intercepts it, and the `Ctrl+X Ctrl+C` form cannot be reserved — without a second single-chord reserved quit, a user inside a key-hungry terminal can be trapped. |
| `F6` → agent follow mode | **`Ctrl+Shift+M`** | M for Mode. Agent-context only, so it costs no global chord space. |
| `F7` / `Shift+F7` → diff change nav | **`Ctrl+Shift+Down` / `Ctrl+Shift+Up`**, now owned by the comparison SURFACE | Arrows carry the direction; `ESC [ 1;6A` decodes on both parsers. Moved out of the host floor entirely — see §7. Plain `n` / `p` inside a comparison are unchanged. |
| `F12` → go to definition | **`Ctrl+]`** | The vi/ctags tag-jump, and a real C0 byte (0x1D) so it is deliverable on EVERY terminal with no protocol negotiation. Pairs with the existing `Alt+[` go-back. |
| `Tab` → toggle sidebar/editor focus (global) | **`Ctrl+Shift+J`** | The bug (#91). Ctrl+J moves in and out of the BOTTOM dock; Ctrl+Shift+J is the same gesture for the SIDE dock. |
| (nothing) | **`Tab` → indent**, **`Shift+Tab` → outdent**, editor context | #91. With a selection: every selected line. Without: one indent unit at the caret / one removed from the line's leading whitespace. One atomic undo step. |
| `Tab` (global) in the file tree | **`Tab`**, `files` context | Behaviour preserved: the tree has no content use for Tab, so the SURFACE spends it on leaving itself — permitted by the invariant, exactly like the agent composer's Shift+Tab. |
| `Tab` (global) in the repository panel | **removed** — use `Escape` or `Ctrl+Shift+J` | The only regression in this table, and it is a boundary decision, not a preference: see §8. |
| `Ctrl+P` (shift DON'T-CARE) | `Ctrl+P` with **`shift: false`** | It was matching `Ctrl+Shift+P` and, being earlier in the array, shadowing the palette. Behaviour for `Ctrl+P` itself unchanged. |
| `Ctrl+H` (shift DON'T-CARE) | `Ctrl+H` with **`shift: false`** | Same class: it would otherwise swallow `Ctrl+Shift+H`. |
| `Ctrl+S` (shift DON'T-CARE) | `Ctrl+S` with **`shift: false`** | Same class, for `Ctrl+Shift+S`. |
| `Ctrl+J` (shift DON'T-CARE, reserved) | `Ctrl+J` with **`shift: false`** | A reserved don't-care would have swallowed `Ctrl+Shift+J` before the focused surface saw it. |
| `Cmd+P` → command palette (mac) | **`Cmd+P` → go to file**, `Cmd+Shift+P` → palette | Drift fix: a chord must mean the same thing on every platform (§3). |
| `Cmd+Q` (mac) | `Cmd+Q`, now **reserved** with the quit warrant | Generated from the floor, so it inherits reservation — Cmd+Q now quits from any mode, as Ctrl+Q does. |
| advertised hints | a `super` chord **never displaces** a floor chord | A Linux cheat-sheet was about to advertise `Cmd+P` for Go to File — a chord that cannot arrive for that user. |

Every remaining binding is untouched. Post-change hints (read from `effectiveBindings`, so this is
what the cheat-sheet and status bar actually show): `palette.open Ctrl+Shift+P`, `help.shortcuts
Ctrl+Shift+H`, `panel.toggleTerminal Ctrl+J`, `panel.toggleSplit Ctrl+Shift+S`, `panel.toggleAgent
Ctrl+Shift+A`, `app.quit Ctrl+Q`, `focus.toggle Ctrl+Shift+J`, `go.definition Ctrl+]`,
`editor.indent Tab`, `editor.outdent Shift+Tab`, `agent.cycleTerminalFollowMode Ctrl+Shift+M`,
`quickopen.open Ctrl+P`, `view.toggleRightDock Ctrl+Alt+B`.

## 5. Driven-arrival evidence for every new chord

Zero chords failed to arrive. Every row below is a real PTY drive in
`scripts/smoke-keyboard-invariant.sh` asserting the app ACTED, not that the table contains an entry.

| Chord | Bytes delivered | Driven proof the app acted |
| --- | --- | --- |
| `Tab` | `09` | document became `  const alpha = 1;…` — the file's own two-space unit inserted at the caret, and `focus` stayed `editor` |
| `Shift+Tab` | `1b 5b 5a` | document returned to `const alpha = 1;…` — exactly one unit removed |
| `Tab` (3-line selection) | `09` | all three lines gained one unit AND `hasSelection` stayed `true` |
| `Shift+Tab` (selection) | `1b 5b 5a` | all three lines lost one unit |
| `Ctrl+Shift+P` | `1b 5b 32 37 3b 36 3b 31 31 32 7e` | `overlay` became `palette` |
| `Ctrl+Shift+H` | `…;6;104~` | `shortcutHelpOpen` became `true` |
| `Ctrl+Shift+J` | `…;6;106~` | `focus` moved `editor → files` |
| `Ctrl+Shift+Down` | `1b 5b 31 3b 36 42` | `cursorLineIndex` moved `0 → 2` (the chord arrived at the editor; its comparison-surface meaning is unit-covered) |
| `Ctrl+Shift+S` | `…;6;115~` | `panelCellIds` became `agent,terminal`; the SAME chord un-split back to one cell (toggle symmetry, driven) |
| `Ctrl+Shift+M` | `…;6;109~` | `terminalFollowMode` cycled, with the agent cell focused (so the agent CONTEXT owned it) |
| `Ctrl+J` | `0a` | from INSIDE the focused terminal: `terminalVisible` became `false` and **nothing leaked to the child** |
| `Ctrl+Q` | `11` | from INSIDE the focused terminal: the app exited (the pane's foreground process fell back to the shell) |
| `Ctrl+]` | `1d` | `scripts/smoke-goto-definition.sh` / `-harness.ts` against a **real** typescript-language-server: the definition jump lands at `0,16` in `foo.ts` |
| `Ctrl+Shift+A` | `…;6;97~` | pre-existing, re-driven here (agent cell focus) |
| `Ctrl+P` | `10` | Quick Open opened (used to open the fixture) |
| `Ctrl+Home` | `1b 5b 31 3b 35 48` | caret parked at line 0 |
| `Alt+PageDown` | `1b 5b 36 3b 33 7e` | `panelFocusedIndex` moved to the terminal cell |

## 6. Deliverability: what measurement overturned

Three claims the codebase asserted were wrong. All three were found by measuring, not reading.

1. **`Ctrl+Shift+<letter>` IS deliverable on legacy terminals.** `KeybindingDefaults` claimed it was
   "unencodable on legacy (non-kitty) terminals that drop the shift bit". That is true only of the
   kitty **CSI-u** form (`ESC [ 112;6 u`). The xterm **modifyOtherKeys** form
   (`ESC [ 27 ; 6 ; 112 ~`) is decoded correctly by OpenTUI's LEGACY parser as well as its kitty one.
   *This is the fact the whole F-key retirement rests on.* `HarnessInput` now emits that form, so a
   `Ctrl+Shift` drive is evidence about legacy terminals rather than about kitty only.
2. **`Ctrl+Shift+P` never opened the command palette.** `{ key: 'p', ctrl: true }` left `shift`
   undefined (= DON'T-CARE) and sat EARLIER in the array, so it matched and shadowed the palette
   binding. A large part of why F1 had to exist. Fixed with explicit `shift: false`, and the same
   latent shadowing was fixed on `Ctrl+H`, `Ctrl+S` and the reserved `Ctrl+J`.
3. **`Ctrl+J` never fired from the bare control byte.** 0x0A is the C0 byte for Ctrl+J, but OpenTUI
   names it `linefeed`, so `{ key: 'j', ctrl: true }` never matched it: the binding the comment called
   "the RECOMMENDED everyday chord" silently did nothing on any terminal that sends the raw byte
   (which is what `tmux send-keys C-j` does, and what a terminal without modifyOtherKeys/kitty does).
   Fixed by normalizing `linefeed → j+ctrl` once, at the registry's single decode boundary.

Also recorded, unfixed and unfixable in the app: `` Ctrl+` `` arrives as NUL on some legacy
terminals, which decodes as `Ctrl+Space` (= `editor.completion`). That is why the chord is an alias
and `Ctrl+J` is the primary; the pre-existing comment already said it "silently no-ops", which
understates it slightly (it misfires). Not changed — removing `Ctrl+Space` completion would be worse.

## 7. Pass-through table (#101) — sent vs received

Method: a raw-key byte reporter (`scripts/harness/report-received-key-bytes.ts`) runs **inside the
integrated terminal**, in raw mode so `Ctrl+C`/`Ctrl+Z` are observable as BYTES rather than signals,
appending every byte it receives to a file. The smoke drives each chord and diffs received against
the bytes a real terminal sends for it. `expected` is `TerminalKeys.encode`'s contract, not the bytes
the harness pushed at the app — the question is what the CHILD sees.

| Chord | Expected (real-terminal bytes) | Received by the child | Verdict |
| --- | --- | --- | --- |
| `a` / `z` / `1` | `61` / `7a` / `31` | same | THROUGH |
| `Ctrl+A` | `01` | `01` | THROUGH |
| `Ctrl+C` | `03` | `03` | THROUGH (SIGINT reaches the child) |
| `Ctrl+D` | `04` | `04` | THROUGH |
| `Ctrl+E` | `05` | `05` | THROUGH |
| `Ctrl+K` | `0b` | `0b` | THROUGH |
| `Ctrl+L` | `0c` | `0c` | THROUGH |
| `Ctrl+R` | `12` | `12` | THROUGH (reverse-search reaches readline) |
| `Ctrl+U` | `15` | `15` | THROUGH |
| `Ctrl+W` | `17` | `17` | THROUGH |
| `Ctrl+Z` | `1a` | `1a` | THROUGH (job control reaches the child) |
| `Tab` | `09` | `09` | THROUGH (shell completion works) |
| `Shift+Tab` | `1b 5b 5a` | `1b 5b 5a` | THROUGH |
| `Enter` | `0d` | `0d` | THROUGH |
| `Backspace` | `7f` | `7f` | THROUGH |
| `Escape` | `1b` | `1b` | THROUGH |
| `Space` | `20` | `20` | THROUGH |
| `Up`/`Down`/`Right`/`Left` | `1b 5b 41`/`42`/`43`/`44` | same | THROUGH |
| `Home` / `End` | `1b 5b 48` / `1b 5b 46` | same | THROUGH |
| `PageUp` / `PageDown` | `1b 5b 35 7e` / `1b 5b 36 7e` | same | THROUGH |
| `Delete` / `Insert` | `1b 5b 33 7e` / `1b 5b 32 7e` | same | THROUGH |
| `Alt+B` / `Alt+F` | `1b 62` / `1b 66` | same | THROUGH (readline word motion) |
| `Ctrl+P` | `10` | `10` | THROUGH — **the host does NOT steal it** |
| `Ctrl+F` | `06` | `06` | THROUGH — **the host does NOT steal it** |
| `Ctrl+S` | `13` | `13` | THROUGH — **the host does NOT steal it** |
| `Ctrl+Shift+P` | `10` | `10` | **COLLAPSED** — the shift bit is lost. Not our defect: without the child enabling modifyOtherKeys, a real xterm sends `0x10` for Ctrl+Shift+P too. The child genuinely cannot distinguish it from Ctrl+P. |
| `Ctrl+Tab` | `09` | `09` | **COLLAPSED** — same substrate limit; a real terminal sends a plain Tab. |
| `F1` | — | (nothing) | **NOT ENCODED** — `TerminalKeys` has no canonical VT form for function keys, so the key is swallowed rather than leaking to the hidden editor beneath. Deliberate and now recorded. |
| `F5` | — | (nothing) | same |
| `Ctrl+J` | (reserved) | **nothing** | STOLEN, correctly — the panel hid and nothing leaked. |
| `Ctrl+Q` | (reserved) | **nothing** | STOLEN, correctly — the app quit from inside the focused terminal. |

**34 chords through byte-for-byte, 2 collapsed with the reason stated, 2 unencodable by design, 2
reserved and cleanly stolen with no leak** (38 sweep rows + the 2 reserved checks). Structurally this already held before this branch — a
focused panel returns from the key router before the global binding resolve, so the host's
non-reserved chords cannot reach a child's keys. What #101 was missing was the evidence; that is now
a gated smoke.

## 8. The plugin-boundary collision — reported, not allowlisted

`conventions-gate.sh` now scans `src/modules/keybindings` for source-control coupling and RATCHETS the
line count (13 allowed). My first cut added `{ chord: { key: 'tab' }, action: 'focus.toggle', context:
'git' }` so the repository panel would keep its Tab-to-leave gesture, which pushed it to 15 and failed
the gate. Per instruction I did not bump the allowlist. Instead:

- the host floor now carries **no** Tab binding for the repository panel — that panel keeps `Escape`
  (`git.leave`) and gains the global `Ctrl+Shift+J`, and the smokes that drove Tab there were swept;
- the two `diff.*` bindings were **removed** from the host floor entirely, which takes source-control
  coupling *below* where it was.

**This is #100's job.** The correct home for a contributed surface's chord is the plugin contributing
its own binding, exactly as `GitComparisonContent` now owns `Ctrl+Shift+Up/Down` in its `handleKey`.
Until plugins can contribute bindings, the repository panel's Tab gesture stays absent rather than
being smuggled into the host floor.

Note this is also a *good* outcome for the reduction: main's extraction of the comparison into a
contributed editor surface made the diff chord's correct owner obvious. A contributed surface holds
the editor column and consumes editor keys before the host's table is consulted — so under "focus
owns the keystroke" the chord is the surface's to spend, and the host's `editorShowingDiff` guard
(which had the host asking whether a plugin's view was open) disappeared.

## 9. Verification — exact exit codes

Every command run in `/tmp/conductor-keyboard` on the REBASED tree (`377d260` + this commit).

| Command | Exit |
| --- | --- |
| `bunx tsc --noEmit` | **0** |
| `bun test` (1529 tests / 233 files / 16873 expect calls) | **0** |
| `bun scripts/check-file-grammar.ts` | **0** |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | **0** |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` (798 annotations, 45 lattice links, 0 problems) | **0** |
| `bash scripts/conventions-gate.sh` | **0** |
| `bun scripts/check-coverage-ratchet.ts` (287 files, no undeclared decrease vs `377d260`) | **0** |
| `bash scripts/behavioral-contracts.sh` (ALL-PASS) | **0** |

### Touched smokes — three runs each

<!--SMOKE-MATRIX-->

### Pre-existing failures, attributed by measurement not assumption

Two touched smokes fail, and they fail IDENTICALLY on the base commit. I materialized the base tree
(`git archive e12206e | tar -x`, read-only — no worktree or ref was created) and ran them there:

- `scripts/smoke-terminal.sh` — base run reproduced `split drag grew terminal rows (13->13)` and
  `terminal still focused before quit`, plus one more (`button click OPENS the terminal`). Mouse
  geometry / divider drag, nothing keyboard-related. **Pre-existing.**
- `scripts/smoke-editor.sh` — base run reproduced BOTH failures verbatim: `gear click opened
  Settings` and `idle loop still ticking: frame 213 -> 215`. **Pre-existing.** The palette section I
  added to this smoke (both `Ctrl+Shift+P` and the retained `F1`) passes.

### Load run

<!--LOAD-RUN-->

## 10. Things I believe are defects and did NOT fix

1. **`` Ctrl+` `` misfires as `Ctrl+Space` on legacy terminals.** Both send NUL, which OpenTUI decodes
   as `{ name: 'space', ctrl: true }` — so on such a terminal the panel toggle silently triggers
   `editor.completion` instead. The existing comment says it "silently no-ops", which understates it.
   Unfixable in the app (the bytes are identical); the mitigation is that `Ctrl+J` is the primary. A
   real fix would mean dropping `Ctrl+Space` completion, which is worse.
2. **`bindingHint` cannot express a two-chord alias.** `effectiveBindings` keeps ONE binding per
   action, so `` Ctrl+` `` and `F1`/`F10` are invisible in the cheat-sheet. I made ordering carry the
   intent (aliases first, primary last) which is correct but fragile — a future editor reordering the
   table silently changes what the app advertises. The honest fix is for the hint map to hold a LIST
   and for the sheet to render "primary (or alias)".
3. **`agent`, `terminal` and `panel` contexts are absent from the cheat-sheet.**
   `ShortcutHelp.$mergedShortcutContexts` omits them, so `Ctrl+Shift+M` (agent follow mode) and the
   terminal's own chords are undiscoverable there. Pre-existing; not in scope.
4. **The diff surface's plain `n`/`p` are not registry data.** They are a `switch` in
   `GitComparisonContent.handleKey`, which bends "Bindings are intent addressed". I followed the
   existing shape for `Ctrl+Shift+Up/Down` rather than half-migrating a surface I do not own.
5. **`editor.indent` / `editor.outdent` have no palette commands.** `CommandDefaults` is mid-refactor
   by another builder, so I kept out; the cheat-sheet humanizes the action ids ("Indent"/"Outdent")
   and Tab is universally known. One-line addition when that file settles.
6. **There is no indent SETTING.** The unit is detected from the file (tabs win; otherwise the
   smallest positive leading-space run; two-space fallback matching `.prettierrc`). That is the honest
   reading of a file the user did not write, but a user who wants to *change* a file's indentation has
   no lever. A `tabSize`/`insertSpaces` setting is the follow-up — note `EditorWrap` and
   `EditorCoordinates` still hard-code `tabWidth = 4` for DISPLAY, so a setting would have to reach
   three places, which is itself a seam worth fixing first.
7. **`Ctrl+Shift+S` collides with "Save As" muscle memory.** There is no Save As, so nothing is lost
   today, but if one is ever added the split chord should move rather than the new command.
