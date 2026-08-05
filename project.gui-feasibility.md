# GUI feasibility note — the Bun-coupling census (2026-08-04)

Context: the user's Electron/Tauri conversation (2026-08-04 morning).
The claim to verify: "Bun vs Node is a kernel selection, not a fork."
This census measures the actual porting bill. Read-only analysis; no
decision is made here — the experiment and any build wait on the
user's word.

## The number

TWELVE non-test files in src/ touch Bun-specific APIs. Everything
else — the ivue class graph, panels, editor, workspaces, plugins,
keybindings, themes — is engine-neutral TypeScript.

## The sites, by porting difficulty

HARD (the two real ports):
- terminal/OpenPty.ts + OpenPtyBackend.ts — bun:ffi openpty +
  readiness-driven TTY reads (#458). Node twin: node-pty (VS Code's
  own) or koffi FFI. The readiness-read invariant must re-verify.
- database/SqliteDatabaseConnection.ts — bun:sqlite. Node twin:
  node:sqlite (22+) or better-sqlite3. Interface is already a
  connection seam.

MEDIUM (subprocess family — 20 sites, one shape):
- system/Processes.ts is the shared generator; the others
  (TypeScriptProvider, CodexRewriteProvider, FfmpegVideoSource,
  SystemTtsBackend, AgentProviderRegistry, LinuxProcessSampler,
  TaskConfiguration jsonc, NetworkAdmission) use Bun.spawn/which
  through or beside it. Node twin: child_process + which — mostly
  mechanical because the capability classes are Static() slots
  DESIGNED for kernel swapping.

TRIVIAL: Bun.sleep (1), Bun.Transpiler (1 — check consumer),
Bun.JSONC (1 — parse swap).

## What this buys the decision

- The "single-runtime Electron" shape (model in renderer, Node
  capability twins in main) is REAL: the port surface is 12 files,
  2 hard + 1 subprocess sweep.
- The Bun-sidecar shape needs ZERO ports and works under either
  shell — the incremental path stands.

## Open (awaiting the user)

1. File the one-pane webview experiment (experiment-* branch)?
2. Electron vs Tauri preference after the experiment's numbers?
