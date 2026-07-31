# Monitoring — Module Invariants

Invar Monitoring: the application observing its own processor time, memory, retained documents, and
per-plugin render load, from the inside, as an ordinary plugin. This contract governs
`src/modules/monitoring/`. It stands on the root `project.invariants.md` — in particular *Cost
tracks the actively observed set*, *Plugin boundaries grant one authority*, and *The host canvas is
complete without plugins*.

The module exists because a measurement instrument is the easiest thing in a codebase to get wrong
in a way nobody notices: a lifetime average that reports an idle editor as busy, a resident-set
reading mistaken for retained memory, or a monitor that becomes the load it was installed to find.

Invariants are unnumbered — the name is the identifier, matched byte-for-byte by `// invariant:`
annotations. Chosen invariants stand on reality invariants, never the reverse.

## Reality-based invariants

### A runtime reading is a delta over a named window

**Invariant:** If a processor-time or memory figure describes rate of use, then it is the difference
between two samples divided by the interval between them, and the pane names that interval — never a
lifetime total divided by process age.

**Scope:** Every processor figure derived from cumulative counters for the Invar process or a
registered child process. `RuntimeSample` owns the delta calculation; `ProcessSampler` supplies a
timestamped cumulative counter through the platform adapter; `MonitoringStats` applies the same
calculation to registered language-server processes. Absolute counts (resident set, retained bytes,
tab counts) are outside this rule; they are instantaneous by nature.

**Renegotiable at:** the operating-system accounting model. This changes only if a platform starts
publishing an instantaneous rate instead of a monotonic total.

**Mechanism:** The operating system publishes a MONOTONIC TOTAL of consumed processor time, not a
rate. Any single reading therefore describes the whole process lifetime. A long-lived editor with an
expensive boot reads as permanently busy under `ps`-style lifetime accounting, and an editor that
started a busy loop five seconds ago reads as almost idle. Only a pair of readings can say what is
happening now.

**Generates:** `RuntimeSample.sample` and `sampleProcess` returning a monotonic clock stamp beside
the counter; `processorPercentBetween` taking two samples; the pane printing `delta over Ns`; the
model re-anchoring its previous sample when observation resumes, so a rate never spans a gap in
which nothing was measured.

**Evidence:** `src/modules/monitoring/RuntimeSample.ts`;
`src/modules/monitoring/RuntimeSample.test.ts` (half a core over one second, and a process whose
lifetime total is enormous but whose window is empty reading as idle);
`src/modules/monitoring/ProcessSampler.interface.ts`;
`src/modules/monitoring/MonitoringStats.ts` (`readLanguageServerRows`);
`src/modules/monitoring/MonitoringStats.test.ts` (the busy, idle, and gone fixture contract);
`src/modules/monitoring/MonitoringPaneRenderer.test.ts` (the painted window label).

**Impossible if true:** A processor percentage derived from one reading; a rate that spans a period
during which the monitor took no sample; a painted percentage with no stated window.

