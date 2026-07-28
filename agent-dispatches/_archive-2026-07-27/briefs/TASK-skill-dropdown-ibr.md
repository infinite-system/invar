# TASK — Agent composer /skill dropdown + IBR parity across backends (#117)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-skilldrop`
(branch `feat-skill-dropdown-ibr`, forked from main). Do NOT run `scripts/merge-gate.sh`;
do NOT push/merge/tag/delete. Commit and report to `/tmp/skill-dropdown-READY.md`.
`bun install --frozen-lockfile` first.

## The user, verbatim

> "The skills list are preloaded now but in agent view typing /ivue doesn't bring up the dropdown /
> dropup like we planned, that's still missing, also for claude agent it has to load with IBR
> appended as a file prompt and for codex or when you switch to codex it has to load as the first
> prompt or pre-pended at the beginning of that context claude had when switching, so there is
> parity between claude and codex, understood?"

## Part 1 — the /skill popup in the agent composer

The skills list is already resolved (see the #67 work: SDK settingSources + slash-command
resolution in the agent module). Typing `/` at a word boundary in the composer, followed by a
prefix (`/iv`), must open a popup listing matching skills. Requirements:
- `BoundedListPopup` is the seam (caret-anchored popups exist for completion — reuse, do not fork).
- Opens UPWARD (dropup) when the composer is near the pane bottom — it is; verify against available
  rows rather than hardcoding direction.
- Filters as you type; Up/Down navigate (through the shared ScrollPhysics acceleration like every
  bounded list); Enter inserts the skill invocation into the composer; Escape dismisses and the
  `/prefix` text remains as typed. Ordinary typing continues filtering; any non-matching context
  (space before `/`? mid-word slash?) must NOT trigger it — only a `/` starting a token.
- Marks/glyphs from the theme vocabulary if any are used.

## Part 2 — claude backend loads IBR as an appended file prompt

Every claude session (CLI and SDK backends) must carry the repo IBR framework:
- CLI backend: `--append-system-prompt-file <workspaceRoot>/.claude/skills/ibr/IBR.md` (exactly the
  mechanism AGENTS.md prescribes). Resolve the path per WORKSPACE; if the file does not exist in
  this workspace, skip silently (not every repo has IBR) and record the decision in the session
  state so parity logic knows.
- SDK backend: the equivalent append-system-prompt option.

## Part 3 — codex parity, including the SWITCH path

- A codex session (fresh) sends the IBR file content as the FIRST prompt, before any user message.
- SWITCHING an existing session claude → codex: the carried-over context that claude had must be
  PREPENDED with IBR at its beginning, so the codex continuation still rests on IBR.
- Invariant to record: *Every agent backend session begins from the IBR foundation* — no backend,
  and no switch order, yields a session without IBR at its start; Impossible-if-true: a codex
  continuation whose context lacks IBR at position zero while the workspace provides IBR.md.
- Dedupe guard: switching claude → codex → claude must not stack multiple IBR copies.

## Verification — exact exit codes

- Full checker suite.
- Driven smoke: type `/iv` in the composer → popup appears listing ivue → Down/Enter inserts;
  Escape path; non-trigger contexts stay quiet; dropup direction asserted from the grid.
- Backend spawn assertions (mock/spawn-arg capture): claude receives the append flag with the
  right path; codex first message begins with IBR content; the claude→codex switch carries
  IBR + prior transcript in order; the double-switch does not duplicate IBR.
- `idle-quiescence` green; three runs each; coverage declarations (counted grammar, APPEND).

## Rules

Full descriptive names, 80 columns, ivue conventions, `X.interface.ts`. Tab indents; the composer
already owns Shift+Tab (permission-mode cycle) — do not collide. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; clean tree; no TASK files.
