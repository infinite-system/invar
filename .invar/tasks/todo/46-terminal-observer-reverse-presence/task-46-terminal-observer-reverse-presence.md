# 46 — TerminalObserver: reverse presence

State: TODO — design doc exists, no branch cut
Created: 2026-07-28
Engine: claude
Environment: linux
Model: opus-5
Effort: high
Assignment note: Must be designed WITH the MCP direction (#157) or it gets built twice.

## Outline

The editor observes the terminal: command boundaries, exit codes, and output become an event stream the
agent can consume. "Reverse presence" because the usual direction is the agent driving the terminal;
this is the terminal's activity reaching the agent.

### The wave structure

Wave 1 (the observer itself) was created and staged but never launched — it sat in the overnight order
`land extent → gate+land layout → osc52 lands → TerminalObserver waves 1-4 → grammar two-wide` and none
of the stages ahead of it completed that night.

**Wave 2 is a policy layer over the event stream, and the user specified it directly** (2026-07-25):

> "setting in agent bottom where you set if agent should respond to your terminal command results, 3
> settings follow (after each command agent responds), on error (agent responds only on failed), do not
> follow, or any other you see fit?"

Modes:
1. **FOLLOW** — agent responds after each completed command;
2. **ON-ERROR** — responds only when a command fails (exit code ≠ 0, via OSC 133 command boundaries);
3. **OFF** — no observation-triggered responses;
4. **ON-REQUEST (silent-context)**, proposed — the agent ingests the stream silently and never speaks
   unprompted, but already has full terminal context when the user asks something.

Placement: a visible cycling control in the agent pane footer beside the engine ⇄ / bypass indicators,
mouse-clickable AND keyboard-reachable, plus a Settings entry. Mode changes apply live (late-read).

*(This footer control shipped as #53. The observer stream underneath it is what remains.)*

### Pair it with the MCP direction, do not build twice

An external agent driving the editor (#157/#114) and the editor observing the terminal are **the two
directions of one channel**. The instruction on record: determine whether they should share a design,
and say so either way. Also pairs with #114 more broadly — the terminal as a hosted runtime is the same
extraction this observer sits inside.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