**Verification:** `bun test src/modules/monitoring/RuntimeSample.test.ts
src/modules/monitoring/MonitoringPaneRenderer.test.ts` and the reading arm of `bun
scripts/harness/smoke-monitoring-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

### A live heap figure is only true just after a collection

**Invariant:** If a figure claims to state how much memory the application RETAINS, then it was read
immediately after a full collection. A resident-set reading and a between-collection heap reading
both describe high-water marks, not retention, and the pane must not present either as retained
memory.

**Scope:** `RuntimeSample.census`, the memory rows of `MonitoringPaneRenderer`, and every retention
claim made from this module.

**Renegotiable at:** the runtime's collector. This changes only if JavaScriptCore begins publishing a
continuously accurate live-set figure.

**Mechanism:** JavaScriptCore refreshes its heap-size accounting at collection time, so
`process.memoryUsage().heapUsed` reports the live set as of the LAST collection and under-reports
until the next one. The resident set is what the process has claimed from the operating system,
which an allocator does not return promptly, so it stays near its high-water mark long after the
memory behind it is free. Measured on 2026-07-30: after opening and closing twenty of this
repository's largest source files, the resident set moved between 230 and 254 MB while the live heap
after a full collection moved only from 21.9 to 27.9 MB.

**Generates:** `census` collecting before it walks the heap; the census reading the resident set both
before and after so the gap is visible; the pane stating `heap-used moves at GC` until a census is
taken; the census being an explicit reader action rather than a cadence tick.

**Evidence:** `src/modules/monitoring/RuntimeSample.ts` (`census`);
`src/modules/monitoring/RuntimeSample.test.ts`;
`.invar/tasks/in-progress/402-invar-monitoring-plugin/402-file-open-memory-measurement.ts` (the
four-checkpoint driven measurement).

**Impossible if true:** A retained-memory claim made from a resident-set reading; a live-heap figure
published without a preceding collection; a pane that shows `heap-used` with no statement of when it
last moved.

**Verification:** `bun test src/modules/monitoring/RuntimeSample.test.ts` and the census arm of `bun
scripts/harness/smoke-monitoring-harness.ts`, which requires the resident set to exceed the retained
heap.

**Status:** provisional

**Last refined:** 2026-07-30

## Chosen invariants

### A missing process is gone not idle

**Invariant:** If the platform sampler cannot read a registered child process in the current sample,
then Monitoring reports that process as gone with no processor or resident-set figure, never as a
running process with zero use.

**Scope:** `ProcessSampler.sample`, `MonitoringStats.readLanguageServerRows`, and every registered
language-server row published through `MonitoringStats.languageServerRows`. A present process whose
cumulative processor counter did not advance remains running at zero percent.

**Mechanism:** `ProcessSampler.sample` returns `null` when the platform has no current reading.
`MonitoringStats.readLanguageServerRows` maps that absence to `state: 'gone'` with null figures and
omits the PID from `previousLanguageServerSamples`. If the PID becomes readable later, its first
sample starts a new delta window instead of spanning the absence.

**Generates:** The `gone` row state; nullable processor and resident-set figures; a fresh delta
window after a process becomes readable again.

**Rejected alternatives:** Treat a missing sample as zero use — this makes a dead server
indistinguishable from an idle live server and can preserve stale resource figures.

**Evidence:** `src/modules/monitoring/ProcessSampler.interface.ts` (`sample` returns a sample or
`null`); `src/modules/monitoring/MonitoringStats.ts` (`readLanguageServerRows`);
`src/modules/monitoring/MonitoringStats.test.ts` (`registered servers keep manager order while busy,
idle, and gone remain distinct`).

**Impossible if true:** A registered server with no current sample painted as running at zero
percent; a gone row carrying a resident-set figure; a new delta spanning a missing-sample interval.

**Verification:** `bun test src/modules/monitoring/MonitoringStats.test.ts -t "registered servers
keep manager order while busy, idle, and gone remain distinct"`

**Status:** provisional

**Last refined:** 2026-07-31

### The monitor names its own cost and pays it only when observed

**Invariant:** If the monitoring pane is not on screen, then it owns no timer, takes no sample, and
writes no log line. If it is on screen, then each cadence sample costs under five milliseconds, the
pane prints that measured cost, and the one expensive reading — the heap census — happens only on an
explicit reader action, never on a tick.

**Scope:** `MonitoringStats` clocks and logging, `RuntimeSample.census`, and the cost rows of
`MonitoringPaneRenderer`.

**Components:**
- *Hidden is free* — the observation watcher clears the sampling timer, so a hidden monitor is
  indistinguishable from an uninstalled one in timers, samples, and log lines.
- *The cheap reading is cheap* — one cadence sample reads counters only. Measured at 0.17 to 0.24
  milliseconds in the driven smoke, and gated under five.
- *The expensive reading is asked for* — a census stops the world, sweeps, and walks every live
  object. Measured at 19 to 31 milliseconds on a 200 MB heap. It runs from a command, never a timer.
- *The price is on screen* — the pane prints the measured sample cost and the measured census cost,
  so the reader never has to trust that the monitor is cheap.

**Mechanism:** Stands on *Cost tracks the actively observed set*. The pane's dock registration
supplies the observed signal; `MonitoringStats.startObservation` watches it and starts or clears the
one interval. `takeSample` brackets itself with the monotonic clock and publishes the difference.
The census is reached only through `monitoring.heapCensus`.

**Generates:** the observation watcher and its single timer; `samplingAtRest`; the measured
`sampleCostMilliseconds` and `costMilliseconds` rows; the `monitoring.heapCensus` command and its
`c` binding; logging that allocates and writes nothing while off.

