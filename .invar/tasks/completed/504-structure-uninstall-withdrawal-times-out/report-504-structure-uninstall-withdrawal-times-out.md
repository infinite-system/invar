# READY — Task 504, Structure uninstall withdrawal timeout

## In plain words

Uninstall removed the Structure pane, but it left an empty Structure space selected. The smoke
waited for Tasks to take that space, so it timed out. I gave extension withdrawal its own host path.
Structure now leaves fully, and a surviving pane takes its place.

## Result

READY at commits `90598598` and `236f6017`.

The task end state is green. Three consecutive solo plugin-manifest runs passed. Two concurrent
plugin-manifest runs also passed. Each run completed `105` assertions and exited `0`.

## Diagnosis

The first default drive separated all three ranked candidates.

- The Extensions row changed from `[x]` to `[ ]`. The contribution revision advanced from `18` to
  `19`. The uninstall action ran.
- The active contribution count fell from `16` to `15`. Structure active workspaces fell from `1`
  to `0`.
- The right-dock registry fell from `3` contents to `2`. The activity item disappeared.
- `StructurePlugin.disposeStatusProjection` became `null`. The `structureStatus` key disappeared
  after the next settled projection.
- The right dock kept `activeId=null`. It did not select the surviving Tasks pane.

The smoke wait was correct. The pane and status projection did withdraw. The failure was the
surviving empty Structure space.

[PanelHost.removeContent](../../../../src/modules/ui/PanelHost.ts) intentionally keeps an active
space when a reader closes its last pane. Extension teardown used that same path from
[ApplicationContributions](../../../../src/modules/app/ApplicationContributions.ts). The host kept
the empty Structure container, so it could not select Tasks.

The brief's visible symptom was therefore narrower than the graph finding. No pane registration,
workspace controller, command disposer, or status disposer leaked. The stale host space caused the
combined wait to time out.

## Changes

- [PanelHost.ts](../../../../src/modules/ui/PanelHost.ts) now has `unregisterContent`. Extension
  withdrawal removes an empty contributed space and selects the next space. A user closing the last
  pane still keeps the empty space.
- The same host seam removes factory-created panes from selected and hidden workspace content sets.
  Database Explorer now gets the same withdrawal behavior.
- [ApplicationContributions.ts](../../../../src/modules/app/ApplicationContributions.ts) routes all
  contributed dock teardown through `unregisterContent`.
- [PanelHost.test.ts](../../../../src/modules/ui/PanelHost.test.ts) locks the distinction between pane
  close and registration withdrawal. It also checks survivor focus.
- [ApplicationContributions.test.ts](../../../../src/modules/app/ApplicationContributions.test.ts)
  checks that dock and panel-factory uninstall leave no empty contributed space.
- [MonitoringStats.ts](../../../../src/modules/monitoring/MonitoringStats.ts) now annotates
  `writeLogLine` with `Observability never crashes the app` at the enforcement point.

## Positive control

I planted the old `activeHost.removeContent` call after the new test existed. The targeted test went
red with the exact surviving `outline-space-1` object. I restored `unregisterContent`, and the
focused set passed `50` tests and `226` expectations at that point.

The final focused set passed `65` tests and `278` expectations. It includes the monitoring test
file.

## Driven verification

I drove real PTY gestures at defaults first. Every toggle used the visible Extensions row. Every
step checked the full host graph before the next step.

1. Removed active Structure. Tasks became active. The right dock held only Tasks and Monitoring.
2. Reinstalled Structure. Tasks stayed active. Structure returned as a third reachable space.
3. Showed Structure with `Ctrl+Shift+U`. Structure became active.
4. Removed inactive Tasks. Structure stayed active. No unrelated space moved.
5. Removed active Structure. Monitoring became active.
6. Removed Monitoring, the last dock pane. Contents and spaces both became empty. `activeId` became
   `null`.
7. Reinstalled Structure after zero. It became the sole active space.
8. Removed that sole pane. Contents and spaces returned to zero.
9. Reinstalled Tasks, Monitoring, and Structure. Then I removed and reinstalled Structure at fast
   toggle speed. The graph was correct after both actions.
