# Transcript search adoption ready

## Tip

`88abad7fdc4bf529dfabb61bb5e21996ba8f17d6`

Branch: `experiment-transcript-search`

Rebased onto: `origin/main` at `ad5d218`

The annotated `experiment/transcript-search-v1` tag still peels to the pre-rebase experiment tip
`509931b59cada10fda171bb9eecd2226ce86836a`. No branch was pushed, force-pushed, or deleted.

## Rebase conflict summary

`git rebase origin/main` produced one textual conflict in
`src/modules/agent/AgentPaneContent.ts`, in the import block. Current main had added
`AgentProviderRegistry` for live provider title and engine labels; the adopted experiment had added
`AgentTranscriptSearch` for FindBar projection and highlights. The resolution retained both imports
and both behaviors.

The post-rebase typecheck also exposed two experiment test calls using the older five-argument
`AgentTranscriptProjection.project` signature. Both now pass the active provider label (`Claude`) as
the sixth argument, so the search pipeline tests exercise current main's identity-aware projection.

## Clickable icon placement

The search button is in the agent pane mode line, beside the existing clickable engine control and
before the permission segment. This is the pane's established action chrome, already routed through
`AgentPaneContent.onPointerDown`, so the affordance composes with current pointer geometry without
adding a title-bar special case.

The button uses the shared semantic `FindIconSet.search` ladder:

- nerd: Font Awesome search
- unicode: `⌕`
- ascii: `/`

`modeLineSegments` emits the padded button and records its hit-zone in the same pass. Both the icon
click and Ctrl+F invoke `Bootstrap.openAgentTranscriptSearch`, which owns overlay coordination and
opens the same shared `FindBar` target.

The agent invariant contract now records the mouse path, shared action, shared geometry, and the
`No action requires a memorized motion` reference. The driven smoke was renamed to
`scripts/smoke-agent-search.sh`.

## Verification transcript

All commands were run from `/tmp/wt-tsearch`.

```text
$ bunx tsc --noEmit
exit 0

$ bun test
805 pass
0 fail
12767 expect() calls
103 files

$ bash scripts/smoke-agent-search.sh
mouse icon painted at (25,36)
mouse click opened find bar: true
mouse click target: agent-transcript
query: needle
match count: 4
Ctrl+F reopened same target with retained query and 4 matches
FrameProbe current and non-current match backgrounds: highlighted
idle frame delta: 0
RESULT: ALL-PASS

$ bash scripts/smoke-agent-engine-switch.sh
Claude identity at boot: PASS
Ctrl+E switch to Codex and live title update: PASS
mouse switch back to Claude: PASS
Codex-at-boot identity: PASS
RESULT: ALL-PASS

$ bash scripts/smoke-agent-pane-ux.sh
composer chrome, permissions, thinking/waiting, collapse, wrapping, scrollbar,
momentum, transcript/composer selection-copy, multi-line composer: PASS
idle frame delta: 0
RESULT: ALL-PASS

$ node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
406 annotation(s) resolved
39 lattice link(s) resolved
0 problem(s)
exit 0

$ bash scripts/conventions-gate.sh
conventions-gate: PASS
```

`TASK.md` names `node scripts/check_invariants.mjs --all --refs`, but this checkout has no
`scripts/check_invariants.mjs`; that literal command returns `MODULE_NOT_FOUND`. The canonical path
required by `AGENTS.md` and the invariant skill is
`.claude/skills/invariants/scripts/check_invariants.mjs`, shown green above.

Per task instruction, `scripts/merge-gate.sh` was not run.
