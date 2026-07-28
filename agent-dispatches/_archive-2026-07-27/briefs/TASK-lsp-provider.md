# TASK — #114 Wave A: extract LSP as a PROVIDER plugin

Work ONLY in `/tmp/conductor-lsp` (branch `feat-lsp-provider`, cut off `bf57bcf`).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to `/tmp/lsp-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST — a fresh worktree has no
`node_modules` and every preflight will fail on unresolved imports until you do.

## Where this sits

The modularity capstone (#114) has three waves; this is Wave A, the one with NO product decision in
it. The substrate is already finished and this is remaining work, not design:

- `#85` generalized the workspace plugin subscription with install/uninstall
- `#96` made `Workspace` a pure container
- `#100` gave plugins one manifest that contributes their own settings and keybindings
- `#103` named the three plugin kinds: **contributors** add surfaces, **providers** answer questions,
  **runtimes** own processes

LSP is a **provider**: it answers questions (completions, diagnostics, definitions, hover). `#61`
already built the `LanguageProvider` port that completions flow through, so the port exists — what
remains is that the HOST still names the module directly.

## Measured starting point — verify, do not trust

As of `bf57bcf`, `src/modules/{app,workspace,ui}` reference `modules/lsp/` in **4 files**. Find them,
list them in your report with what each one wants, and remove the coupling. The measurement command:

    grep -rln "modules/lsp/" --include='*.ts' src/modules/app src/modules/workspace src/modules/ui | grep -v '\\.test\\.'

For contrast, `modules/agent/` is referenced by ZERO host files — that is what "extracted" looks like.

## The shape to reach

The host must not know LSP exists. It knows there is a registry of providers; LSP registers itself
as one, contributes its own settings and keybindings through the manifest, and answers through the
port. A consumer asks the REGISTRY for a capability, not the LSP module for a function.

**Do not invent a new plugin kind, a new registry, or a second manifest format.** If the existing
contributor/provider/runtime machinery cannot express something LSP needs, that gap is the finding —
report it rather than working around it with a special case. A special case here would silently
undo `#103`.

## Acceptance

- the 4 host references are gone, proven by the grep above returning nothing (quote it);
- LSP registers as a provider through the existing manifest — no new registry, no new kind;
- every LSP-backed behaviour still works, verified BY DRIVING the real path in a PTY, not by unit
  tests alone: completion popup opens and accepts, diagnostics appear, go-to-definition navigates,
  hover renders. `bun run drive` is the on-ramp;
- **a positive control**: disable/uninstall the LSP plugin and show those behaviours degrade
  cleanly — a legible empty state, never a crash and never a silent nothing. If the plugin cannot be
  disabled, say so, because then it is not really a plugin yet;
- `src/modules/lsp/lsp.invariants.md` updated to state the provider relationship;
- report the host-reference count before and after, and name anything you could NOT decouple with the
  reason.

## Repo law you will trip over otherwise

- `export let Class = $Class` — the `Class` slot is swappable and must never be `const`.
- The `Static()` wrapper lives at the `$Class` ANCHOR: `export const $Class = Static($Raw); export
  let Class = $Class`. Never `Class = Static($Class)` — that leaves the anchor unwrapped and
  `extends X.$Class` would inherit uncached `$`-getters. `Reactive()` is the exception: it mutates in
  place, so `Class = Reactive($Class)` with a raw `$Class` is correct.
- conventions-gate rules 1.8/1.9/1.95 enforce all three across `src` AND `scripts`.
- Invariant records live at `src/modules/<domain>/<domain>.invariants.md`, never the repo root, and
  are cited by ROOT-RELATIVE path — a bare filename silently orphans the annotation.
- Full descriptive identifier names, no abbreviations. 80 columns.

## Method — Rule Zero

Drive the real app first to see the behaviours working, then extract, then drive again. Write
contracts AFTER the extraction holds. One instrument at a time; never the whole suite in the inner
loop.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (must stay at or above
884 annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.

## Note on the tree you are cutting from

`bf57bcf` currently has ONE known red: `measure-scroll-smoothness` times out at the 900 ms glide
easing (task #158, another builder is on it). It is unrelated to LSP. If you see that specific
failure, it is not yours — do not chase it and do not change the easing value.
