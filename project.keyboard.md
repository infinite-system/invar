# The keyboard reduction — focus owns the keystroke

Three requests arrived separately and are ONE problem:

1. "inside editor tab/shift+tab causes to move focus to another pane … tab/shift-tab should be
   reserved for indentation of code only like all IDEs" (#91)
2. "F keys, stop using them, they are hard to use on macos keyboard … shortcut combos are better"
   (#93)
3. "map out how to have great usability in windows, linux, macos and how to have 1 invariant in all
   of them still retained, and also how to pass through all the keyboard strokes and shortcuts
   safely down to the agent and terminal panels, so users don't feel that our 'emulator' is
   incapable" (#101)

All three are symptoms of ONE missing rule: **there was no stated answer to the question "who owns
this keystroke?"** Bindings accumulated as a flat table with a `context` field, and a chord could be
claimed globally by the host (`Tab → focus.toggle`) with nothing to say why the host was entitled to
it. Without an ownership rule there is no test that (a) Tab-for-focus is wrong, (b) an F-key is a
last-resort not a default, or (c) the terminal is entitled to everything not explicitly taken.

---

## 1. Who owns a keystroke?

**The candidate:** *the focused surface owns the keystroke; the host may claim a key only from a
minimal, justified reserved set.*

It survives the test. It generates the correct existing bindings:

- Every `context:`-scoped binding in `KeybindingDefaults.ts` is the focused surface's own choice:
  the editor's `Ctrl+S`, the tree's `Left`/`Right`, the git panel's plain `d`/`b`/`o`, the palette's
  `Return`, the popup's `Backspace`. The generator explains all of them in one line: a surface may
  bind ANY key it wants, including unmodified letters, because when it holds focus nobody else has a
  claim.
- It explains why the SAME chord means different things in different surfaces without that being an
  exception: `Ctrl+C` = copy in the editor, copy-selection in the agent pane, copy-or-SIGINT in the
  terminal. Three surfaces, three owners, one rule.
- It explains the agent pane's `Shift+Tab` = cycle permission mode
  (`AgentPaneContent.ts:692`). That is NOT an exception to Tab-belongs-to-indentation: the agent
  composer is the focused surface and Tab is not a content key there, so it is free to spend it.
  Ownership follows focus, so two surfaces may spend the same key differently and both are right.
- It explains the reserved escape hatches (`Ctrl+Q`, the panel toggles) as the *bounded* exception
  they were always meant to be, rather than as a privilege the host can extend at will.
- **It predicts the Tab bug as a violation.** `{ chord: { key: 'tab' }, action: 'focus.toggle' }`
  had no `context`, i.e. the HOST claimed an unmodified whitespace key that the editor surface needs
  for content. Under the rule that is illegal unless Tab is in the reserved set, and the reservation
  test below rejects it. The bug is derivable from the invariant, not just from the user's report.

No better generator was found. Two were considered and rejected:

- *"The most specific binding wins"* (a pure precedence rule). It describes resolution but decides
  nothing: `Tab → focus.toggle` was global, so a specificity rule would have kept it (nothing more
  specific existed) — it cannot generate the bug.
- *"VS Code parity"* (copy the reference IDE's table). Parity is a useful tie-breaker for chord
  CHOICE but it is not a generator: it cannot answer what to do where the substrate differs (a
  terminal that cannot encode a chord, a nested PTY that wants every key), which is exactly where
  this project's decisions live.

## 2. What justifies reservation?

A chord is host-reserved when the host takes it *away* from the focused surface. That is a theft, so
it needs a warrant. The warrant is two conjoined tests — one on the ACTION, one on the CHORD.

### 2a. Action admission — the trapped-user test

An action may be host-reserved only if BOTH hold:

- **(A1) Frame scope.** The action operates on the host FRAME — which surfaces exist, which are
  visible, which has focus — never on content inside a surface. (An action that edits, navigates, or
  searches within a surface can never be reserved, however convenient.)
- **(A2) Trap avoidance or toggle symmetry.** Either
  - *trap avoidance*: with the focused surface being a full-screen terminal running a TUI that
    consumes every key, the user would otherwise have NO way to reach the action at all — the
    canonical case being "leave / quit"; or
  - *toggle symmetry*: the action is the INVERSE of the gesture that put the user inside the
    surface. A toggle whose "on" gesture works from outside but whose "off" gesture is swallowed
    from inside is experienced as the app being broken, so the off-gesture must survive focus.

### 2b. Chord admission — deliverability and collision

The action being admissible says nothing about WHICH chord may carry it:

- **(C1) Never an unmodified key.** A reserved chord must carry a modifier. Unmodified keys —
  letters, digits, punctuation, `Tab`, `Space`, `Return`, `Backspace`, arrows — are content in some
  focused surface, so the host may never claim one. *(This is the clause that rejects
  `Tab → focus.toggle`.)* The one bounded exception is a bare FUNCTION key kept as a deliverability
  fallback for a total-loss action (§5): it produces no character, so it is never content — but a
  full-screen TUI that binds the same F-key (`htop` binds `F10` to quit) does lose it. That cost is
  the price of not trapping the user, and it is stated rather than hidden.
- **(C2) Proven deliverable.** The chord must be observed to ARRIVE through a real PTY. A chord the
  terminal cannot encode is not a binding, it is a wish. See §4.
- **(C3) Low collision cost in the child.** Prefer chords that shells, readline, and common TUIs do
  not own. `Ctrl+C`, `Ctrl+D`, `Ctrl+Z`, `Ctrl+A`, `Ctrl+E`, `Ctrl+R`, `Ctrl+W` are readline/job
  control and may never be reserved. `Ctrl+Shift+T` may not be used at all — it is "new tab" in most
  terminal emulators and is intercepted before the PTY. (Proposed earlier in this project; wrong.)

### The reserved set this produces

| Chord | Action | Warrant |
| --- | --- | --- |
| `Ctrl+Q` | `app.quit` | A2 trap avoidance — the only guaranteed exit from a key-hungry full-screen child. |
| `F10` | `app.quit` (alias) | A2 trap avoidance + C2: the fallback for a terminal that cannot deliver a shifted control chord. Retained deliberately; see §5. |
| `Ctrl+J` | `panel.toggleTerminal` | A2 toggle symmetry — the chord that opened the panel must close it from inside. |
| `` Ctrl+` `` | `panel.toggleTerminal` (alias) | Same warrant; VS Code's terminal chord. Degrades on terminals that send NUL (documented). |
| `Ctrl+Shift+A` | `panel.toggleAgent` | A2 toggle symmetry. |
| `Ctrl+Shift+S` | `panel.toggleSplit` | A2 toggle symmetry — splitting/un-splitting the panel you are focused inside. |
| `Ctrl+Alt+B` | `view.toggleRightDock` | A2 toggle symmetry. |

A note on where the diff-navigation chord landed. `F7` / `Shift+F7` were bound in the host's floor
against `diff.*` action ids. Under this invariant that was wrong twice over: the comparison is a
CONTRIBUTED EDITOR SURFACE that holds the editor column and consumes editor keys before the host's
table is consulted, so the chord is the surface's to spend — and a host floor naming a plugin's
actions is the same boundary error the conventions gate now scans `src/modules/keybindings` for.
`Ctrl+Shift+Up` / `Ctrl+Shift+Down` therefore live in `GitComparisonContent.handleKey` beside its own
`n` / `p`, and the host floor keeps those chords as the editor's jump-with-extend. The rule decided
this, not convenience: it is the same clause that gives the agent composer its `Shift+Tab`.

Everything else — every chord, in every surface — passes through to the focused surface unmodified.
Notably NOT reserved: `focus.toggle` (the panel toggles already release a trapped user, so it fails
A2), the command palette, find, save, buffer navigation. Those resolve only when a surface that does
not claim them holds focus.

`app.quit` also has the multi-step `Ctrl+X Ctrl+C`. Multi-step chords CANNOT be reserved (the
reserved check must be stateless, or it would disturb an in-flight chord), so that form is not an
escape hatch from a focused terminal — which is precisely why the `F10` single-chord alias is kept.

## 3. One invariant across macOS / Linux / Windows

What is genuinely platform-variant is exactly ONE thing: **the primary modifier** — `Ctrl` on Linux
and Windows, `Cmd` (`super`) on macOS. Everything else must be identical:

- the chord's MEANING (`primary+S` saves everywhere),
- its membership in the reserved set,
- the action id it resolves to.

Two parallel tables (`KeybindingDefaults.ts` + `KeybindingMac.ts`) can and did drift: `Ctrl+P` was
`quickopen.open` on the floor while `Cmd+P` was `palette.open` in the overlay — the same chord
meaning two different things depending on the platform, which is exactly what this invariant forbids.

The realization is a single substitution applied by ONE generator
(`KeybindingPlatform.primaryModifierAliases`): it reads the canonical floor, and for each action on
an explicit `primaryModifierActions` list it emits the same binding with `ctrl` replaced by `super`.
The alias therefore cannot disagree with the floor about meaning — there is no second table to edit.

What remains hand-written in `KeybindingMac.ts` is only what is NOT a substitution — chords whose mac
meaning genuinely differs from the Ctrl form, each with its reason inline:

- `Option+Left/Right` (and the readline `ESC-b` / `ESC-f` forms Terminal.app sends) = word jump —
  a different modifier for a meaning the floor spells `Ctrl+Left/Right`.
- `Cmd+Left/Right/Up/Down` = line/document start/end — mac-native, whereas `Ctrl+Left/Right` is a
  word jump. Not a substitution: the meanings differ.

A registry-level check (`actionsMissingCanonicalFloor`) mechanizes the floor: every action bound with
`super` must also be reachable without it.

## 4. Deliverability is a hard constraint

`KeybindingDefaults.ts` already carried the right reasoning (the F1/F8 comments): a terminal delivers
ENCODED BYTES, not chords, and the encoding varies. That reasoning is kept. What it did NOT do is
prove its claims — and two of them were wrong.

Measured against `@opentui/core`'s two parsers (legacy and kitty), for every chord this branch
touches (`scripts/harness/HarnessInput.ts` is the encoder; §Evidence in the READY report has the
full table):

- `Ctrl+Shift+<letter>` **is** deliverable on legacy terminals — in the xterm `modifyOtherKeys`
  form `ESC [ 27 ; 6 ; <lowercase-codepoint> ~`, which the LEGACY parser decodes correctly. The
  claim that it is "unencodable on legacy (non-kitty) terminals" was true only of the CSI-u form.
  This is why the F-keys can be retired at all.
- `Ctrl+Shift+<arrow>` is deliverable on both parsers (`ESC [ 1 ; 6 A`).
- `Ctrl+]` is a C0 byte (0x1D) — deliverable on every terminal, and the vi/ctags tag-jump chord.
- **`Ctrl+J` as the raw C0 byte 0x0A decodes as `name: 'linefeed'`, not `j`+ctrl.** The binding
  `{ key: 'j', ctrl: true } → panel.toggleTerminal` therefore never matched on a terminal that sends
  the bare control byte — the "RECOMMENDED everyday chord" silently did nothing there. Fixed by
  normalizing `linefeed` → `j`+ctrl at the registry's single decode boundary.

Retiring the F-keys means the replacements are PROVEN to arrive, driven through the real PTY, not
assumed. Every new chord in this branch has a driven-arrival row in the READY report.

## 5. Why two function keys are kept as aliases

The user said stop using them, so the burden is on keeping any. Two are kept, both DEMOTED to
aliases (never the advertised primary), both for the same reason: they are the only chords that
survive a terminal which speaks neither kitty nor `modifyOtherKeys`, and the action behind each is a
TOTAL-LOSS action if unreachable.

- **`F1` → `palette.open`.** The palette is the universal discovery surface; every action is
  reachable through it. If the palette is unreachable the app has no keyboard-discoverable
  behaviour at all. Primary is `Ctrl+Shift+P`.
- **`F10` → `app.quit`.** `Ctrl+Q` is flow-control (XOFF) on some terminals and is intercepted by
  VS Code's integrated terminal. Without a second single-chord reserved quit, a user inside a
  key-hungry focused terminal can be trapped — the exact failure the reserved set exists to prevent.
  Primary is `Ctrl+Q`.

Both are aliases the user should never need to press. Every other F-key binding is gone. The
advertised hint always shows the primary chord (the cheat-sheet and status bar read
`effectiveBindings`, which takes the LAST binding for an action, so aliases are ordered BEFORE the
primary in the table).

## 6. Pass-through to the terminal and agent panes

The rule falls straight out of §1: when a terminal or agent pane is focused, every non-reserved
keystroke reaches the child byte-for-byte. Structurally this already held — a focused panel returns
from the key router before the global binding resolve is ever reached, so the host's global chords
(`Ctrl+P`, `Ctrl+F`, `Ctrl+S`, `Ctrl+Tab` …) cannot steal from the child. What was missing was
EVIDENCE. The READY report carries the sent-vs-received table, produced by running a byte-reporting
program inside the integrated terminal and diffing what it received against what was sent.

Where a chord cannot round-trip, the reason is the encoder's, and it is stated rather than hidden:
`TerminalKeys.encode` returns `''` for any key it has no canonical VT encoding for (function keys,
`Ctrl+Shift+<letter>`), and an unencodable key is swallowed rather than leaking to the editor
beneath.

## 7. Inline rewrite chords

Inline rewrite is owned by the focused editor, so none of its chords is host-reserved:

| Chord | Action | Reason |
| --- | --- | --- |
| `Ctrl+Shift+R` | request now | Mnemonic R; the xterm `modifyOtherKeys` form reaches both OpenTUI parsers. |
| `Ctrl+Alt+Right` | accept | A modified arrow has a legacy xterm encoding and does not spend Tab or completion's unmodified Enter. |
| `Escape` | reject | Guarded by `inlineRewriteVisible`, so the existing editor Escape behavior remains authoritative otherwise. |
| `Ctrl+Alt+Up` / `Ctrl+Alt+Down` | previous / next variation | The arrow pair expresses ordered movement and does not collide with editor `Ctrl+Up/Down` or completion's plain arrows. |

Tab is intentionally absent: the editor owns Tab as indentation. Completion consumes only
UNMODIFIED Up, Down, Enter, Tab, Escape, and Backspace, so these modified rewrite arrows reach the
keybinding table even if a completion popup was open. The driven PTY smoke sends every rewrite
chord through `HarnessInput` and observes the resulting proposal state/document mutation; this is
the deliverability proof, not a table-only claim.
