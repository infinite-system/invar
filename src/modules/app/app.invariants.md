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

### External plugin discovery precedes application boot

**Invariant:** If installed vendor code contributes to an application generation, then AppLoader
finishes its verified discovery and kernel registration before it asks Bootstrap to construct that
generation.

**Scope:** Process entry, vendor discovery, default contribution assembly, and Bootstrap.

**Mechanism:** `AppLoader.bootApp` registers public kernel targets, awaits
`VendorPluginRuntime.load`, appends the resulting contributors in canonical identity order, and
then calls Bootstrap. A restart uses `execve` with the same arguments and environment, so the
workspace and PTY survive while all application instances are reconstructed.

**Generates:** An unchanged compiled executable that loads external TypeScript; one pre-seal
composition boundary; in-app restart to apply.

**Rejected alternatives:** Discovery inside Bootstrap after seal; rebuilding the executable;
manual process restart.

**Evidence:** `src/modules/app/AppLoader.ts`; `src/modules/vendors/VendorPluginRuntime.ts`;
`.invar/tasks/in-progress/326-vendor-modularity-third-party-plugins/326-runtime-install-relaunch-harness.ts`.

**Impossible if true:** An installed kernel extension first becoming visible after `new App.Class`;
an install that requires the user to leave Invar and start it again manually.

**Verification:** `bun
.invar/tasks/in-progress/326-vendor-modularity-third-party-plugins/326-runtime-install-relaunch-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

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
reactive projection reaches that frame. That per-site discipline protects the pixels; the
published snapshot gets a structural backstop instead of a site census: the frame tick
re-publishes `AppStatusProjection` at the settle boundary (harness-observing runs only), so the
flushed status always reflects the model of the frame that settles. Without it, a close() that
mutates renderables synchronously can ride an already-queued frame, settle with the effect's
previous projection, and leave the status file stale for as long as the app stays quiescent —
the #529 panel-chrome contention flake, where "add header press cancels cleanly",
"two rapid expand clicks complete one symmetric cycle", and the splitter drag-span wait all
starved on that last-frame skew. Boot requests and observes a completed frame without a
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
bump `bufferRevision` and repaint the real terminal via the side channel. The settle-boundary
republish is exercised by task #529's `probe-529-press-cancel-loop.ts` (in that task's
`.invar/tasks` folder, which moves with the task lifecycle): pre-fix, status froze at the
pre-close popup state within a few iterations while the screen showed it closed; post-fix, 100
iterations clean.

**Impossible if true:** an async result (LSP diagnostic, git refresh) that changes model state but
does not repaint until the next keystroke; a final animation tick publishing stale focus, panel,
or scroll projection because its synchronized frame preceded the reactive paint; a state-changing
input whose only repaint request is coalesced into an in-flight frame before the new projection; a
settled status file that disagrees with the model of its own settled frame while the app is
quiescent (the starved-wait shape: screen shows the transition, status.json never does); a
settled `ready=true` boot publishing a nonzero `treeRows` model while the Files pane remains blank;
a render pass that mutates model state; an effect-per-item render graph.

**Verification:** the headless test above; `bun test src/modules/ui/RenderRequest.test.ts`; `bun
scripts/harness/smoke-tree-scroll-harness.ts`; plus the tmux smoke `scripts/smoke-editor.sh`
(input → edit → repaint → side-channel, ALL-PASS). Async-producer (no-keypress) repaint is
exercised end-to-end once git/LSP is wired into the editor (M4/M5).

**Status:** established

**Last refined:** 2026-08-06

### Render load is attributed at the contribution boundary

**Invariant:** If a contribution asks for a repaint, then the host counts that request against the
contributor's identifier, at the one closure through which every contributed render request already
passes. A plugin never counts its own frames, and no second render path exists to escape the count.

**Scope:** The `requestRender` supplied in `ApplicationContributions.activate`, and
`src/modules/system/RenderLoadLedger.ts`.

**Mechanism:** Stands on *Rendering is one coarse frame effect* and *Plugin boundaries grant one
authority*. A contribution receives its render capability from the activation context and has no
other way to reach the frame, so wrapping that one capability sees every request a plugin can raise.
Attribution BY THE HOST, at the seam, is what makes a stray plugin findable at all: self-reported
counters are absent exactly in the plugin that misbehaves, and a plugin that forgot to instrument
itself would read as the quietest one in the application.

**Generates:** the wrap in `activate` keyed to `contributor.identifier`; `RenderLoadLedger` counting
totals and a since-baseline delta; the Invar Monitoring lens sorting contributions by load; the
absence of any per-plugin render counter inside plugin code.

**Rejected alternatives:** Have each plugin report its own load — the stray plugin is the one that
does not. Count frames instead of requests — a burst of requests coalesced into one frame would read
as cheap while it is exactly the load worth finding. Count inside the frame effect — the effect no
longer knows who asked.

**Evidence:** `src/modules/app/ApplicationContributions.ts` (the `requestRender` wrap);
`src/modules/system/RenderLoadLedger.ts`; `src/modules/system/RenderLoadLedger.test.ts`;
`src/modules/monitoring/MonitoringPlugin.test.ts`;
`scripts/harness/smoke-monitoring-harness.ts` (a driven Tasks Dashboard lens change is attributed to
`tasks-dashboard`, not to the host and not to the monitor). Positive control 2026-07-30: keying the
wrap to a constant `'host'` instead of the contributor made the smoke fail with `FAIL the monitor
names its own render load beside the load it attributes to others`.

**Impossible if true:** a contributed render request that reaches the frame uncounted; a render
counter living inside a plugin; a load figure attributed to the host when a named contribution
raised it.

**Verification:** `bun test src/modules/system/RenderLoadLedger.test.ts
src/modules/monitoring/MonitoringPlugin.test.ts`; `bun
scripts/harness/smoke-monitoring-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

