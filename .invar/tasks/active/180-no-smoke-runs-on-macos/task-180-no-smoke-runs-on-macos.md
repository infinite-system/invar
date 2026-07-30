# 180 — CRITICAL: no smoke can run on macOS

State: ACTIVE — CRITICAL
Created: 2026-07-28
Engine: claude
Environment: macos
Model: opus-5
Effort: high
Priority: verification-integrity
Assignment note: NOT RUNNABLE FROM THIS HOST — PtyTestDriver is FFI-blocked on darwin, so the gate has never run on the user's machine. Needs a claude on real macOS.

## Outline

`PtyTestDriver` — the harness that **all 61 smokes** drive Invar through — is **FFI-blocked on
darwin**. So the gate has never run on the user's HOST machine, and **every macOS-specific defect is
invisible to the gate by construction.**

### The existence proof

This was found while reviewing the macOS terminal PR (PR #1, sound and accepted). **The segfault that
PR fixes was found by a person running the app** — not by any instrument. That is the whole argument:
the class of defect exists, it reached a user, and nothing in 61 smokes could have seen it.

It is bigger than a PR note, which is why it was pulled out into its own task rather than left as
review commentary.

### The prize

**`bun run gate` on macOS.** Not a partial port, not a subset — the same gate, on the platform the user
actually runs.

### Its pair

**#181** — `TerminalFactory`'s platform choice has no test; the darwin arm never executes on Linux.
That is the single decision determining which PTY implementation a user gets, and it is the one thing
the suite cannot assert. The two are the same blind spot at different depths: #181 is the untested
branch, #180 is the untestable platform behind it.

### Landing note from when it was filed

PR #1 was held only for attribution — `READY.macos-terminal.md` had to move out of the repo root into
`agent-dispatches/` (its own commit message says "strip before landing"). Once that landed, #181 and
#182 became dispatchable.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
