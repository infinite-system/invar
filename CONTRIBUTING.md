# Contributing to Invar

Invar is built by humans directing AI agents under mechanical law. Contributions work the same
way: you (and your agent) build against the repo's recorded invariants, verify by driving the
real user path, and submit evidence — not vibes. This file is the human-facing door; your agent
should read `AGENTS.md` (the law it must follow) and `project.conventions.md` (the code grammar).

## The evidence-first bar

A pull request is **reviewable** when it arrives with:

1. **A contract.** The invariant record(s) your change satisfies or adds — colocated in the
   module's `*.invariants.md` (schema-checked by
   `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`). If your change
   is a refactor, its contract is *zero behavior change* — say so explicitly.
2. **A driving smoke.** Verification that drives the real user path — a PTY harness smoke
   (`scripts/harness/`) or tmux smoke (`scripts/`) that reproduces the problem red and proves
   your change green. Unit tests are welcome; they do not substitute for driving.
3. **A green gate transcript.** `bash scripts/merge-gate.sh` output from your
   clone, attached to the PR. The gate travels with the repo — your machine
   proves the same blocking contracts ours does. Run
   `bash scripts/perf-baselines.sh` separately when a change affects memory,
   idle CPU, lifecycle, startup, or input-path cost.

PRs without these are not reviewed for merge — not as gatekeeping theater, but because the
review model is *maintainers adjudicate invariants, not line counts*. The evidence IS the
review; what remains is the design conversation.

## Working in the repo

- **Build/run:** Bun. `bun install`, then `bun src/main.ts <folder>` runs the editor on a
  workspace. Rebuild is fast enough to be an inner loop.
- **Conventions are gated, not suggested.** `bash scripts/conventions-gate.sh` must pass:
  namespace pattern, full descriptive identifier names (no abbreviations), file grammar
  (eponymous class first; types below; no detached module-level helpers — extension points are
  `protected`, never `private`).
- **Commits in your branch:** the pre-commit hook runs the full merge-gate inline; use
  `SKIP_GATE=1 git commit` for work-in-progress commits and run the gate deliberately.
- **Provenance decides main.** Invented experiments live on `experiment-*` branches until
  adopted. In this repo, branches are never deleted — finished work is tagged
  `finished/<branch>`, unlanded work `orphaned/<branch>`.

## Working with your agent

Point your agent at `AGENTS.md` before it writes anything — the repo is designed so a cold
agent primed with the recorded law ships correct code. That claim is measured, not aspirational;
your agent inherits the same physics: it cannot merge vibes, because the gate came in the box.

## Language packs (forthcoming shape)

Language support is the contribution we most want scaled. A language pack is bounded and
verifiable by construction: LSP server wiring (one JSON-RPC seam), line-local tokenizer rules
for the highlighter, the parameterized styling smoke matrix (wrap × horizontal-scroll ×
find-boundary × doc-blocks), and the colocated contract. A scaffolding skill that generates the
pack skeleton is planned; until then, `src/modules/syntax/` plus `scripts/smoke-comment-styling.sh`
and its harness twin are the reference shape.

## The short version

Clone the capsule. Build with your agent under the law. Drive the real path. Attach the
evidence. The gate — yours and ours — does the rest.
