# Keybindings — Invariants

Load-bearing rules for `src/modules/keybindings/`. Stands on `project.invariants.md`. Written
BEFORE the implementation (the contract is the reduction; the code realizes it).

## Reality-based invariants

### A terminal delivers encoded sequences not keys

**Invariant:** If input arrives from a terminal, then it arrives as encoded byte sequences whose
mapping to physical chords varies by terminal, protocol, and mode — and some chords are consumed
upstream (terminal app menus, tmux prefix, flow control) and NEVER arrive at all.

**Scope:** all keyboard input to the app, on every terminal.

**Mechanism:** the same physical chord encodes differently (legacy CSI vs kitty protocol vs
terminal-specific translations: mac Option+arrow may arrive as ESC-b/f or CSI with modifier;
Cmd+arrow may arrive as Home/End or as a kitty `super` event or not at all). Nothing the app does
changes what arrives — it can only decode what does.

**Generates:** the need for ONE decode layer; the impossibility of "binding Cmd+C" as bytes; the
deliverability-honesty requirement.

**Evidence:** OpenTUI ships two parsers (`parse.keypress` legacy + `parse.keypress-kitty`) and
`KeyEvent.super` exists only under the kitty protocol (`source: 'raw' | 'kitty'`); Terminal.app
consumes Cmd+C before the pty; Ctrl+Q is flow-control on many terminals (why F10 and the
Ctrl+X..Ctrl+C chord exist as quit fallbacks).

**Impossible if true:** a binding expressed as raw bytes that works across terminals; an app-side
guarantee that any specific mac Cmd-chord is receivable.

**Verification:** the parser pair in `@opentui/core`; tmux sequence tests driving distinct
encodings of the same logical chord.

**Status:** established

**Last refined:** 2026-07-21

### Modifier fidelity varies by protocol

**Invariant:** If the terminal speaks the kitty keyboard protocol, then `super`/`repeat`/release
fidelity exists; if not, those distinctions are collapsed or absent — the binding set must remain
OPERABLE at the lowest fidelity.

**Scope:** modifier-dependent bindings (Cmd/super aliases, any future repeat/release use).

**Mechanism:** `useKittyKeyboard` upgrades fidelity when the terminal supports it; on legacy
terminals `super` simply never appears, so super-addressed bindings never match — they degrade to
silence, not misfires, and every action they alias retains a canonical (Ctrl/function-key) binding.

**Generates:** the canonical-floor rule (every action reachable without super/option); safe mac
aliases.

**Evidence:** `KeyEvent.super?: boolean` (optional — absent on legacy); `KittyKeyboardOptions` in
the renderer.

**Impossible if true:** an action whose ONLY binding requires kitty-level fidelity.

**Verification:** registry test — for every action bound with `super`, a non-super binding exists.

**Status:** established

**Last refined:** 2026-07-21

## Chosen invariants

### Focus owns the keystroke

**Invariant:** If a surface holds keyboard focus, then it owns every keystroke that arrives — the
host may claim a chord away from it ONLY when that chord is in the reserved set, and a chord enters
the reserved set only by passing the admission test: the ACTION must be frame-scoped (it changes
which surfaces exist, are visible, or hold focus — never content inside a surface) AND must be
either trap-avoiding (unreachable otherwise when the focused surface is a full-screen child that
consumes every key) or the INVERSE of the gesture that put the user inside the surface; and the
CHORD must carry a modifier (never an unmodified key), be proven deliverable through a real PTY, and
not be one the child's shell/readline/TUI owns.

**Scope:** every keystroke the app receives, in every focus state, on every platform. Governs
`KeybindingDefaults.$canonicalBindings`, `KeybindingRegistry.resolveReservedGlobal`, and the key
router in `Bootstrap.keyTick`.

**Mechanism:** bindings carry a `context` naming the surface that owns them; a context-less binding
is a host claim and must therefore be justified. `reserved: true` marks the claim as surviving a
focused surface and requires a `reservedBecause` warrant string on the same binding, so the
justification cannot be separated from the binding. The key router resolves reserved chords first
and STATELESSLY, then hands the event to the focused surface — a focused panel returns before the
global resolve is reached, so the host's non-reserved globals cannot reach a child process's keys.
Unmodified keys are never reserved, which is what leaves `Tab` to whichever surface has focus:
indentation in the editor, permission-mode cycling in the agent composer, `\t` to the child in the
terminal.

