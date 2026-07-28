# READY — macOS support: integrated terminal on Bun's native PTY

> **Branch review artifact.** This file is a builder READY report for the conductor to review on the
> `macos-openpty-port` branch. Per the landing checklist ("no tracked TASK/READY files on main"),
> **strip it before landing** — do not merge it into `main`; the branch keeps it via `finished/<branch>`.

**Branch:** `macos-openpty-port` (off `main`)
**Commits:**
- `terminal: run the integrated terminal on Bun's native PTY on macOS`
- `docs+install: one-command cross-platform setup; fix stale dist/iv name`

State: tree clean, nothing pushed. 7 files changed, **no deletions** (verified via `merge-base`).

## What was wrong (not missing packages)
Dependencies install fine. Invar **aborted on boot on macOS**: opening a workspace eagerly creates the
integrated terminal (`launchFolderOpen → TaskLauncher → Bootstrap → TerminalFactory.create →
OpenPtyBackend → OpenPty`), and `OpenPty` allocates the PTY through `bun:ffi`. The two libc calls it
needs — `fcntl` (O_NONBLOCK) and `ioctl` (TIOCSWINSZ) — are **variadic**, and `bun:ffi` 1.3.14 cannot
pass variadic arguments on the **darwin arm64 ABI**: `fcntl` silently drops the flag (requested `0x6`,
observed `0x400002`) and `ioctl` **segfaults the process**. Swapping OpenPty's Linux ABI constants for
the macOS values is necessary but insufficient — the variadic calls underneath cannot execute at all.
(Proven empirically, then reverted.)

## The fix (OpenPty preserved)
Add `BunTerminalBackend` — a `TerminalBackend` implementation over Bun's **native** PTY
(`Bun.Terminal`): no FFI, no variadic calls; resize/write/data run in Bun's C++ layer. It sits behind
the existing backend swap seam exactly like `OpenPtyBackend`/`MockBackend`, with a byte-accurate write
queue + `drain` to preserve non-blocking large writes. `TerminalFactory.createBackend` selects it **on
darwin only**; **Linux keeps `OpenPtyBackend`/`OpenPty` and every test that depends on them,
untouched**.

Contract: refined "One openpty allocator serves both PTY roles" in
`src/modules/terminal/terminal.invariants.md` to make the platform axis explicit — one allocator per
platform, still exactly one FFI implementation (`OpenPty`). **This refinement is proposed for the
review team to ratify.**

## Files
- `src/modules/terminal/BunTerminalBackend.ts` (new)
- `src/modules/terminal/BunTerminalBackend.test.ts` (new, cross-platform — drives the native PTY)
- `src/modules/terminal/TerminalFactory.ts` (platform select)
- `src/modules/terminal/terminal.invariants.md` (invariant refinement)
- `scripts/install.sh` (new), `README.md`, `project.build.md`

## Verification (by driving, on macOS — Bun 1.3.14, arm64)
- **App boots**: alt-screen entered, file tree rendered, clean `Ctrl+Q` exit (code 0) — the exact path
  that crashed now works.
- **Terminal works in-app**: `Ctrl+J` opened the pane; `echo INVAR_MAC_OK` produced the real shell
  prompt (`one@ones-MacBook-Pro:…$`) and rendered the output in the pane.
- **`BunTerminalBackend.test.ts`** (2 pass): resize applied (the segfaulting op), output streamed,
  writes forwarded, exit 0.
- `tsc --noEmit` clean; `check_invariants.mjs --all --refs` → **0 problems**.
- **The full merge gate must run on Linux** — its smokes use the FFI PTY harness that this change
  documents as macOS-blocked (see Bycatch). The design leaves the Linux gate green: Linux path
  unchanged, new test cross-platform, contract refinement resolves clean.

## Bycatch
- **FIXED** (commit 2, `af8926d`): `project.build.md` referenced `dist/invar`; the build script
  outputs `dist/iv` (matches `package.json` and README). Rode as its own commit.
- **Reported, NOT fixed (out of scope) — dev tooling is Linux-only on macOS:**
  - The PTY **smoke/drive harness** (`scripts/harness/PtyTestDriver.ts`) still uses the FFI `OpenPty`,
    so `bun run drive` and every `scripts/smoke-*.sh` fail on macOS. **A macOS dev cannot run the merge
    gate locally.**
  - `/proc` usage: `scripts/merge-gate.sh`, `stop-merge-gate.sh`, `fleet-heartbeat.sh`,
    `drive-wrap-50k.sh`, `perf-baselines.sh`, `harness/smoke-terminal-backpressure-harness.ts`.
  - `scripts/check-map-coherence.sh` uses `mapfile` (fails on stock macOS bash 3.2).
  - `pgrep -P/-c`, `getconf CLK_TCK`, GNU `date -Is` across the perf/liveness scripts.
  - `timeout(1)` is absent on macOS (it's `gtimeout`) — scripts calling it fail.
- **Minor (not bugs):** config lands in `~/.config/invar` (XDG) not `~/Library`; job control
  (Ctrl+Z/fg/bg) absent in the mac terminal — the same tier-S caveat `OpenPtyBackend` already
  documents (no `setsid`/`login_tty`).

## Follow-up task (deferred by design — "app backend now, harness later")
**Port `PtyTestDriver` to `Bun.Terminal` on macOS** so the drive harness + smokes run on mac. Already
de-risked: `Bun.Terminal` hosting the real Invar app is proven (it's how this branch was
driven-verified). This closes the invariant's currently-unserved macOS harness role.

## Not done (needs a decision)
- No PR opened yet; no `finished/`/`orphaned` tag applied (builder does not land).
- The Linux-only dev-script bycatch above is un-triaged into tasks.