### Quit requires explicit confirmation

**Invariant:** If a user invokes quit, then Invar opens one modal confirmation with No focused and
does not shut down until the user explicitly activates Yes. Every dismissal leaves application
state intact.

**Scope:** The `app.quit` command and its effective Ctrl+Q, Cmd+Q, and F10 bindings. Process signals,
startup failures, and the PTY harness's declared teardown bypass are outside this product path.

**Mechanism:** `Bootstrap.requestQuit` routes both command execution and reserved bindings through
one generic `Dialog` model in the exclusive overlay slot. The model resets to No each time it
opens. Left, Right, and Tab move the visible focus; Enter activates it; Escape, No, the shared close
control, an outside press, and a second quit chord dismiss. Only Yes calls `shutdown`. The prior quit
path had no dirty-buffer guard: it shut down immediately even with unsaved edits. The confirmation
is now that guard. A dismissal preserves the dirty document, while explicit Yes authorizes exit
without saving. Opening quit cancels a pending close-tab question but does not close or clean its
buffer.

**Generates:** A centered, content-sized, rounded, themed Invar dialog; safe double-tap behavior;
keyboard and pointer parity; one affirmative shutdown edge; dirty-buffer preservation on every
negative edge.

**Evidence:** `src/modules/ui/Dialog.ts`; `src/modules/ui/Dialog.test.ts`;
`src/modules/app/Bootstrap.ts`; `src/modules/ui/OverlayLayer.ts`;
`scripts/harness/smoke-quit-confirmation-harness.ts`.

**Impossible if true:** One quit chord exiting immediately; No, Escape, close, outside click, or a
second quit chord shutting down; a negative answer clearing a dirty buffer; Yes closing the dialog
but leaving the process alive; a terminal-style y/N prompt on the quit path.

**Verification:** `bun test src/modules/ui/Dialog.test.ts && bun
scripts/harness/smoke-quit-confirmation-harness.ts`

**Status:** established

**Last refined:** 2026-08-01

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