**Generates:** the Tab-belongs-to-the-editor fix (#91); the small reserved set instead of a growing
list of host privileges; byte-for-byte pass-through to the terminal and agent panes (#101) as a
consequence rather than a feature; the ability to say a proposed binding is WRONG before shipping it.

**Rejected alternatives:** *"most specific binding wins"* — describes resolution but decides nothing:
`Tab → focus.toggle` was global and unopposed, so specificity would have kept it. *"VS Code
parity"* — a tie-breaker for chord choice, not a generator: it is silent exactly where the substrate
differs (unencodable chords, a nested PTY that wants every key). *"host owns modified chords, surfaces
own unmodified ones"* — rejected because it forbids a surface from binding a modified chord it
legitimately needs (`Ctrl+S` in the editor, `Ctrl+C` as SIGINT in the terminal) and because the host
does need SOME chords to survive a focused surface.

**Evidence:** `src/modules/keybindings/KeybindingDefaults.ts` (`reservedBecause` warrants on every
reserved binding; `Tab`/`Shift+Tab` bound in the `editor` context to indent/outdent);
`src/modules/keybindings/KeybindingRegistry.ts` (`resolveReservedGlobal`, the `reservedBecause`
field); `src/modules/app/Bootstrap.ts` (reserved-first router; the focused-panel early return);
`project.keyboard.md` (the reduction and the admission test);
`scripts/smoke-keyboard-invariant.sh` (drives Tab/Shift+Tab indentation, every retired F-key's
replacement chord, and the terminal pass-through sweep);
`src/modules/git/GitComparisonContent.ts` (a contributed surface owning its own Ctrl+Shift+Up/Down
change navigation, rather than the host floor naming the plugin's actions).

**Impossible if true:** the host binding an unmodified key globally; a reserved binding with no
warrant; a chord that is advertised but never arrives; a non-reserved host chord firing while a
terminal or agent pane holds focus; the same physical chord meaning different things on macOS and
Linux.

**Verification:** `bash scripts/smoke-keyboard-invariant.sh` (driven: indentation, every new chord's
arrival, the pass-through sweep) plus
`bun test src/modules/keybindings/ src/modules/editor/EditorIndent.test.ts` (the reserved set carries
warrants; no unmodified reserved chord; no `F<n>` primary).

**Status:** provisional

**Last refined:** 2026-07-26

### Bindings are intent addressed

**Invariant:** If a chord does something, then it does it by resolving to an ACTION ID through the
registry — never by inline key-handling code. A binding is data: `chord pattern (or step list) →
action id (+ context guard)`.

**Scope:** every keyboard behavior in the app (palette text entry and typed-character insertion are
the residual DEFAULT actions of their contexts, themselves dispatched by the registry).

**Mechanism:** `KeybindingRegistry.resolve(keyEvent, context)` performs a pure data lookup over the
layered binding set and returns an action id (or a pending-chord state, or null); Bootstrap maps
action ids to handlers. `KeybindingDefaults.textInputBindings` emits one complete chord table for
every adopted text-input context, so a surface cannot omit one member of a movement/deletion pair.
Multi-step chords (Ctrl+X..Ctrl+C) are step-list DATA with a timeout, not bespoke state code.

**Generates:** rebindability; the palette able to LIST every binding; plugins contributing bindings
as data; the dissolution of Bootstrap's key if/else chains.

**Evidence:** `src/modules/keybindings/KeybindingDefaults.ts` (canonical data and shared text-input
table); `src/modules/keybindings/KeybindingRegistry.ts` (lookup);
`src/modules/keybindings/KeybindingDefaults.test.ts` (all four text-input contexts have the same
18 chord/action signatures); `src/modules/app/Bootstrap.ts` (resolve then dispatch).

**Impossible if true:** a key behavior implemented outside registry dispatch; an action reachable
only through an unlisted binding; encoding logic anywhere but the decode layer.

**Verification:** `bun test src/modules/keybindings/KeybindingDefaults.test.ts src/modules/keybindings/KeybindingRegistry.test.ts && bash scripts/conventions-gate.sh`

**Status:** provisional

**Last refined:** 2026-07-25

### Resolution is layered and later layers shadow earlier

**Invariant:** If two layers bind the same chord in the same context, then the LATER layer wins:
canonical floor ← platform overlay (mac) ← plugin defaults ← user rebinds. Within a layer, a
context-guarded binding outranks an unguarded one, and a matching single binding outranks starting a
chord.

**Scope:** the registry's resolution order.

**Mechanism:** `registerLayer`, `registerPluginLayer`, and `registerUserLayer` assign explicit tiers;
layers sort by tier then registration sequence and resolve last-to-first. Guards (`when` predicates
registered by the host) filter candidates before precedence. Resolution is a pure function of
(event, context, pending-chord state).

**Generates:** mac defaults that don't fork the canonical set; contributed defaults that override
the host without outranking the user; user rebinds that never require editing shipped data;
deterministic conflicts.

**Evidence:** `KeybindingRegistry.ts` (tiered registration and reverse resolution);
`KeybindingRegistry.test.ts` ("plugin defaults shadow the floor but stay below user rebinds").

**Impossible if true:** a chord whose meaning depends on definition ORDER within a layer file; a
user rebind that cannot override a shipped binding.

**Verification:** `bun test src/modules/keybindings/KeybindingRegistry.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-26

### Plugin bindings cannot reserve chords

**Invariant:** If a binding is contributed by a plugin, then it cannot set `reserved` or carry a
`reservedBecause` warrant; reservation is host-only authority.

**Scope:** every binding admitted through `KeybindingRegistry.registerPluginLayer`.

**Mechanism:** `registerPluginLayer` scans the entire proposed layer before registration and throws
when either reservation field appears. The rejected layer is never inserted.

**Generates:** plugins can define defaults for the surfaces they own without gaining a route that
bypasses focused surfaces.

**Evidence:** `KeybindingRegistry.ts` (`registerPluginLayer`);
`KeybindingRegistry.test.ts` ("plugin layers refuse reserved claims and unregister symmetrically").

**Impossible if true:** a plugin chord firing through `resolveReservedGlobal`; a plugin supplying
its own warrant to take a focused terminal's chord.

**Verification:** `bun test src/modules/keybindings/KeybindingRegistry.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-26

### The canonical layer is the floor

**Invariant:** If an action is bound at all, then it has a binding in the canonical layer that uses
only universally-deliverable chords (Ctrl, plain keys, function keys, arrows) — overlays ALIAS, they
never replace the floor.

**Scope:** `keybindings.defaults.ts` vs every overlay.

**Mechanism:** overlays add patterns for the same action ids; removing every overlay leaves a fully
operable app.

**Generates:** mac/linux/ssh parity; safe degradation when a fancy chord can't arrive.

**Evidence:** to be realized; test — every overlay action id also appears in the canonical layer.

**Impossible if true:** an action reachable on one platform and unreachable on another.

**Verification:** the overlay-floor registry test.

**Status:** provisional

**Last refined:** 2026-07-21

### Advertised bindings are deliverable bindings

**Invariant:** If the UI shows a chord hint (status bar, palette, help), then it shows the
EFFECTIVE binding as resolved for this session's layers — never a chord the current terminal is
known to be unable to deliver.

**Scope:** every user-visible binding hint.

**Mechanism:** hints are pulled from `registry.effectiveBindings()` (the post-shadowing map), not
hand-written strings; platform-conditional chords appear only when their layer is active.

**Generates:** honest help text; hints that update when the user rebinds.

**Evidence:** to be realized (palette hint rendering from the registry).

**Impossible if true:** a hard-coded hint string that contradicts the live binding set.

**Verification:** hint text sourced from the registry in code review; a test that a rebind changes
the hint.

**Status:** provisional

**Last refined:** 2026-07-21

### Reserved global chords fire from any mode

**Invariant:** If a binding is marked `reserved` (an escape hatch — quit), then it resolves and
fires from EVERY mode, including while a modal or text input (find, replace, quick-open,
find-in-files, settings) holds keyboard focus — the focused input must let it pass through instead
of consuming it. A reserved chord is a single chord (no multi-step), so the pass-through check is
stateless and cannot disturb the in-flight chord resolver.

**Scope:** `KeybindingRegistry.resolveReservedGlobal` and the top of the key router in
`Bootstrap.ts` (checked before any modal/context branch). The reserved set today: Ctrl+Q and the F10
fallback (quit), Ctrl+J / Ctrl+` (panel), Ctrl+Shift+A (agent pane), Ctrl+Shift+S (panel split),
Ctrl+Alt+B (right dock). WHICH chords may join it is governed by *Focus owns the keystroke* above —
this record governs how a reserved chord RESOLVES, that one governs what may be reserved at all.

**Mechanism:** Reserved bindings carry a `reserved` flag in the binding data;
`resolveReservedGlobal` matches a key against reserved single chords WITHOUT touching chord state,
and the input router runs it FIRST — ahead of every modal input branch that would otherwise swallow
the key. Printable + navigation keys still reach the focused input; only the reserved set bypasses it.

**Generates:** the always-available quit escape hatch; the product's "no dead ends" guarantee that a
user can leave any mode; one reserved-set rule instead of per-modal quit handling.

**Evidence:** `src/modules/keybindings/KeybindingRegistry.ts` (`resolveReservedGlobal`, the
`reserved` field); `src/modules/keybindings/KeybindingDefaults.ts` (Ctrl+Q / F10 marked
`reserved: true`); `src/modules/app/Bootstrap.ts` (reserved check at the top of `keyTick`); the
`focus-recovery` and quit drive-verification (Ctrl+Q / F10 quit from normal / find / quick-open).

**Impossible if true:** a focused search/modal input swallowing a reserved quit chord so the user is
trapped with no way to quit; a reserved multi-step chord (which would need chord state and break the
stateless pass-through).

**Verification:** a driven test — open find / quick-open, type, press Ctrl+Q (and F10); assert the
app quits (the pane returns to the shell); typing without a reserved chord keeps the app alive.

**Status:** provisional

**Last refined:** 2026-07-21
