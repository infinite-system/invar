# Brief — #114 Wave B: the terminal becomes a hosted runtime (host references 4 → 0)

Read first, in order:
1. [.invar/tasks/active/114-modularity-umbrella-provider-runtime/task-114-modularity-umbrella-provider-runtime.md](task-114-modularity-umbrella-provider-runtime.md)
2. [brief-114-1-modularity-umbrella-provider-runtime.md](brief-114-1-modularity-umbrella-provider-runtime.md) in the same folder — Wave A's brief. ALL
   its conventions, ivue Static-manifest rules, anchor rules, invariant-record rules, and
   verification commands apply verbatim to this wave. Do not re-derive them; read them.
3. [report-114-modularity-umbrella-provider-runtime.md](report-114-modularity-umbrella-provider-runtime.md) — Wave A's result (LSP as provider,
   host references 4 → 0). Wave B repeats that shape for the terminal.

## The objective

`modules/terminal/` currently has 4 host references. After this wave: **0**, measured the same
mechanical way Wave A measured LSP (count host files that name the module). The terminal becomes a
RUNTIME — the third plugin kind (#103's taxonomy: contributors add surfaces, providers answer
questions, runtimes own processes). The host learns nothing about PTYs, shells, profiles, or
process lifetimes; it hosts a runtime that owns them.

Method, Rule Zero: drive the real app first (terminal open/close, staged execution, themed prompt,
live header cwd, panel split, wheel momentum — all landed behaviours that must survive), then
extract, then drive again. Contracts AFTER the extraction holds.

## The agent half — design constraint, not new surface

Agents are NOT a plugin. They arrive through a terminal profile: launch claude/codex (later any
CLI agent) in a PTY pane, `cwd` = workspace folder, context VERIFIED present (codex reads
[AGENTS.md](../../../../AGENTS.md); claude reads [CLAUDE.md](../../../../CLAUDE.md); IBR via `--append-system-prompt-file
[.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md)` for the claude lineage). Verification means checked, not assumed — the
silent-failure mode is a pane that launches without its context. Wave B's runtime seam must make
this profile expressible without the host knowing what an "agent" is.

## #46 designed alongside (design, not necessarily built)

`TerminalObserver: reverse presence` — design doc exists in the repo
(`.invar/tasks/active/46-terminal-observer-reverse-presence/`). Wave B's runtime seam is the
natural home for its presence channel. Deliverable: either fold the observer contract into the
runtime seam design (documented decision + interfaces), or a written finding that it belongs
elsewhere and why. Do not leave #46 unmentioned in the report.

## Sequencing

#122 (editor becomes the final contributor) is strictly AFTER this wave — do not touch
`modules/editor/` host references. #35 waits behind #122.

## Verification

Everything Wave A's brief lists, exact exit codes quoted, plus:
- the host-reference count for `modules/terminal/`: show the grep/count going 4 → 0;
- drive the terminal behaviours listed above before and after — name each one as PASS with the
  frame evidence, per verify-by-driving;
- NEW since Wave A: a prettier format gate is live — keep `bunx prettier --check .` clean; the
  pre-commit hook auto-formats staged files. 80 columns.

Do not run `scripts/merge-gate.sh`; commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
Report bycatch explicitly; write the report to [/tmp/114-wave-b-READY.md](../../../../../../../../../../../tmp/114-wave-b-READY.md) when done.
