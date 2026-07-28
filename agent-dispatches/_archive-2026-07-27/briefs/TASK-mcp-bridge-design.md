# TASK — #157: DESIGN how external harnesses drive Invar over MCP

Work ONLY in `/tmp/conductor-mcpdesign` (branch `design-mcp-bridge`, cut off latest main).
**This is a DESIGN task. Produce a document. Do NOT implement the bridge.**
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/mcpdesign-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then `bun install`.

## The user's framing, verbatim intent (2026-07-27)

*"in-terminal claude/codex can be made to receive our mcp anyway, so they can still have full
control of invar from inside — that's what needs to be designed: how to seamlessly connect the
external harnesses claude/codex/pi/hermes to our mcp to control it."*

## Why this dissolves the old problem

The previous framing asked whether to rebuild agents inside Invar as plugins. The user's reduction
removes the question: **an external harness does not need to be inside Invar to control Invar — it
needs a channel.** MCP is that channel and all four harnesses already speak it. Invar does not
integrate agents; Invar EXPOSES ITSELF and lets any harness drive.

It also explains why the context-swap idea was dropped: if control flows over MCP, a harness's own
context limit (codex 250k vs claude 1M) is the harness's business. Invar stops needing them to be
equivalent.

## The seam is already located

`#156` (tasks capability, in flight on `feat-tasks-capability`) is how a harness is LAUNCHED, and
launching is the only moment you can hand a process a capability. That task is building an
env/args contribution point in its task launcher and leaving it unused, explicitly as your injection
point. **Read that branch's work before designing** — `git log --oneline feat-tasks-capability` and
its `tasks.invariants.md` — and design to the seam that actually exists rather than inventing one.

## Questions the design MUST answer

1. **Transport.** MCP over stdio assumes the CLIENT spawns the SERVER. Here it is inverted: Invar is
   already running and the harness is the one being spawned. So stdio is probably wrong and a unix
   domain socket (path per workspace) or HTTP-on-localhost is probably right. Settle this first — it
   constrains everything downstream. State the argument, not just the choice.
2. **Discovery.** How does the harness learn the endpoint? Candidates: an env var injected by the
   task launcher (`INVAR_MCP_ENDPOINT`); a generated per-workspace config file the launcher points
   the harness at (claude accepts `--mcp-config`); a well-known path under `.invar/`. Prefer whatever
   needs ZERO user action. **Name the exact flag or file for EACH of claude, codex, pi and hermes** —
   they do not configure MCP identically, and the whole point of naming four is that a design tested
   against one will encode that one's model as the abstraction.
3. **Instance identity.** Several Invar windows/workspaces may run at once. The endpoint must resolve
   to THE workspace the terminal belongs to, not whichever instance started last. This is the failure
   mode most likely to ship unnoticed and be maddening to debug.
4. **The tool surface — what may an external agent DO?** Read the buffer, navigate, open files, run a
   find, read diagnostics, edit, save, commit? **This is the one genuinely USER-OWNED decision.** An
   agent that can edit through MCP has the same power as one editing files directly, so the honest
   question is not safety-by-restriction but whether the surface should mirror the editor's own
   commands or be a smaller deliberate vocabulary. Bring a RECOMMENDATION with reasoning; do not
   choose alone.
5. **Attribution and consent.** If an external harness drives the editor, what does the user SEE? A
   silent remote edit is indistinguishable from a bug. Some visible attribution is probably
   load-bearing, and it interacts with the existing permission surface.
6. **Lifecycle.** Invar exits while the harness is mid-call; the harness dies mid-edit. Both are
   ordinary, not exceptional.

## Deliverable

A design document **in the repo** (not `/tmp`), following the repo's own conventions for where
documents live — a `project.*` file is for whole-repo concerns; a domain record belongs with its
domain at `src/modules/<domain>/<domain>.invariants.md`. Pick correctly and justify the choice in
one line.

It must contain: chosen transport with its argument; the discovery mechanism per harness with exact
flags/files for all four; the instance-identity scheme; a proposed tool surface with a
recommendation flagged as needing the user's decision; the attribution/consent model; lifecycle
behaviour; and a build plan in waves, each independently gateable.

**Also pair-check against `#46` (TerminalObserver reverse presence).** An external agent driving the
editor and the editor observing the terminal are the two directions of one channel. Determine
whether they should share a design rather than be built twice, and say so either way.

## What would make this design WRONG

- Building a bespoke bridge for claude and generalising later. Four harnesses were named on purpose.
- Choosing stdio without addressing that the server is already running.
- Any scheme where two Invar windows can be confused for each other.
- Deciding the tool surface unilaterally.

## Verification

This produces prose, so the verification is different: `node
.claude/skills/invariants/scripts/check_invariants.mjs --all --refs` must stay at or above 884
annotations / 67 lattice links / 0 problems, and `bash scripts/conventions-gate.sh` must pass (the
file-grammar and record-location rules apply to documents too). Quote both exit codes.

If you add no code, say so plainly rather than inventing a test to run.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
