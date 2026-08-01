# Summary — #432 panel, editor actions, and instances overhaul

Landed 7d2cc879, 123m dispatch-to-landing, one round, no steers.

What happened: the first ui-task-skill brief — 21 driven-confirmed
items — landed whole. All items implemented as specified; five positive
controls were planted red on purpose; the builder found and fixed the
markdown preview action defects (wrap, go-to-line, go-to-bottom
targeted the source editor while preview showed) beyond the brief's
presence-only confirmation.

What the conductor got wrong: the landing chain, not the builder.
(1) My worktree-opener hotfix (68230d8a) shipped an annotation without
its contract record — gate round 1 caught it. (2) The same hotfix made
fleet scope always match the workspace, which flipped the smoke's
planted task from fallback 'building' to truthful 'exploring' — gate
round 2 caught that; fixed by planting a REAL worktree diff (3825fc27).
(3) The remaining red bisected to 417084fa (pre-existing, before the
branch): idle-work pricing broke dashboard auto-reveal — filed #433,
landed over it with a written override.

Bycatch converted: AGENTS.md ui-task skill index (fixed 130d004e);
tasks-dashboard smoke race (builder's own c5447952); three
non-reproducing one-retry flakes noted, no task.

Left undone: #433 (auto-reveal). User verification of the new panel
world in their real terminal is the outstanding veto.
