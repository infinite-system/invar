# READY — #517 codex compaction lifecycle via notify

Branch: `fleet/517-codex-compaction-threshold-steer`, commit `fe8bbd90`.

## In plain words

Codex builders forget their rules when their memory fills up and gets
squeezed. I gave them a helper program that codex itself runs after every
answer. The helper looks at how full the memory is. Near the limit it says
"save your work now". Right after a squeeze it says "go re-read your rule
files". It says each thing exactly once per squeeze, so nobody gets spammed.

I also proved a good surprise: codex already puts the whole AGENTS.md file
back into its memory after every squeeze, on its own.

## The empirical answer the brief demanded (loudly)

**Codex DOES re-include the worktree's AGENTS.md after its own mid-session
compaction.** Proven on last night's #514 (terminal instance lifecycle)
rollout, which compacted twice
(`~/.codex/sessions/2026/08/05/rollout-2026-08-05T22-47-12-019fd4f7-….jsonl`,
lines 494 and 1486). Each `compacted` event's `replacement_history` carries
the full `# AGENTS.md instructions for <worktree>` message (24,550 chars =
the whole 24,511-byte file), plus the task message and every user steer. So
the dispatch-injected AGENTS.md fundamentals tier (commit `d54ddcc4`) is a
real post-compaction reload, not an assumption. The threshold steer is
therefore the ACTIVE arm, not the only defense. Caveat worth knowing: the
injected fundamentals are ~170KB, so that mechanical reload will re-spend
roughly 40k tokens of each fresh window (#514 predated the injection; its
re-included AGENTS.md was the bare 24KB law).

## Doc verification (brief step 1) — all premises re-verified on 0.146.1

- `notify` is a live config key, now implemented on the hooks engine
  (`hooks/src/legacy_notify.rs` in the binary). Registration:
  `notify=["<program>"]`, and `-c notify=[…]` works per launch.
- Payload verified by LIVE CAPTURE, both `codex_exec` and `codex-tui`
  clients: one JSON argument,
  `{"type":"agent-turn-complete","thread-id":…,"turn-id":…,"cwd":…,"client":…,"input-messages":[…],"last-assistant-message":…}`.
  No token usage in the payload.
- The rollout is the usage source, and the payload's `thread-id` equals the
  rollout filename's UUID — exact lane-to-file identity, no cwd grep. The
  last `token_count` event carries `last_token_usage.total_tokens` (the size
  of the most recent request = the live context) and `model_context_window`
  (258,400 for gpt-5.6-sol).
- Calibration from the real compactions: codex auto-compacted at 88.9% and
  85.1%; the first post-compact turn read 7.0% and 7.2%. Normal turns only
  grow. So warn-at-70 has real runway, and the collapse edge (>=60 down to
  <=20) has a ~40-point margin on each side — a long tool-output turn cannot
  false-positive because no turn shrinks usage except compaction.
- Bonus finding: 0.146.1 ships a STABLE `hooks` feature (`hooks.json`
  engine with `pre_compact`/`post_compact`/`session_start` events). See
  Bycatch — it is the sharper future mechanism, but its payload and
  registration are unverified, so this task stands on the verified notify
  path per the brief's evidence-first rule.

## What landed (one commit, `fe8bbd90`)

1. **`scripts/fleet/codex-compaction-notify.sh`** (new, self-tested) — the
   notify program. Per turn: parse lane identity (anchored head-order parse,
   spoof-proof against message content), read the rollout percent, then:
   - WARN arm at >=70%: "compaction imminent — commit WIP now", once per
     compaction generation.
   - DETECT arm on the >=60% -> <=20% edge: generation++, steer "re-read
     BUILDER-FUNDAMENTALS.md and TASK.md wholesale", with the generation
     number in the text.
   - Idempotence, all four required layers: edge-triggered marker updated
     every turn; per-lane generation counter (a steered generation never
     re-steers — replays and restarts are silent); 5-minute cooldown caps
     pathological oscillation; the steer text itself says "if you already
     re-read your fundamentals after this compaction, continue working".
   - Delivery is `scripts/fleet/steer.sh` (the confirmed-landing machinery,
     never raw send-keys), backgrounded so codex is not blocked, and run
     from the main checkout so steers.log lands in the task folder there
     (found and fixed during review: steer.sh resolves paths from cwd, and
     codex invokes notify with cwd = the worktree).
   - Judgment call the brief asked for (steer vs marker): direct steer.sh,
     because notify fires exactly at a turn boundary (composer idle — the
     perfect steer moment) and steer.sh already escalates unconfirmed
     deliveries to fleet-watch (pending marker -> LANDED or STEER_LOST). A
     separate marker lane would duplicate that machinery.
2. **`scripts/fleet/dispatch.sh`** — the codex arm appends
   `-c notify=["<main-checkout>/scripts/fleet/codex-compaction-notify.sh"]`.
   Flag-only registration: nothing worktree-local is planted, so there is
   nothing new for land.sh to restore.