10. Opened Database Explorer through `Ctrl+Shift+Y`. Uninstall removed its pane, active id, and
    database space. Its Extensions row became unchecked.

I repeated Structure withdrawal with the shared `100,000`-line fixture. It produced the same
`tasks` fallback, two-content registry, two-space shape, absent activity item, and unchecked row.

The full plugin smoke also covered the dirty `manifest.ts` editor focus case, source-provider
interleavings, Structure uninstall and reinstall, Database lifecycle, and Markdown auto-open
lifecycle.

## Verification

- `bunx prettier --check` on all five main-change files: PASS.
- `bun run typecheck`: PASS.
- Full `bun test`: `2,431` passed, `0` failed, `72,581` expectations.
- Focused unit set: `65` passed, `0` failed, `278` expectations.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: PASS with `1,396`
  annotations, `287` lattice links, and `0` problems.
- `bash scripts/conventions-gate.sh`: PASS.
- Final solo `bash scripts/smoke-plugin-manifest.sh`: three consecutive runs passed. Each had `105`
  assertions and exit `0`.
- Final concurrent `bash scripts/smoke-plugin-manifest.sh`: two processes ran together. Both had
  `105` assertions and exit `0`.

Final solo logs are `/tmp/504-plugin-manifest-final-solo-{1,2,3}.log`. Concurrent logs are
`/tmp/504-plugin-manifest-final-concurrent-{1,2}.log`.

## Invariant verdicts

The path scope includes [plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md),
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md), and
[system.invariants.md](../../../../src/modules/system/system.invariants.md).

### Plugin records

- **Peer plugins can have different lifetimes — strengthened.** Structure can leave while Tasks and
  Monitoring remain alive. The host now removes only Structure's registration and space. Reinstall
  needs no workspace restart.
- **Extensions states vendor authority before activation — upheld.** The built-in Structure row
  still exposes distinct enabled and disabled states. The task did not change network-vendor
  admission or restart behavior.
- **Provider rendezvous is host carried — upheld.** Markdown and Language Intelligence sources still
  withdraw and return independently through the shared registry. The full smoke passed those
  interleavings before it uninstalled Structure itself.

The headline pre-fix verdict is a violation of **Peer plugins can have different lifetimes**. A
disabled Structure contribution left host presentation state that belonged only to Structure. The
new withdrawal seam makes that state impossible.

### UI record refinement proposal

The change respects **An emptied space survives its last instance** for a reader's pane-close
gesture. Extension withdrawal has a different generator because the removed contribution can no
longer create or project that pane kind.

Proposed refinement, not applied:

> If the last instance of an installed panel space closes, the space remains active and offers
> another instance. The space's close gesture removes it. Withdrawal of the contribution that owns
> the pane kind also removes an emptied space, because that space can no longer create or project an
> instance.

The Scope should name `PanelHost.unregisterContent` as the contribution-withdrawal boundary outside
the pane-close rule.

### Observability record refinement proposal

The requested annotation now resolves at
[MonitoringStats.writeLogLine](../../../../src/modules/monitoring/MonitoringStats.ts).

Proposed Scope text, not applied:

> `StatusChannel.flush`/`settle`, `Logging.write`, and `MonitoringStats.writeLogLine`.

This names every current enforcement point that catches a failed observability write.

## Bycatch

- **FIXED, commit `236f6017`.** The plugin smoke still searched for the removed `✦` Agent status
  control at three close steps. The first final acceptance attempt timed out after `38` passing
  assertions. The next attempt reached the second stale site after `40` passing assertions. The
  live surface paints `❯`, and the Agent pane already has the real `Ctrl+Shift+A` toggle. I replaced
  all three stale pointer searches with that chord and removed the unused helper. The corrected
  smoke then passed `105` assertions. This was a local one-file check repair, so it has its own
  commit.

No other bycatch was observed.

## Commits

- `90598598` — `Withdraw extension spaces on uninstall`
- `236f6017` — `Use the live Agent toggle in the plugin smoke`

The dispatch-owned [AGENTS.md](../../../../AGENTS.md) change and one untracked fundamentals file were
present at entry. I did not edit or commit them.
