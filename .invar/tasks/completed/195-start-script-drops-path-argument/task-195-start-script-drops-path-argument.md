# 195 — `bun run start <path>` silently ignores the path

State: COMPLETED — fb199cb
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

The `start` wrapper accepted a positional path and **dropped it**, pinning `argv[2]` to `.`.

### How it was found — by handing the user a command that did not work

The user was given `bun run start <dir>` to open the scale fixtures and **could not find the files**.
The command had never been run from the directory the reader would run it from.

### The doctrine it produced

> **An instruction is an assertion.** Run it from the directory the reader will run it from before
> writing it down — including the ones too simple to fail. When a script PRINTS the instruction, its
> self-test must cover the printed output and not only the file it produced.

### The underlying trap, which is why it got its own number

**A wrapper that accepts an argument and ignores it is worse than one that rejects it.** A rejection is
a diagnosis; a silent drop leaves the caller believing something that is false. **That is the interface
form of a silent wait** — the same defect shape as a predicate that passes without observing anything.

### The proof, by driving

Before the fix the wrapper published `START_REQUESTED_ROOT=/tmp/…` alongside `START_ACTIVE_ROOT=.` —
**the request and the reality disagreeing in the app's own published status.** After: `start` no longer
hardcodes a positional `.`, so `AppLoader.rootArgument` receives a supplied path while no argument still
falls back to the current directory.

### Working note left for anyone driving the scale fixtures

Fixtures live at `tmp/invar-scale-test/` (gitignored, so they do not travel to worktrees; regenerate
with `scripts/make-scale-workspace.ts` and `scripts/make-nested-fold-fixture.ts`): `huge.ts` 500k,
`huge-1m.ts` 1M flat, `nested.json` 554,490 and `nested-1m.json` 970,356 lines with fold regions
spanning 33.8 blocks at level 0. `tsconfig.json` carries `"exclude": ["tmp"]` because **tsc walks the
FILESYSTEM, not git**, and would otherwise ingest them (~125,000 errors).

## Sources

None in this folder — no brief was written; the fix came out of the user's own failed command. Detail
above recovered from the session transcript (`faf7e858-…jsonl`).
