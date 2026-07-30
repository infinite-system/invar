# #403 — the tab-switch file cache: bounded or unbounded?

State: ACTIVE
Priority: performance-behaviour
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low

## Origin

User observation 2026-07-30: RSS 206 -> 263 MB after opening files, not
returning. Audit the tab-switch document cache: what it retains per file,
whether it is bounded, what evicts entries (tab close? count cap? bytes
cap?), and whether closed-tab documents free their buffers. If unbounded,
propose the bound (bytes-capped LRU is the default shape) — do not
implement without the record. Distinguish cache retention from GC
high-water in any measurement (heap-used, not RSS alone). Coordinate with
#402 (monitoring plugin) — its file ledger wants the same enumeration;
seam at the shared generator.
