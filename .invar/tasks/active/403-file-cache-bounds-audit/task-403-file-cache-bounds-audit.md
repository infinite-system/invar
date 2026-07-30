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

## Scope update after #402 landed (2026-07-30)

The #402 measurement ANSWERED the memory question: the cache is already
bounded (MAXIMUM_RECENTLY_ACTIVE_HYDRATED_DOCUMENTS=2; 105kB across 20
tabs; zero after close). The 206->263 is allocator high-water RSS. This
task shrinks to: verify the bound holds at scale (huge single files),
record it as an invariant in the buffer contract, and close.
