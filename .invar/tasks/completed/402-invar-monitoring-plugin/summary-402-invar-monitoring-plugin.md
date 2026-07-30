# Summary #402 — Invar Monitoring plugin

Landed dae7fba9 (branch c772fbdd), 57m, opus, single round. Shipped the
observability plugin exactly per spec, plus the answer to the user's
memory question: 206->263MB is allocator high-water RSS, NOT the file
cache (max 2 hydrated docs, 105kB across 20 tabs, zero after close;
live heap moved ~6MB while RSS rose 20MB during tab CLOSING). #403's
scope shrinks accordingly: the cache is already bounded — the audit
should verify and record that, not build eviction.

Design decisions accepted at landing: app-scope (not per-workspace) with
workspace-tagged ledger rows; render load counted by the HOST at the
contribution boundary; monitor excludes itself from its own verdict
only. Bycatch converted: #405-407. Archive repaired by hand (claude-lane
session-link gap — third occurrence; consider fixing dispatch to write
the link for claude lanes).
