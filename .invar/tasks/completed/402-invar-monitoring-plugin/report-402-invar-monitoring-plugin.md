# READY — #402 Invar Monitoring plugin: the app observes itself

- Branch: `fleet/402-invar-monitoring-plugin`
- Commit: `c772fbdd`
- Base: `6a749548`
- Gate: `merge-gate: ALL-PASS`, `GATE_EXIT=0` — read from the gate log itself, twice: a standalone run before the commit, and again from the pre-commit hook that admitted `c772fbdd`.
- Worktree: clean after the commit. Nothing pushed, merged, tagged, or deleted.

## What shipped

A plugin named **Invar Monitoring**. It appears in the Extensions list beside Terminal and Database
Explorer, and it enables and disables like any other citizen. Its pane is a right-dock content
(`monitoring`), reached by `Ctrl+Shift+N` or the command `View: Show Monitoring`.

The pane shows, one fact per row:

- processor use as a DELTA over a named window, and the window length
- resident set, heap-used, and (after a census) live heap, capacity, and the gap to the resident set
- every open tab: its file, whether it holds a live document, and the bytes that document retains
- retained totals, hydrated count, dehydrated count
- render requests per plugin since the pane opened, the heaviest other plugin, and the monitor's own
- the measured cost of one sample and of the last census
- whether logging is on, and how many lines it has written

Keys inside the pane: `l` toggles logging, `c` takes a heap census.

## Where the 206 -> 263 MB sits

The instrument is committed at
`.invar/tasks/in-progress/402-invar-monitoring-plugin/402-file-open-memory-measurement.ts`. It drives
the real editor, opens the largest repository sources one at a time through Go to File, closes every
tab, and takes a collected heap census at four checkpoints. Megabytes, 20 files:

| checkpoint | RSS | heap-used | live after GC | capacity | held docs |
|---|---|---|---|---|---|
| boot | 230.6 | 23.3 | 21.9 | 32.2 | 0 kB |
| after opening 20 files | 234.1 | 29.0 | 29.8 | 43.4 | 105 kB |
| after closing every tab | 253.8 | 64.9 | 27.1 | 41.5 | 0 kB |
| after a second collection | 236.3 | 27.8 | 27.9 | 42.3 | 0 kB |

An earlier 12-file run reproduced the reported SHAPE exactly: RSS 238.5 -> 253.6 -> 250.0 MB, up and
not back down.

**The tab-switch file cache is not holding the memory.** `OpenBufferSet` keeps at most two hydrated
documents (`MAXIMUM_RECENTLY_ACTIVE_HYDRATED_DOCUMENTS = 2`). With 20 tabs open it held about 105 kB
in total, and closing every tab returned it to zero rows and zero bytes. The live heap after a full
collection moved about 6 MB across the whole exercise.

What rises and does not come back is the RESIDENT SET, and it moves without regard to file activity:
it went UP by 20 MB during the tab-closing step, when the editor was releasing documents, not
holding them. That is allocator high-water. The runtime claimed pages from the operating system and
does not give them back promptly. The same effect explains 206 -> 263: a session that peaks high
keeps the peak in RSS long after the objects behind it are gone.

So the reading to trust is the CENSUS, not the resident set. The pane says so on screen: `heap-used`
carries the note that it only moves at collection time, and the census row prints live heap beside
the resident set so the gap is visible rather than assumed.

This report answers WHERE. It does not change eviction — that is #403, and the enumeration it needs
(`OpenBufferSet.documentLedger`) now exists.

## Decisions worth your review

**Monitoring is application scope, not workspace scope.** The plugin registers no workspace
contributor. Processor time, resident set, and heap belong to the PROCESS, and there is one process
however many workspaces are open; a per-workspace model would report the same numbers several times
and invite a reader to add them up. The document ledger instead TAGS each row with its workspace
root, so per-workspace file cost is still visible inside one model.

**One stats provider, two consumers.** `src/modules/monitoring/RuntimeSample.ts` is the generator:
self sampling, `/proc/<pid>` sampling for other Invar processes, the delta arithmetic, and the
collected heap census. `MonitoringStats` is the app-side consumer. The `instances:watch` CLI lens
from #376 becomes the second consumer of `RuntimeSample` — not of `MonitoringStats`, which carries
pane state the CLI has no use for. The other-instance lens itself is NOT built here; the seam it
needs is.

**Render load is counted by the HOST, at the boundary.** `ApplicationContributions.activate` already
wraps every contributor's `requestRender`, so one wrap there attributes every contributed frame
request to a named plugin. No plugin counts its own frames. This matters for the stated purpose: a
stray plugin is exactly the one that would not have instrumented itself.

**The monitor excludes itself from its own verdict, and only from the verdict.** It repaints once per
tick while open, so it would otherwise top its own suspect list forever. Its own load stays in the
painted ledger and in `monitoringOwnRenderRequestsSinceOpen`.

## The monitor is not the burn

- Hidden, it owns zero timers, takes zero samples, writes zero log lines. The driven smoke holds the
  sample count flat across a three-second hidden window and asserts the log file is untouched.
