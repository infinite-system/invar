# #402 — Invar Monitoring plugin: the app observes itself

State: IN-PROGRESS
Priority: user-directed
Engine: claude
Environment: linux
Model: opus-5
Effort: medium
Assignment note: design-heavy feature; opus slot free.

## The request (user, 2026-07-30, verbatim intent)

A plugin called "Invar Monitoring" that from the inside monitors itself
correctly — its own instance + others if needed; toggleable logging;
per-plugin re-render load; memory allocation/deallocation for files with
running stats (allocated for files, deallocated, waiting for garbage
collection). Motivation: memory rose 206->263 MB from file openings and
does not go down (suspect the tab-switch file cache persisting document
data). "What we are missing is easy way to monitor, even for agents, as
they develop, what is becoming a stray plugin."

## Shape (conductor)

1. A pane-content-citizen plugin, visible in the plugins section like
   Terminal/Database (the #356 direction), enable/disable like the rest.
2. CORRECT self-measurement: delta CPU sampling (jiffies over a window —
   never ps lifetime %cpu; see the #376 note), RSS + heap-used +
   heap-capacity (process.memoryUsage / bun:jsc heapStats) so cache
   retention is distinguishable from GC high-water.
3. Per-plugin re-render load: attribute render requests / paints to their
   owning plugin/pane; running counters; a logging toggle that writes a
   ring buffer or file when on, nothing when off (cost tracks the
   actively observed set — the monitor itself must be near-free when
   closed and must exclude or name its own load when open).
4. File memory ledger: bytes held per open document and by the tab-switch
   cache; totals allocated / released; what eviction would free.
5. Other instances (optional lens): reuse the #376 shape — delta-sampled
   CPU/MB for iv processes, IV_WHOAMI tag filter. SEAM RULE: one stats
   provider module; the CLI instances:watch tool (#376) and this plugin
   are two consumers of the same generator — do not fork the logic.
6. AGENT-READABLE: publish the same numbers through the status/projection
   seam so smokes and builder agents can assert on them (the #393
   cadence-timer count is the model). "Stray plugin" detection = a lens
   sorting plugins by render load and timer ownership.

First use case to answer in the report: WHERE the 206->263 sits — file
cache retention (how many bytes, evictable?) vs heap high-water.
