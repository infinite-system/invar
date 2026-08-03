# Brief #470 round 1 — the generator fixes (slice one)

## In plain words

The smoke suite has one broken primitive and three broken checks that teach
every future test to be flaky. Fix the generators, not the instances. The
big migration of individual waits comes later (it waits for task 471); this
round fixes only the sources.

## Read first, in this order

1. [task-470](task-470-harness-wait-defect-census.md) — the census summary
   and the recommended order. The full evidence is beside it in
   [the census](census-470-harness-wait-defect-census.md).
2. [.claude/skills/drive-pty/SKILL.md](../../../../.claude/skills/drive-pty/SKILL.md) — the wait discipline section, and the
   headless loop you will verify with.

## The work — four fixes, sources only

1. **`renderQuiescent` never resets.** It is set true at
   `src/modules/system/StatusChannel.ts:97` and never set false anywhere, so
   after the first frame every `settle` wait and every
   `renderQuiescent === true` check is pre-satisfied forever. Reset it to
   false when a frame is requested (find the honest reset point in the frame
   path — Bootstrap wires it). BOTH ARMS: prove a settle wait now actually
   waits during a repaint, and still passes promptly on a quiet app. This
   revives `scripts/tui-harness.sh`'s `settle` verb for 236 call sites.
2. **`PtyTestDriver.ts:412-439`** — this wait path lacks the pre-satisfaction
   guard its own sibling has at `:277-282`. Add the same guard, so a
   condition that is already true at issue is answered from a FRESH frame,
   not a stale one.
3. **`HarnessSmoke.ts:313-316`** — the surviving half of the #464 defect, in
   a SHARED helper on the contention tier: the `count > 0` branch waits on a
   title painted both before and after the close. Rewrite the wait on the
   model condition that actually changes (the census names it).
4. **`scripts/smoke-activitybar.sh:155,177`** — stale needles: the app paints
   'Space/Enter changes state' (src/modules/plugins/ExtensionsPaneContent.ts:76),
   the script greps 'Space/Enter installs or'. This smoke fails on EVERY run
   under INVAR_FULL_TMUX=1. Fix the needles.

Do NOT migrate the ~125 individual pre-satisfied waits in this round. That
work follows task 471.

## Invariants in scope

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md)
- [Every wait names itself](../../../../scripts/harness/harness.invariants.md)
- [Synchronized end markers bound complete frames](../../../../scripts/harness/harness.invariants.md) — fix 2 sits at its boundary.
- [Observability never crashes the app](../../../../src/modules/system/system.invariants.md) — fix 1 touches StatusChannel.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the `## Bycatch` section even when it
reads `None observed`.

## PTY usability — the conductor is tracking this

Verify through the drive-pty headless loop where a live app helps (fix 1
especially: watch renderQuiescent through `app.get` while you cause frames).
Your report MUST carry a `## PTY usability` section: what was easy, what was
confusing, what was MISSING. Ask for anything.

## Verification

- Fix 1 both arms as above; plant a regression test for the reset.
- Re-run the smokes your fixes touch: panel-chrome, scrollbars, plus
  `INVAR_FULL_TMUX=1 bash scripts/smoke-activitybar.sh` for fix 4.
- `bun test` in FULL, `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`,
  invariant checker `--all` and `--refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`. The
  conductor gates and lands.

## End state

A report file in this folder, number-first per the task system naming, opening with `## In plain words`, the invariants answered record by record,
the bycatch section, and the PTY usability section.
