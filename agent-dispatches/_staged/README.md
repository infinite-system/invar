# Staged briefs — written, not yet dispatched

Each file here is a complete brief, ready to hand to `scripts/fleet/dispatch.sh`:

    scripts/fleet/dispatch.sh 168 frame-ordinal-wait \
      agent-dispatches/_staged/168-frame-ordinal-wait.md

They live in the repo rather than `/tmp` for the reason this whole directory exists: `/tmp` is
cleared on boot, and 235 dispatch documents were one reboot from gone on 2026-07-27.

`dispatch.sh` copies the brief to `agent-dispatches/<task>-<slug>/brief.md` and commits it before
launching, so a staged file becomes a dispatch record without being moved. Delete from `_staged/`
once dispatched — the committed record is then the authority.

## Ordering, and why it matters

**Not timing-sensitive — safe to run as a pair:**

- `168-frame-ordinal-wait` — waits for "the next frame" instead of a condition. THREE confirmed
  instances, one of them a gate step, so its retries launder everything measured beside it.
- `171-tasks-json-displaces-builtin` — writing `.invar/tasks.json` silently deletes the built-in
  Claude terminal. User-visible, and it BLOCKS fleet Phase 4.
- `173-grid-predicate-wrap` — predicates searching for contiguous text in surfaces that wrap.
- `170-ctrl-comma-swallowed` — `Ctrl+,` does not open Settings while the gear does.

**Timing-sensitive — must run SOLO on a quiet machine, in this order:**

1. `#177` — is the gate flake ONE shared cause? (needs N>=15 pool runs; brief not yet written)
2. `#175` — attribute the ~300 ms boot (brief not yet written)
3. `#169` — editor edit path allocates 4 arrays of length n per edit; the brief is the Opus 5
   review the user surfaced, at `tmp/TASK-wrapindex-edit-path.md`, plus the corrections recorded in
   the task: line numbers drift by one, a fifth allocation is unlisted, and no edit benchmark
   exists yet so the acceptance table requires building the instrument first.

A timing task run beside anything else produces numbers that cannot be trusted, which is worse than
no numbers — that is the whole lesson of #172.
