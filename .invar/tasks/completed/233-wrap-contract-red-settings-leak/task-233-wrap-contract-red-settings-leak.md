# 233 — wrap-mode contract red: the user's real settings leak into the harness

State: COMPLETED — 3a1172c0 — harness-only: isolated per-run HOME/XDG, pinned geometry, settle race fixed; settings exonerated by hash
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: verification-integrity

## Outline

`behavioral-contracts` fails deterministically at *wrap-mode capped at logical
lines* with `scrollTop=151` (expected > 200 visual rows) — identical number on
the #220 integration tree AND plain main, solo, quiet machine (load 0.69).
It was GREEN in the #216+#219 batch gate ~40 minutes earlier, and no
product-touching commit landed between.

Evidence chain:
- `/tmp/gate-integrate-220-r2.log`, `/tmp/bc-220-solo.log`,
  `/tmp/bc-main-control.log` — the three reds, same exact 151.
- `~/.config/invar/settings.json` mtime **01:29:36** — inside the green-to-red
  window — and it carries `"wordWrap": false`. The USER'S REAL config.
- An isolated-HOME run is the decisive arm (in flight at filing time,
  `/tmp/bc-isolated-r2.log`); green there convicts the leak.

Ranked candidates:
1. **Settings leak (strong).** The wrap contract assumes wrap on; the harness
   reads the real `~/.config/invar/settings.json`, where `wordWrap: false`
   now sits. The per-run-HOME lesson exists for smokes that MUTATE settings;
   behavioral-contracts and the drive path apparently do not isolate READS
   either. Fix: hermetic HOME/XDG for every contract and drive run — defaults
   first is doctrine, and a contract that reads user config is not measuring
   defaults.
2. **The writer.** Something wrote the user's real settings file at 01:29 —
   likely a harness or drive run without isolation (a #220 smoke drive was
   active then). Find the writer with both polarities: which code path
   persists settings, and why it ran against the real HOME. Do NOT edit the
   user's settings file — whether `wordWrap: false` is their preference or
   pollution is theirs to say; the instrument must stop caring.
3. Fixture drift (weak — the exact-151 twice pattern fits a setting, not
   noise).

Positive controls: plant `wordWrap: false` in an isolated config and require
the contract to red; remove it and require green. The writer fix needs the
inverse arm: a harness run must leave the real settings file byte-identical.

## Invariants in scope

- The wrap/scroll records in `src/modules/editor/` and `scroll.invariants.md`
  that the wrap-mode contract cites — read which one asserts visual-row
  scrolling, and whether it states the DEFAULTS assumption anywhere.
- `project.conventions.md` defaults-first doctrine.

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- This session's classification run (three logs above).
- `feedback-smoke-isolate-persisted-home` lesson (per-run mktemp HOME).

### Isolated-arm result (filed after)

The first isolated-HOME run FAILS DIFFERENTLY: `scrollTop=` EMPTY (not 151) —
the probe published nothing under the bare mktemp HOME, so the arm broke the
instrument instead of deciding the question (`/tmp/bc-isolated-r2.log`). The
151 mechanism still fits wordWrap:false; the decisive isolated arm must build
a complete hermetic environment (config + data + whatever first-run write the
app needs), and the empty-value mode is itself evidence for how the contract
reads settings. Both modes need explaining, not just the first.