3. **`scripts/fleet/relaunch.sh`** — the codex resume command re-registers
   the same flag (it is per-launch, not persistent config); self-test
   asserts it.
4. **`scripts/fleet/land.sh`** — clears the lane's `/tmp` state and log
   files at landing so a future same-named lane starts fresh.

Fleet-watch polling fallback (brief item 5): NOT built — notify proved
reliable in every probe (exec, TUI, and the dispatch-style expansion path),
so there is no evidence to justify the second arm. If STEER_LOST events ever
show notify silence in production, that is the trigger to add it.

## Verification

- `bash scripts/fleet/codex-compaction-notify.sh --self-test` — green. Arms:
  clean single-fire (synthetic 80,15,22,28 -> exactly one post-compact steer
  and one warn), replay-same-generation silent, restart-resume (state is on
  disk; warn re-arms for the new generation; second collapse steers as #2),
  oscillation capped by cooldown (three 80->15 swings -> one steer),
  generation counter real (cooldown disabled -> three steers, #1..#3),
  below-threshold and small-dip silent (10,25,40,55,18,45,65 -> zero
  steers), parser anti-spoof (hostile input-message with fake `cwd:` and
  `thread-id:` keys cannot win), non-lane cwd silent end-to-end, and the
  worktree-lane entry path fires (positive control for the silence arm).
- POSITIVE CONTROLS: three planted defects (warn bar moved to 90, collapse
  bar moved to 5, cooldown zeroed) each turned the suite red at the exact
  arms that guard them, then green again unplanted.
- LIVE end-to-end: a real codex TUI launched through agent-tmux with the
  EXACT dispatch.sh expansion (unquoted `$agent_command` with the embedded
  quotes) fired notify with `client:"codex-tui"`. The real entry path was
  also run against #514's real rollout by thread-id and read the true final
  usage (56%) with no steer — correct.
- Neighbors: `steer.sh --self-test`, `relaunch.sh --self-test`,
  `fleet-watch.sh --self-test` all green after my edits; `bash -n` clean on
  dispatch.sh and land.sh; invariants checker `--all --refs`: 0 problems.
- Not driven: a real 250k-token codex session driven to live compaction
  (hours of quota for one sighting). The collapse edge is instead anchored
  to the two real compactions in #514's rollout, and every decision layer is
  proven synthetically at the seam those numbers calibrate.

## Bycatch

- **Codex hooks engine, stable and unused (ask):** `codex features list`
  shows `hooks stable true`; the binary carries a `hooks.json` config with
  `pre_compact`/`post_compact`/`session_start`/`session_end` events and
  Claude-style hook semantics. A `post_compact` hook would replace the
  usage-differencing detection with a direct signal (and `session_start`
  could replace the TASK.md opening send). Payload shape and registration
  path unverified — a future task should probe it the way this one probed
  notify.
- **Comment drift, `scripts/fleet/dispatch.sh` (two sites):** the DRY_RUN
  echo ("fleet defaults at launch: codex -> gpt-5.6-sol high") and the
  FLEET DEFAULTS comment block ("codex -> gpt-5.6-sol at HIGH, always")
  still state the 2026-07-29 high-floor; the code below them defaults codex
  effort to MEDIUM per the 2026-07-30 policy the resolver comment cites.
  Both sides named; not fixed (shared file, outside my task's diff scope).
- **Suspect, `scripts/fleet/relaunch.sh`:** `codex resume --last` — if
  "--last" is global-most-recent rather than cwd-scoped, relaunching lane A
  while lane B ran more recently would resume B's conversation inside A's
  worktree. Labeled suspect: not reproduced, and auto-restore has worked in
  practice; worth one deliberate two-lane probe.
- **Distillation possibility:** `steer.sh` and `fleet-watch.sh` both locate
  a lane's rollout by grepping the newest 40 rollout heads for the cwd
  (`find_session_record`, duplicated logic). The notify payload proves the
  thread-id -> rollout-filename identity; a shared "lane rollout" resolver
  keyed by thread-id (recorded at dispatch alongside the session link)
  would delete both copies and the heuristic.

## Instrument feedback

- EASY: agent-tmux launch/send/wait made the live TUI probes one-liners;
  steer.sh's self-test made the delivery contract legible without reading
  its history.
- CONFUSING: nothing in the instruments; the one trap was outside them
  (steer.sh's cwd-relative task-folder resolution — documented nowhere, and
  it silently writes into whatever checkout you stand in; the fix in my
  notify program pins the cwd).
- MISSING (ask): a sanctioned way for a fleet script to ask "main checkout
  path, from anywhere" — dispatch.sh, steer.sh, and now my script each
  derive it their own way (`require-main-checkout.sh` guards but does not
  resolve).
