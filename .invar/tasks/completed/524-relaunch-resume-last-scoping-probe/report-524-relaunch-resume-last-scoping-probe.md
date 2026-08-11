# READY — #524 (resume --last scoping probe) + #525 (shared lane-rollout resolver)

Branch: `fleet/524-relaunch-resume-last-scoping-probe`
Commits: `1672b451` (probe + evidence), `7da02caa` (resolver + wiring)

## In plain words

We feared that restarting a dead builder could pick up the WRONG
conversation, meaning the newest one on the whole machine instead of
this folder's. I built two throwaway codex sessions in two folders, killed
the first, and restarted it while the second was still running and
newer. The first folder got its OWN conversation back. So the fear is
refuted: codex only resumes conversations from the same folder. I also
merged three copies of the "find this lane's session file" search into
one shared script that all three fleet scripts now use.

## Item 1 — #524 probe verdict: crossing REFUTED

`codex resume --last` is **cwd-scoped, not global** (codex-cli 0.146.1).
The #517 builder's suspicion about
[relaunch.sh](../../../../scripts/fleet/relaunch.sh) does not hold on
this version. No change to relaunch's resume form was needed; its header
comment now records the verdict so the "suspect" label dies at the site
that carried it.

Method (script:
[probe-524-resume-scope.sh](probe-524-resume-scope.sh), full run log:
[evidence-524-probe-run3.txt](evidence-524-probe-run3.txt)):

1. **Control (positive control first).** Lane A alone in
   `/tmp/probe524-lane-a`, one trivial turn planting a unique token,
   codex killed by cwd-resolved pid (never a name pattern). `resume
   --last` in A's dir replayed A's token. The evidence pipeline can see
   a correct resume.
2. **Crossing arm.** Lane B launched after A in its own dir, given the
   globally newest turn, and left ALIVE (a real fleet neighbor). `resume
   --last` in A's dir replayed `TOKEN_A=yes TOKEN_B=no`. That is A's own
   conversation, despite B being newest everywhere. Verified against the
   rollout files: B's (`rollout-...019ff17d-fe2c...jsonl`) was the
   globally newest at that moment.
3. **Empty-dir edge (adversarial extra, zero model cost).** In a
   directory with NO recorded session, `resume --last` silently starts a
   **fresh** session: no cross-directory grab, but no warning either. A
   relaunch can believe it restored context when the lane is actually
   amnesiac. Recorded in relaunch.sh's header; see Bycatch.

Scope of the verdict: proved on codex-cli 0.146.1 (0.147.0 exists,
unprobed). The cwd filter is codex's behavior, not ours; if a future
version drops it, the fix seam is ready (below). The probe script is
committed and rerunnable against any future version.

The bar held: no Invar session was touched (all tmux sessions
`probe524-*`, all kills `/proc`-cwd-resolved pids inside the two scratch
dirs, both scratch dirs removed after the run).

## Item 2 — #525: one shared lane-rollout resolver

New: [scripts/fleet/lane-rollout.sh](../../../../scripts/fleet/lane-rollout.sh)
— `resolve_lane_rollout <cwd> <task-folder-name> <thread-id>`, strongest
identity first: thread-id (rollout filename, the #517 payload identity),
then cwd scan of the newest 40 rollout heads (session-meta identity,
never content grep), then the claude store fallback by task folder name.

One seam, THREE callers. The brief named two; the third was found
while wiring:

- [steer.sh](../../../../scripts/fleet/steer.sh) `find_session_record`
  now delegates.
- [fleet-watch.sh](../../../../scripts/fleet/fleet-watch.sh)
  `emit_steer_events` inline copy replaced.
- [codex-compaction-notify.sh](../../../../scripts/fleet/codex-compaction-notify.sh)
  `read_rollout_percent` carried a third duplicate (the thread-id glob);
  folded into the same seam.

relaunch.sh does NOT call it (crossing refuted, so `resume --last` stays),
but its header names the seam as where a resume-by-id fix plugs in if a
future codex drops the cwd filter.

One deliberate semantic union: steer.sh formerly skipped the claude
fallback when the tmux pane cwd came back empty; fleet-watch always
tried it. The resolver always tries it (empty arguments skip only their
own arm). The union is strictly more able to find the record and matches
what fleet-watch already did.

## Verification protocol (driven, both polarities, every script green)

- Probe control arm green BEFORE the discriminating arm ran (positive
  control of the instrument itself).
- `lane-rollout.sh --self-test`: planted fixture sessions tree; arms:
  thread-id present/absent/fallback-to-cwd, cwd present/isolation/
  absent, scan-window bound (window pinched to 1 must MISS the older
  lane, proving the bound is real, not decoration), claude fallback present/
  absent, precedence (codex outranks claude). All both polarities.
- **Planted defect caught**: dropping `-t` from the cwd scan's `ls` in a
  copy turned 4 arms red (quoted in the transcript), then green again
  clean. The self-test was born able to fail.
- Live positive check against the REAL store: newest real rollout
  resolved back to itself by cwd AND by thread-id extracted from its
  filename (`LIVE-RESOLVE-MATCH`, `LIVE-THREADID-MATCH`).
- Full self-test matrix after wiring, all exit 0: lane-rollout, steer,
  fleet-watch, relaunch, codex-compaction-notify. fleet-watch's
  steer-confirm arm drives the resolver's claude arm through the real
  caller path (it plants a store dir and requires the LANDED log line).
- `bash -n` clean on all five scripts.

## Bycatch (taxonomy per [AGENTS.md](../../../../AGENTS.md))

- **Distillation, FIXED in `7da02caa`:**
  `codex-compaction-notify.sh` held a third copy of the rollout search
  (thread-id glob) beyond the two the brief named. Folded into the
  shared resolver in the same seam-extraction commit.
- **Operational hazard, observed twice, NOT fixed (not mine to own):**
  codex's version-update dialog (`✨ Update available! 0.146.1 ->
  0.147.0`) blocks the composer at launch until answered, and it paints
  `›`, which defeats prompt-detection waits. It cost this probe its
  first run. A fleet dispatch or relaunch landing on the day a codex
  version ships could stall the same way until someone answers the
  dialog. `dispatch.sh`/`agent-tmux.sh` do not handle it. Reproduction:
  launch codex interactively while an update is pending.
- **Finding, recorded in relaunch.sh header:** `resume --last` with no
  recorded session for the cwd silently starts a FRESH session. A
  relaunched lane that never wrote a rollout (died pre-first-turn)
  comes back amnesiac with no signal. If that matters, the resolver can
  detect it (empty resolve for the worktree). That is a candidate
  follow-up, not built here.
- **Steer-delivery law reproduced live:** a bare `send-keys` + Enter
  left the probe's message sitting unsubmitted in the codex composer,
  the exact #289/#413 class steer.sh exists for. The probe's `send_turn`
  now requires the token painted twice (echo + reply) and retries Enter;
  the trap is documented in the script.
- **None observed** in the contract layer: fleet scripts are ungoverned
  (no `*.invariants.md` names them), consistent with the brief's
  "Invariants in scope: None".

## Artifacts

- Worktree tree clean (only the dispatch-provided untracked
  builder-fundamentals file remains at the worktree root, as delivered).
- `/tmp` leftovers: `probe524-run{1,2,3}.log` (small text logs; run 3 is
  also committed as evidence). Scratch dirs and tmux sessions removed;
  no probe codex processes alive.
