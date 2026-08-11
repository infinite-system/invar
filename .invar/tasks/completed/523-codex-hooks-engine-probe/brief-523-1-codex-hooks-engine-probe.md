# Brief 523-1 — probe the codex hooks engine

## In plain words

Codex ships a hooks engine we do not use. A post_compact hook could
replace our usage-differencing compaction detection with a direct
signal. Probe it the way #517 probed notify: capture real payloads,
prove the hooks fire, and report whether it is worth adopting.

## The deliverable

A REPORT is the deliverable (this is an investigation, not a feature):
register each hook (pre_compact / post_compact / session_start /
session_end) in a SCRATCH codex session; capture real payload shapes;
force a compaction and prove pre/post_compact fire around it. If solid,
PROPOSE replacing #517's usage-collapse differencing with post_compact
and the opening task-file send with session_start — proposal, not
implementation. Keep #517's notify path untouched (it is the fallback).

## Evidence

#517 bycatch (completed): `codex features list` shows hooks stable
true; the binary carries hooks.json config with the four events and
Claude-style semantics; payload shape and registration path unverified.

## The bar

Scratch codex sessions only (echo backend / trivial prompts); never
touch a live builder's session; kills by cwd-resolved pid, never name
patterns. The payloads and fire-proof are the evidence — quote them.
If the hooks engine does NOT fire as documented on this version, that
is a valid and complete finding (report it, do not force it).

## Invariants in scope

None (fleet tooling investigation).

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
