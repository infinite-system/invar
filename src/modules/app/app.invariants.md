# App — Invariants

Load-bearing rules for `src/modules/app/` (`App`, `Bootstrap`) — the composition root and the
render loop. Stands on `project.invariants.md`.

## Reality-based invariants

_None specific — the app layer consumes the project reality invariants (the terminal shows a
bounded viewport; a referenced resource stays alive)._

## Chosen invariants

### Boot checks ivue static getter caching

**Invariant:** If Invar boots without `INVAR_SKIP_CAPABILITY_CHECK=1`, then the
installed ivue `Static()` has demonstrated stable identity across two reads of
a get-only `$` accessor before `AppLoader` begins booting any application
surface.

**Scope:** Process startup and the always-run merge gate. Other ivue behavior
and dependency versions are outside this capability-specific check.

**Mechanism:** `IvueStaticGetterCapability` installs one get-only accessor on
a throwaway canary, wraps it with the installed `Static()`, and compares two
property reads. `AppLoader.main` runs the assertion before calling its boot
seam. The gate invokes the same assertion with its escape hatch cleared.

**Generates:** Refusal to boot when every cached static table would recompute;
an actionable `bun install` remedy; the documented
`INVAR_SKIP_CAPABILITY_CHECK=1` emergency override; a hard gate step over the
installed dependency resolution.

**Rejected alternatives:** Compare installed and declared ivue versions —
valid semver resolutions and linked local builds make the version string a
false proxy for the capability.

**Evidence:** `IvueStaticGetterCapability.ts`;
`IvueStaticGetterCapability.test.ts`;
`scripts/check-ivue-static-getter-capability.ts`; real scratch installs of
ivue 2.1.0 and 2.2.1 produce false and true respectively for the canary.

**Impossible if true:** An unskipped stale ivue whose `Static()` ignores
getters reaching application construction; a capable linked ivue build being
rejected only because of its version string; a locked-out user having no
stated bypass.

**Verification:** `bun scripts/check-ivue-static-getter-capability.ts`; copy
the guard into scratch projects pinned to ivue 2.1.0 and 2.2.1 and observe
exit 1 with the remedy versus exit 0; set
`INVAR_SKIP_CAPABILITY_CHECK=1` in the failing leg and observe exit 0.

**Status:** established

**Last refined:** 2026-07-27

### Rendering is one coarse frame effect

**Invariant:** If model state changes — by input OR by an async producer (syntax, LSP, git) —
then a single owned reactive effect observes it and repaints; a repaint is never conditional on a
keypress, and no per-item render effect exists.

**Scope:** The render loop in `app/Bootstrap.ts`, the read-only status assembly in
`app/AppStatusProjection.ts`, and `App`'s owned effect scope.

**Mechanism:** `app.$watchEffect(...)` touches the load-bearing signals (document revision, cursor
line/col, viewport scrollTop, workspace focus, visible pane-content revisions, palette
open/query/selection, theme selection) then calls `paint()` = `view.update()` +
`AppStatusProjection.publish()` +
`requestRender()`. `AppStatusProjection` reads narrow live ports and updates `StatusChannel`
without mutating model state, so the effect never self-triggers. The frame tick publishes whether
`StatusProjectionContributions` maps withdrawn plugin keys to `undefined`, so `StatusChannel`
omits them from its JSON artifact instead of retaining stale values.
workspace and panel scroll momentum and contributed-surface animation are exactly at rest before
settling the status frame, giving driven verification condition endpoints without a clock. `viewport.setSize` (a
projection→model write) is kept OUTSIDE the effect, on boot + resize only. Input handlers mutate
model state and nothing else — the effect repaints. An animation deadline that mutates projection
inputs queues its render request in a microtask, after the coarse reactive effect has projected those
mutations; this includes the final settling deadline, which has no later cadence tick to repair a
stale frame. State-changing input that can race an already queued frame uses
`RenderRequest.afterCurrentTurn`, because OpenTUI may coalesce its same-turn request before the
reactive projection reaches that frame. Boot requests and observes a completed frame without a
timeout fallback, then marks the app started and uses the same next-turn capability for the semantic
frame. Each boot barrier observes its projected frame directly; it does not wait for renderer-wide
idle, which includes unrelated terminal capability work. `ready=true` therefore cannot precede the
frame that paints an already-populated contributed pane. Realizes *Data flows one way* (the
reactive-invalidation half).

**Generates:** async repaint for git/LSP/diagnostics without input; the single coarse effect (not
effect-per-line/token/cell); handlers that only mutate; `App.dispose()` calling `$stopEffects()`.

**Evidence:** `Bootstrap.ts` `app.$watchEffect(...)` + `paint()` + the
`workspaceScrollMomentumAtRest`, `panelScrollMomentumAtRest`, and
`contributedSurfaceAnimationAtRest` frame-tick projections;
`AppStatusProjection.ts`; `AppStatusProjection.test.ts`; `Bootstrap.test.ts` (the boot barrier stays
pending until its requested frame completes); `app/__tests__/frame-effect.test.ts`;
`src/modules/ui/RenderRequest.ts`; `src/modules/ui/RenderRequest.test.ts`
(revision + cursor change re-run the effect; `$stopEffects` stops it);
`scripts/harness/smoke-tree-scroll-harness.ts` (settled boot publishes 60 modeled rows and paints
one of them). Confirmed end-to-end by `scripts/smoke-editor.sh`: booting, opening a file, and typing
bump `bufferRevision` and repaint the real terminal via the side channel.

**Impossible if true:** an async result (LSP diagnostic, git refresh) that changes model state but
does not repaint until the next keystroke; a final animation tick publishing stale focus, panel,
or scroll projection because its synchronized frame preceded the reactive paint; a state-changing
input whose only repaint request is coalesced into an in-flight frame before the new projection; a
settled `ready=true` boot publishing a nonzero `treeRows` model while the Files pane remains blank;
a render pass that mutates model state; an effect-per-item render graph.

**Verification:** the headless test above; `bun test src/modules/ui/RenderRequest.test.ts`; `bun
scripts/harness/smoke-tree-scroll-harness.ts`; plus the tmux smoke `scripts/smoke-editor.sh`
(input → edit → repaint → side-channel, ALL-PASS). Async-producer (no-keypress) repaint is
exercised end-to-end once git/LSP is wired into the editor (M4/M5).

**Status:** established

**Last refined:** 2026-07-27

### Owned resources release in reverse order

**Invariant:** If the app disposes, then it stops its reactive effects first, then runs owned
disposers in LIFO order, then destroys the renderer — so nothing repaints or references a
destroyed resource during teardown.

**Scope:** `App.dispose` + `Bootstrap.shutdown`.

**Mechanism:** `shutdown()` calls `app.$stopEffects()` before `view.dispose()`; `App.dispose()`
also calls `$stopEffects()` (idempotent), then runs `disposers.reverse()` (each guarded), then
`renderer.destroy()`. Realizes *A referenced resource stays alive* (explicit release).

**Generates:** the LIFO disposer stack; `$stopEffects`-before-teardown ordering; guarded disposers.

**Evidence:** `App.ts` `dispose()` (`$stopEffects` + LIFO + guarded); `Bootstrap.ts` `shutdown()`.

**Impossible if true:** the frame effect firing after renderables are destroyed; an owned watcher
or subprocess surviving app disposal.

**Verification:** a lifecycle test asserting effects stop and disposers run reverse on dispose;
tmux: no orphan process/effect after quit, terminal restored.

**Status:** provisional

**Last refined:** 2026-07-21
