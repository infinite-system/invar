# Task 412 — Monitoring plugin: LSP CPU profile rows (any server, not just tsgo)

Priority: user-directed
State: IN-PROGRESS
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## User request (2026-07-30 ~18:2x, verbatim)

> monitor should include LSP cpu profile, and not just for tsgo, any
> potential one as well, possible?

## Context

The Invar Monitoring plugin (landed dae7fba9, #402) shows per-plugin
re-render load and memory but no child-process CPU. Today's diagnosis
(#393 evidence addendum, afca31c6) needed a hand-rolled jiffies delta
to prove tsgo idled at 0% while iv burned 42% — the monitor should
answer that question itself.

## Design direction

- Seam: the LSP manager is the single spawn path for every language
  server (the #381 discovery fix hardened this). It knows each child
  pid at launch. The monitor subscribes to that registry — it never
  greps the process table by name (vocabulary matching is the
  never-search-to-kill family; pids from the owner are structural).
- Measurement: per tick, delta-sample utime+stime from
  /proc/<pid>/stat over the window (CLK_TCK scaled). NEVER ps %cpu
  (lifetime average — the 8% phantom). Also read RSS.
- Rows: server name, pid, CPU% over window, RSS. A dead server reads
  as GONE, not 0% — different facts, both shown.
- Generic by construction: any registered server appears; tsgo is just
  the first tenant.
- Portability: /proc is Linux. Keep the sampler behind an interface so
  a ps-based macOS sampler can slot in later; Linux ships first.
- Follow-on (NOT this scope, record only): the same child sampler can
  cover terminal/agent PTY children — would have separated today's
  tmux-streaming vs heartbeat confusion instantly.

## End state

Monitoring view shows a live LSP section with per-server CPU%/RSS
delta-sampled rows; a fixture-driven contract proves a busy child rises
and an idle child reads ~0 (both arms); real-app drive confirms tsgo
appears and idles near 0.