- One cadence sample measured 0.199 ms in the gated run. The smoke fails it above 5 ms.
- The heap census costs 19-31 ms on a 200 MB heap, so it is a COMMAND, never a tick.
- The pane prints both measured costs, so no reader has to take the claim on trust.

## Agent-readable

21 keys go through the status projection, so `bun run drive` and any agent reading the status
artifact sees the same numbers as the pane: `monitoringObserved`, `monitoringSamplingAtRest`,
`monitoringSampleCount`, `monitoringSampleCostMilliseconds`, `monitoringProcessorPercent`,
`monitoringResidentSetBytes`, `monitoringHeapUsedBytes`, `monitoringOpenDocumentCount`,
`monitoringHydratedDocumentCount`, `monitoringDehydratedDocumentCount`,
`monitoringRetainedDocumentBytes`, `monitoringRenderRequestsSinceOpen`,
`monitoringOwnRenderRequestsSinceOpen`, `monitoringStrayCandidate`, `monitoringLogging`,
`monitoringLogLineCount`, `monitoringCensusCount`, `monitoringCensusLiveHeapBytes`,
`monitoringCensusCapacityBytes`, `monitoringCensusResidentSetAfterBytes`,
`monitoringCensusCostMilliseconds`. Uninstalling the plugin removes all of them; a stale key is not
possible.

Logging writes JSON lines to `.invar/monitoring-samples.jsonl` in the active workspace, one per
sample, only while logging is on. `INVAR_MONITORING_LOG_PATH` redirects it for driven runs.

## Contracts

A new invariant contract for the monitoring module, beside its code, with six records:

- *A runtime reading is a delta over a named window* (reality)
- *A live heap figure is only true just after a collection* (reality)
- *The monitor names its own cost and pays it only when observed* — the NEW record the brief asked
  for
- *Retained document bytes come from the buffer set*
- *The monitor excludes itself from its own verdict*
- *The monitor is a pane content citizen*

Added to [src/modules/app/app.invariants.md](../../../../src/modules/app/app.invariants.md):
*Render load is attributed at the contribution boundary*.

Driven contract: `scripts/smoke-monitoring.sh` -> `scripts/harness/smoke-monitoring-harness.ts`,
registered in `scripts/behavioral-contracts.sh` as `== CONTRACT monitoring: ... ==`. Eight arms, 25
PASS lines, both file scales (40 lines and 40,000 lines).

Positive controls, each planted, observed to FAIL, then removed:

1. Keep the sampling timer while hidden -> `FAIL a never-opened monitor has no sampling clock and no
   reading`.
2. Report a constant retained length per hydrated tab -> `FAIL the large document dominates the
   ledger (4000 bytes against 2000)`.
3. Attribute every contributed render request to `'host'` -> `FAIL the monitor names its own render
   load beside the load it attributes to others`. This one only PARTLY failed at first: the
   companion assertion still passed with `'host'`, which means it was a weak instrument. I sharpened
   it to require the suspect to be neither `monitoring` nor `host`, and re-ran.

## Bycatch — observed, not fixed

1. `PanelHost.registerShared` hard-codes `kind: 'database'` and the label `'Database'` for the spaces
   it creates in every non-selected workspace content set (`createContentSet` repeats it). A second
   shared bottom-panel citizen therefore paints inside a space labelled "Database". Reproduced by
   registering this pane through `registerPanelContent`. I wrote a generic fix, then REVERTED it: it
   is a shared seam and this task did not send me there. The monitoring pane is a dock citizen now,
   which is the model the brief named, so the defect stands untouched.
2. `PanelHost.contentSpaceKind()` is a hard-coded two-value table (`'database'`, else `'terminal'`),
   so any new bottom-panel content kind is forced into the Terminal space.
3. `PanelHost.nextSpaceLabel()` repeats the same two-value table. The distillation target is one
   kind-to-label map that all three read.
4. `#393`'s `animationFrameCadenceTimerCount` projection is not in this base (commit `c290ef74` is
   not an ancestor of `6a749548`). #401, the idle-cost convention, is filed against a projection that
   has not landed.
5. `SettingSpec` (`src/modules/settings/SettingContribution.interface.ts`) offers `number`,
   `boolean`, `enum`, and `dynamic-enum`, but no free-text kind. A contributed path or file-name
   setting is impossible, which is why the log path is a constant plus an environment override
   instead of a setting.
6. **Nothing checks a keybinding for a collision.** My first chord for the pane was `Ctrl+Shift+M`,
   which `KeybindingDefaults.ts:692` already gives to the agent's terminal-follow cycle. Registering
   it a second time was silently accepted. The gate caught it, but only as two unrelated smokes going
   red (`smoke: keyboard invariant`, `smoke: terminal follow harness`), which reads as "you broke the
   agent pane", not "your chord is taken". `src/modules/keybindings/` has no conflict or duplicate
   detection at all. A registry check would have named the real fault in one line. I moved the pane
   to `Ctrl+Shift+N` and left the missing check alone.

## What I did not do

- No eviction change, no cache bound change. That is #403.
- No other-instance lens in the pane. The seam is in place; the lens is not, and the brief marked it
  optional.
- No fix to any bycatch item above.
