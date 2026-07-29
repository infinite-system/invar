# READY v2 — #114 Wave B: the terminal becomes a hosted runtime

Both gate regressions are fixed. Neither smoke was weakened; one was
strengthened. Commits on `fleet/114-modularity-umbrella-provider-runtime`:

- `d0dc07c` — Extract the terminal as a runtime plugin (#114 Wave B)
- `3b0bb83` — Fix two keyboard regressions from the terminal runtime extraction

Worktree clean. `scripts/merge-gate.sh` was not run. Nothing pushed, merged,
tagged, or deleted.

## Both regressions were one bug

I reproduced both in the worktree before changing anything.
`smoke-reserved-chord-harness` failed at line 183 exactly as reported;
`scripts/smoke-keyboard-invariant.sh` section D showed `Control+p`, `Control+f`
and `Control+s` as MISMATCH — sent, but never received by the child.

The cause is one line of the extraction. `KeybindingRegistry.inContext` is:

```ts
(binding.context ?? 'global') === 'global' || binding.context === context
```

A `global` binding deliberately matches inside **every** context — that is what
lets one canonical layer serve every surface. The pre-extraction terminal branch
never noticed, because it only dispatched actions it recognised by name:

```ts
if (terminalResolution.action === 'terminal.copy' && focusedContent.hasSelection()) …
if (terminalResolution.action?.startsWith('terminal.word')) …
if (terminalResolution.action === 'terminal.deletePreviousWord') …
```

Everything else fell through to `panelHost.handleKey(key)` and reached the child
as bytes. When I replaced those name tests with the generic
"resolve in the pane's own context and dispatch whatever it claims", the implicit
scope filter went with them. A focused terminal then dispatched every global
chord that happened to match: Ctrl+P opened Quick Open, Ctrl+F the find bar,
Ctrl+S saved, Ctrl+, opened Settings — and the child received nothing.

That is both failures. The keyboard-invariant sweep saw it as pass-through
MISMATCHes; the reserved-chord harness saw it as a focused task pane opening
Settings on Ctrl+, when it should have kept the chord surface-scoped.

## The fix

`Resolution` now reports the context the matched binding **declared** —
`'global'` for one that applies everywhere, the context name for a scoped one,
`null` when nothing matched. The pane branch requires it to equal the pane's own
context before dispatching:

```ts
if (
  paneContextAction &&
  paneContextResolution.context === paneKeybindingContext &&
  (contextOwningPane.claimsContextAction?.(paneContextAction) ?? true)
) { dispatchAction(paneContextAction, key); return; }
```

This restores the old dispatch set exactly — the six `terminal`-scoped bindings,
and nothing else — without the host knowing any action names.

Three things I deliberately did **not** do:

- **`resolve`'s matching is unchanged.** I only added a report of where the match
  came from. Changing `inContext` would have altered every caller.
- **The primary-dock branch is unchanged.** It still dispatches globals resolved
  in a dock pane's context. That is pre-existing behaviour and correct there: a
  file-tree or git pane has no raw-byte sink to pass a keystroke to, so there is
  nothing for a global chord to fall through *to*. Noted in the invariant's
  scope so the asymmetry is deliberate and recorded, not accidental.
- **Neither smoke was relaxed.** The pass-through table, its expectations, and
  the reserved-chord assertion are byte-identical to main.

## The second defect the fix uncovered

With the guard restored, `smoke-plugin-manifest-harness` began failing
deterministically (3/3) at the Terminal reinstall step — a step that had passed
before the fix. I bisected it by removing only the guard line: without it the
harness passed, with it failed. So the guard was implicated, and I probed the
live state rather than guessing:

```text
PROBE before Space: focus=editor panelVisible=true
PROBE after Space:  row=false disabledRow=true focus=editor
```

The Extensions row never re-enabled because `Space` was going to the editor, not
the dock. Walking back: `panelCellIds` still contained `terminal` **after the
runtime was uninstalled**.

`TerminalPlugin.disposeApplication` withdrew the status projection, the
keybinding layer, and the runtime registration — but never removed the panes it
had built. The orphaned pane kept rendering and kept the panel's keyboard focus,
so Ctrl+Shift+X was routed to it. Before the guard the orphan still dispatched
global chords, so it behaved almost correctly and the defect stayed invisible;
the guard made it swallow them as terminal bytes and the symptom surfaced.

This is a genuine hole in the runtime lifetime, not a harness artefact:
"runtimes own processes" has to mean uninstall releases them. `PaneRuntimeHostPort`
gained `releasePane(identifier)`, and `disposeApplication` now releases every pane
it owns before dropping the port (identifiers snapshotted first, since each
release calls back into `paneRemoved` and mutates the map).

## Positive controls — all three made to fail on purpose

| control | planted defect | result |
|---|---|---|
| `smoke-reserved-chord-harness` + the new unit test | make `resolve` report the *queried* context instead of the matched binding's, erasing the distinction | driven smoke fails at line 183; 2 unit tests fail |
| `smoke-plugin-manifest-harness` (new assertion) | skip `releasePane` in `disposeApplication` | `Timed out waiting for grid condition: the uninstalled runtime leaves no pane in the panel` |
| `smoke-plugin-manifest-harness` (from v1) | leave the status projection registered on uninstall | `Timed out waiting for uninstalling the Terminal runtime withdraws its status projection` |

Each returned to green when the plant was removed.

## Ratchets added

- `KeybindingRegistry.test.ts` — a resolution reports scoped vs global vs no
  match; the canonical floor declares no `terminal`-scoped binding at all (the
  other half of the move).
- `TerminalPlugin.test.ts` — all six contributed bindings resolve as
  `terminal`-scoped, while Ctrl+P/F/S/R/U/W do not; and uninstall releases the
  runtime's owned panes while leaving a declared task's own-kind pane alone.
- `smoke-plugin-manifest-harness` — uninstall leaves no pane in the panel
  (strengthening, not weakening: it asserts something the smoke previously did
  not check at all).
- New invariant `A focused pane consumes only its own scoped bindings`
  (`ui.invariants.md`), and a released-panes component added to `A pane runtime
  owns its processes`.

## Both reported smokes, driven green

```text
bun scripts/harness/smoke-reserved-chord-harness.ts
exit 0
  PASS  focused task content keeps surface-scoped Ctrl+, while reserved Ctrl+Alt+B reaches the host
smoke-reserved-chord-harness: ALL-PASS

bash scripts/smoke-keyboard-invariant.sh
exit 0
0 MISMATCH
smoke-keyboard-invariant: PASS
```

The sweep's relevant rows, sent vs received:

```text
  Alt+b                  1b 62                 1b 62                 THROUGH
  Alt+f                  1b 66                 1b 66                 THROUGH
  Control+p              10                    10                    THROUGH
  Control+f              06                    06                    THROUGH
  Control+s              13                    13                    THROUGH
  Control+Shift+p        10                    10                    COLLAPSED (terminal limit)
  PASS  every non-reserved chord in the sweep reached the child exactly as a real terminal sends it
  PASS  Ctrl+J was taken by the host and NOTHING leaked to the child
  PASS  Ctrl+Q quit the app from inside the focused terminal
```

`Alt+b` / `Alt+f` reaching the child confirms the plugin-contributed terminal
bindings still resolve and still forward; `Ctrl+J` and `Ctrl+Q` confirm the
reserved set still outranks a focused terminal.

## Full verification — exact exit codes

```text
bunx tsc --noEmit
exit 0

bun test
exit 0
1744 pass, 0 fail, 67840 expect() calls across 263 files

bunx prettier --check .
exit 0
All matched files use Prettier code style!

bash scripts/conventions-gate.sh
exit 0
conventions-gate: PASS

node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
exit 0
945 annotations, 67 lattice links, 0 problems

bun scripts/check-coverage-ratchet.ts
exit 0
322 files inspected, no undeclared decrease against 831e5cf
```

Driven green after the fix: `smoke-reserved-chord-harness`,
`smoke-plugin-manifest-harness`, `smoke-terminal-harness`,
`smoke-terminal-stage-harness`, `smoke-panel-split-harness`,
`smoke-panel-chrome-harness`, `smoke-paste-harness`,
`smoke-terminal-follow-harness`, `smoke-terminal-backpressure-harness`,
`smoke-clipboard-frame-boundary-harness`, and
`scripts/smoke-keyboard-invariant.sh`.

## Host-reference census — unchanged at 0

```sh
grep -rln "modules/terminal/" --include='*.ts' \
  src/modules/app src/modules/workspace src/modules/ui | grep -v '\.test\.'
# no output, exit 1   (was 4 files)
```

The two stricter censuses from v1 (relative production imports; any mention of
`TerminalPaneContent`/`TerminalFactory`/`TerminalCommandEvent`, tests included)
also remain empty. The fix touched `KeybindingRegistry`, `Bootstrap`,
`ApplicationContributions`, and `PaneRuntime.interface` — none of which name the
terminal module.

## Bycatch

- **`smoke-panel-chrome-harness` is intermittently red at `the Agent 2 list close
  removes only that instance`.** One red in seven runs across this session
  (`/tmp/v3-smoke-panel-chrome-harness.log`); three consecutive re-runs
  afterwards were green, as were three earlier runs. The assertion is in the
  AGENT instance-close path, which this wave does not touch — agent panes are
  not runtimes and their creation, registry, and close handling are unchanged.
  Not fixed: a one-in-seven timeout needs its own reproduction budget, and
  guessing at it inside this fix would be scope creep. Flagged because an
  intermittent red in the gate will otherwise be blamed on this branch.
- The two v1 bycatch items stand unchanged: the umbrella's done-test
  under-reports (`modules/agent/` is recorded at 0 host references but is
  imported at ~25 sites in `Bootstrap.ts`, `RootView.ts`, and
  `AppStatusProjection.ts`), and `PaneContent.capability<Port>()` infers `Port`
  badly at a call site with no explicit type argument.

## What this says about the extraction

Worth recording, because it is the reusable lesson: the regression was not a
mistake in the new seam, it was a **rule that had only ever existed implicitly**.
"A focused pane consumes only its own scoped bindings" was enforced by a
hand-written list of action-name prefixes — invisible, uncontracted, and lost the
moment the list was generalised away. Both smokes caught it, which is the system
working; what was missing was a written invariant, and there is one now. The
orphaned-pane defect was the same shape one layer down: uninstall symmetry had
been asserted for *registrations* but never for *panes*, so the hole survived
until a stricter routing rule made it visible.

The v1 report at `/tmp/114-modularity-umbrella-provider-runtime-READY.md` remains
accurate for everything else — the runtime seam, the agent-profile design, the
#46 / #157 finding, the seven relocated invariants, and the named residuals.