**Rejected alternatives:** Sample the heap census on the cadence — a 19 to 31 millisecond stall
every second, which would make the monitor the heaviest plugin in the application it is measuring.
Keep sampling while hidden so the history stays continuous — this is exactly the defect the plugin
exists to find in other plugins, and a monitor exempt from its own rule teaches the wrong law.

**Evidence:** `src/modules/monitoring/MonitoringStats.ts` (`onObservationChanged`, `takeSample`,
`samplingAtRest`); `src/modules/monitoring/MonitoringStats.test.ts`;
`src/modules/monitoring/MonitoringPlugin.test.ts` (hidden, shown, hidden again);
`scripts/harness/smoke-monitoring-harness.ts` (the quiescence arm holds the sample count flat over a
three-second hidden window). Positive control 2026-07-30: forcing the observation watcher to keep
its timer made the smoke fail with `FAIL a never-opened monitor has no sampling clock and no
reading`.

**Impossible if true:** A hidden monitoring pane whose sample count advances; a log line written
while the pane is off screen; a cadence tick that runs a heap census; a painted cost figure that was
assumed rather than measured.

**Verification:** `bun test src/modules/monitoring/MonitoringStats.test.ts
src/modules/monitoring/MonitoringPlugin.test.ts` and the quiescence and cost arms of `bun
scripts/harness/smoke-monitoring-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

### Retained document bytes come from the buffer set

**Invariant:** If the monitor states how much memory open files hold, then every figure comes from
`OpenBufferSet.documentLedger` — the set that decides what is hydrated and what is released — and
the monitoring module walks no document, opens no file, and keeps no copy of a document between
samples.

**Scope:** `MonitoringStats.readDocumentRows`, `retainedDocumentBytes`, the ledger rows of
`MonitoringPaneRenderer`, and the plugin's `workspaceLedgers`.

**Components:**
- *One enumeration* — the buffer set answers what each tab retains; the monitor tags each row with
  its workspace and converts UTF-16 units to bytes, and does nothing else.
- *A cold tab retains nothing* — a dehydrated entry reports zero, because its document is gone.
- *The total follows the cache, not the tab count* — the retained total is the sum of what is
  hydrated, so twenty tabs over a two-document window report two documents' worth.

**Mechanism:** Stands on *Seams are drawn at the shared generator* and on the workspace record *N
open tabs do not cost N live documents*. The buffer set already owns hydration and eviction; a second
walker would answer a different question the moment the eviction rule changed. The same enumeration
is what the file-cache bounds audit needs, so it grows in one place.

**Generates:** `OpenBufferSet.documentLedger` and its `RetainedDocumentRow`; the monitor's
per-workspace tagging; the `monitoringRetainedDocumentBytes`, `monitoringHydratedDocumentCount`, and
`monitoringDehydratedDocumentCount` projections.

**Rejected alternatives:** Walk `Workspace` documents from the monitoring module — it would report
documents the buffer set has already released, and it would drift the moment the hydration budget
changes. Estimate bytes from file size on disk — a dehydrated tab would keep reporting a cost it no
longer has.

**Evidence:** `src/modules/workspace/OpenBufferSet.ts` (`documentLedger`);
`src/modules/workspace/OpenBufferSet.test.ts` (the ledger block);
`src/modules/monitoring/MonitoringStats.test.ts`; `scripts/harness/smoke-monitoring-harness.ts`
(a 40-line file and a 40,000-line file, then every tab closed). Positive control 2026-07-30:
replacing the retained length with a constant made the smoke fail with `FAIL the large document
dominates the ledger (4000 bytes against 2000)`.

**Impossible if true:** A document walk inside `src/modules/monitoring/`; a retained figure for a tab
the buffer set has dehydrated; a ledger total that grows with tab count while the hydration budget
stays fixed.

**Verification:** `grep -rn "readFileSync\|openFile\|\.lines" src/modules/monitoring/*.ts | grep -v
test` names no document reader; `bun test src/modules/workspace/OpenBufferSet.test.ts
src/modules/monitoring/MonitoringStats.test.ts` and the ledger arm of `bun
scripts/harness/smoke-monitoring-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

### The monitor excludes itself from its own verdict

**Invariant:** If the monitor names a plugin as the heaviest render-load suspect, then that plugin is
not the monitor. The monitor's own render load is never hidden: it stays in the painted ledger and
its own sample cost is printed every paint.

**Scope:** `MonitoringStats.strayCandidate`, `ownRenderRequestsSinceOpen`, and the
`monitoringStrayCandidate` projection.

**Mechanism:** The monitor repaints once per cadence tick while it is open, so it is always among the
most frequent requesters in exactly the window a reader is looking at. Left in the verdict it would
top its own suspect list on every session and hide the plugin the reader came to find. Excluding it
from the VERDICT while keeping it in the LEDGER is the honest split: the reader still sees the cost,
but the answer to "which plugin is stray" is about someone else.

**Generates:** the identifier filter in `strayCandidate`; the separate `ownRenderRequestsSinceOpen`
figure; the smoke's requirement that the suspect is neither the monitor nor the host.

**Rejected alternatives:** Suppress the monitor's rows entirely — the reader could no longer see
what the monitor costs, and the pane would be claiming to be free. Leave the monitor in the verdict —
the lens then only ever finds itself.

**Evidence:** `src/modules/monitoring/MonitoringStats.ts` (`strayCandidate`);
`src/modules/monitoring/MonitoringStats.test.ts`; `scripts/harness/smoke-monitoring-harness.ts`
(the suspect arm, driven by a Tasks Dashboard lens change).

**Impossible if true:** `monitoringStrayCandidate` naming the monitoring plugin; a monitor whose own
render requests appear nowhere on screen.

**Verification:** `bun test src/modules/monitoring/MonitoringStats.test.ts` and the render-load arm
of `bun scripts/harness/smoke-monitoring-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30

### The monitor is a pane content citizen

**Invariant:** If Invar Monitoring is installed, then it is an ordinary contribution: one dock pane
content (`monitoring`), its keybindings, its commands, its contributed settings, and its status
projection, registered through the same `ApplicationContributionContext` seams every citizen uses.
Disabling it stops the sampling clock and withdraws all of it; a reinstall rebuilds all of it from
the same context, retaining nothing between lives.

**Scope:** `MonitoringPlugin`, `MonitoringPaneContent`, and their registration through
`DefaultPlugins`. Install, uninstall, and reinstall of the Invar Monitoring extension.

**Components:**
- *A cells citizen* — the pane returns a `StyledText` from `render`; it owns no renderable and
  declares no native surface.
- *Monitoring is application scope, not workspace scope* — the plugin registers no workspace
  contributor, because processor time, resident set, and heap belong to the PROCESS. Per-workspace
  models would report the same process several times over. The document ledger names each row's
  workspace instead.
- *Withdrawal is total* — `disposeApplication` disposes the stats model with its timer, the commands,
  and the status projection; the host unregisters the pane, keybindings, and settings scoped to the
  activation.
- *The projection is absent, not stale* — with the plugin uninstalled, no `monitoring*` status key
  survives.

**Mechanism:** Stands on *Plugin boundaries grant one authority* and *The host canvas is complete
without plugins*. The plugin holds every registration's disposer and calls them in
`disposeApplication`; `ApplicationContributions` reverses the host-scoped registrations.

**Generates:** the manifest entry in `DefaultPlugins`; the Extensions toggle; the dock-side setting;
the `monitoring*` status keys.

**Rejected alternatives:** A host-mounted monitoring view — it would re-couple the host to a plugin
domain, and a monitor that cannot be disabled cannot prove that disabling it costs nothing. A
workspace contributor per open project — several models measuring one process.

**Evidence:** `src/modules/monitoring/MonitoringPlugin.ts`;
`src/modules/monitoring/MonitoringPaneContent.ts`; `src/modules/plugins/DefaultPlugins.ts`;
`src/modules/monitoring/MonitoringPlugin.test.ts` (the uninstall and reinstall cases);
`scripts/harness/smoke-monitoring-harness.ts`.

**Impossible if true:** A production file in `src/modules/ui`, `src/modules/app`, or
`src/modules/workspace` naming the monitoring module; a disabled monitor leaving a pane, binding,
command, setting, timer, or status key behind; a reinstall that cannot rebuild the pane.

**Verification:** `grep -rln "modules/monitoring/" --include='*.ts' src/modules/app
src/modules/workspace src/modules/ui | grep -v '\.test\.'` prints nothing; `bun test
src/modules/monitoring/MonitoringPlugin.test.ts`; and `bun
scripts/harness/smoke-monitoring-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-30
