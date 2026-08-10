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

## Bycatch

- **Reported, NOT fixed — `iv ssh <host>` broken FROM a macOS client:** `SshClient.ts:156`
  constructs `OpenPty` directly, bypassing `TerminalFactory`. Fix path: same platform branch,
  but `Bun.Terminal` must own the interactive spawn (today it goes through
  `Processes.Class.spawn` onto the slave fd — a launch-policy seam decision), and I cannot
  drive-verify an ssh session from this machine. Needs its own task.
- **Reported — monitoring pane empty on macOS:** `LinuxProcessSampler.ts:42` reads `/proc`,
  degrades cleanly to null samples. A darwin sampler (`ps`-based) would close it.
- **Reported — doc drift:** `project.build.md` said `dist/invar` 5× (build outputs `dist/iv`).
  FIXED in this branch (rides the docs commit).
- Dev-tooling Linux-isms from the v1 report still stand (harness FFI, `/proc` scripts,
  `mapfile`, `timeout(1)`); unchanged, un-triaged.

## Not done / decisions for the conductor

- `iv ssh` macOS port + darwin process sampler: file as tasks.
- Old `macos-openpty-port` branch: superseded — tag `orphaned/` per lifecycle.
- Invariant refinement ratification.
