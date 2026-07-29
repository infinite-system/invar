# 194 — reserved-chord's Quick Open timeout

State: COMPLETED — d3721b2
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

A genuine intermittent — **the 4th gate sighting**, and it failed in the MAIN checkout after 8/8 green
elsewhere. Four sightings and three investigations had failed to explain it.

### The cause, and it was not timing

**A builder's environment is not the conductor's.**

Codex bundles its own ripgrep at
`~/.codex/packages/standalone/releases/*/codex-path/rg`, **which its spawned app inherits.** The
conductor's shell has `rg` only as a Claude Code shell FUNCTION, which no child process can inherit.

So Quick Open's ripgrep path existed for a codex-launched app and did not exist for a conductor-launched
one — the same smoke, the same tree, two different capability sets. Every timing hypothesis was chasing
a variable that was not moving.

### The two generalisations

1. **Before reaching for timing, ask what EXTERNAL TOOL or inherited environment each flaky smoke
   depends on.** This became the central instruction in the flake-population brief an hour later.
2. **A cross-check against a builder's numbers is NOT a replication unless the environments were
   compared.** Two green runs from two environments are two claims, not one confirmation.

### The bycatch that mattered more than the fix

**Codex's extra tooling was CONCEALING a real user-facing defect** — Quick Open silently finding nothing
in a non-git folder, which became **#201**, and which the user's own 500k workspace would have hit.

### The repair, deliberately narrow

Smoke-only: `git init` on the disposable workspace so Quick Open's declared git fallback actually
exists, plus the compound wait split into two named conditions with the failure naming its missing
dependency. **`QuickOpen.ts` untouched — #201 stays scoped.**

**And the detail that makes the verification worth something:** the 10/10 runs were taken with codex's
`rg` **removed from `PATH`**, so they exercise the git fallback rather than the already-green ripgrep
arm.

## Sources

- [brief-194-1-reserved-chord-fixture-self-contained.md](brief-194-1-reserved-chord-fixture-self-contained.md)
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
