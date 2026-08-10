# READY — macOS support v2: boot fixed on current main (re-applied port)

> **Branch review artifact** for the conductor on `macos-port-v2`. Per the landing checklist
> ("no tracked TASK/READY files on main"), **strip before landing**; the branch keeps it via
> `finished/<branch>`. Supersedes the never-landed `macos-openpty-port` branch (its content is
> re-applied here onto current main; propose tagging the old branch `orphaned/macos-openpty-port`).

**Branch:** `macos-port-v2` (off main @ `66815c3c`)

## In plain words

On a Mac the app died the moment it started, before drawing anything. The upgrades made every
startup launch a Claude task terminal, and the terminal's low-level PTY code only works on Linux.
This branch gives macOS its own PTY backend (Bun's built-in one), selected only on Macs. Linux
code paths are untouched.

## What broke (worse than before)

The old failure was "crash when opening the terminal panel." The upgrades added
`runOnFolderOpen: true` built-in task (`TaskConfiguration.ts:67` — the `Claude` task), launched
synchronously inside `Bootstrap.boot` → `paneRuntimes.createPane('terminal')` →
`TerminalFactory.createBackend` → `OpenPtyBackend` → `OpenPty` (now `src/modules/system/OpenPty.ts`)
→ `dlopen('libc.so.6')` → throw → `AppLoader.handleFatal` → **exit 1 before first paint**.
Restored terminal/agent panes from persisted workspace state hit the same wall (one attempt per
saved pane).

Root cause unchanged from the July finding: `bun:ffi` (1.3.14) cannot pass variadic arguments
(`fcntl`, `ioctl`) on darwin arm64 — `fcntl` silently drops `O_NONBLOCK`, `ioctl(TIOCSWINSZ)`
segfaults. Constant-swapping cannot fix it; the FFI allocator is structurally impossible on macOS.

## The fix (identical shape to the reviewed v1; OpenPty untouched)

- `src/modules/terminal/BunTerminalBackend.ts` (new) — `TerminalBackend` over Bun's native PTY
  (`Bun.Terminal`): no FFI; byte-accurate write queue + `drain` preserves non-blocking large
  writes; mirrors `OpenPtyBackend`'s launch policy (rcfile prompt, `-lc` command form, env).
- `src/modules/terminal/TerminalFactory.ts` — `createBackend` selects `BunTerminalBackend` on
  darwin; `OpenPtyBackend` everywhere else.
- `src/modules/terminal/BunTerminalBackend.test.ts` (new, cross-platform) — drives the native
  PTY: size applied, output streamed, writes forwarded, clean exit.
- `src/modules/terminal/terminal.invariants.md` — "One openpty allocator serves both PTY roles"
  refined: one allocator per platform, still exactly one FFI implementation. **For the review
  team to ratify.**
- `scripts/install.sh` (restored from v1), README platform/install/troubleshooting rewrite
  (macOS+Linux supported, Windows not yet), `project.build.md` `dist/invar`→`dist/iv` re-fix.

## Verification (driven on macOS, Bun 1.3.14 arm64)

- Boot from source AND the compiled `dist/iv`: alt-screen entered, no crash, UI painted.
- `Ctrl+J` opened the terminal; `echo …` rendered prompt + output in the pane (both runs).
- `Ctrl+Q` raises the quit-confirmation dialog (new since v1) — dialog text observed.
- `bun test src/modules/terminal/` → 331/332 pass. The 1 red is `OpenPtyBackend.test.ts`
  (constructs the real FFI allocator — the macOS-impossible path itself; pre-existing, expected
  red on macOS, green on the Linux gate).
- `tsc --noEmit` clean. Invariants checker `--all --refs`: **19 problems, identical to clean
  main baseline** (all pre-existing charset notes in other modules; my diff adds zero).
- Full merge gate must run on Linux (harness is macOS-blocked, unchanged).

## iv ssh on macOS — FIXED in round 2 (same branch)

The PTY logic was extracted to `src/modules/system/NativeTerminalPty.ts` (sibling of `OpenPty`,
same decomposition: allocator in system/, consumers compose). `BunTerminalBackend` now composes it;
`SshClient.runSessions` platform-branches into `spawnNativeInteractive` (native PTY owns the child
via the `terminal` spawn option, still through `Processes.Class.spawn` — the launch-policy seam
already forwards `terminal`) vs the untouched Linux `spawnOpenPtyInteractive` (slave fd +
`setsid --ctty`). No write-queue duplication: one queue, in the allocator.

Verified: driven test in `SshClient.test.ts` exercises `spawnNativeInteractive` with a local
stand-in child — geometry reaches the child (stty size = 30 100), writes round-trip, clean exit —
and the test survived a positive control (planted write no-op made it red; removing the plant made
it green). `NativeTerminalPty.test.ts` drives the allocator directly (3 pass). The full app was
re-driven after the refactor (boots; terminal pane renders shell output). NOT verified: a real
`ssh` connection end-to-end — sshd on this Mac rejects loopback auth, and enabling a key is the
user's security call. The ssh master/channel code is unchanged and portable; the residual risk is
confined to real-ssh interaction with the native PTY (e.g. -tt allocation semantics). One
one-minute check from the user against a real Linux host closes it.

## Bycatch

- **Reported — 2 pre-existing channel test reds on macOS (NOT mine, verified on clean main):**
  `ChannelClient.test.ts` ("Invalid channel session socket path") and
  `ChannelDropNotification.test.ts` (dropzone path assertion) fail identically on unmodified main
  on darwin — Linux-shaped path assumptions in the tests. Green on the Linux gate presumably;
  needs a small portability task.
- **Reported — monitoring pane empty on macOS:** `LinuxProcessSampler.ts:42` reads `/proc`,
  degrades cleanly to null samples. A darwin sampler (`ps`-based) would close it.
- **Reported — doc drift:** `project.build.md` said `dist/invar` 5× (build outputs `dist/iv`).
  FIXED in this branch (rides the docs commit).
- Dev-tooling Linux-isms from the v1 report still stand (harness FFI, `/proc` scripts,
  `mapfile`, `timeout(1)`); unchanged, un-triaged.

## Not done / decisions for the conductor

- Real-ssh end-to-end confirmation of the darwin `iv ssh` path (needs a reachable Linux host —
  one user run; see round 2 above).
- Darwin process sampler for the monitoring pane + the 2 channel test portability reds: file as tasks.
- Old `macos-openpty-port` branch: superseded — tag `orphaned/` per lifecycle.
- Invariant refinement ratification (record now names `NativeTerminalPty` and covers `SshClient`).
