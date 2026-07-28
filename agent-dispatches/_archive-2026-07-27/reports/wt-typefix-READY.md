# fix-visible-typing ready

## Probe findings

The scratch Bun probe spawned `/bin/bash` through the same `TerminalRcfile` plus
`OpenPty`/`setsid --ctty` path as the integrated terminal. It wrote
`printf HI > /tmp/wt-typefix-terminal-probe-<pid>.txt` one character at a time with
15 ms delays, then wrote `\r`.

| Observation | Result |
| --- | --- |
| Every prefix echoed before submit | PASS |
| Complete command echoed before submit | PASS |
| `\r` executed the plain Readline buffer | PASS (`HI`) |

Plain writes were therefore not the cause of the failed Enter path.

The app grid after the failing Enter showed:

```text
$ printf STAGED
STAGED$
```

Visible typing made the smoke's `printf STAGED` predicate resolve while the longer command was
still animating. `handleUserInput` treated Enter as generic input during an active request, aborted
the remaining animation, and forwarded Enter. Bash correctly executed only the visible partial
buffer, so the redirection target was never written. The old whole-command bracketed paste hid
prefixes until its closing marker, which had accidentally made the same predicate a completion wait.

## Chosen mechanism

- Sanitize the complete payload before the first write, removing CR, LF, C0, C1, and terminal escape
  sequences.
- Write animated commands as plain per-character input so real Bash Readline paints every prefix.
- Never submit staged commands automatically.
- If human Enter arrives during visible staging, cancel the timer, write the already-sanitized
  remainder, record the human grant, and forward exactly one Enter.
- If Enter arrives during an authorized run animation, finish the sanitized remainder and consume
  the extra human Enter because run mode already submits exactly once.

The mechanism and its impossibility boundary are recorded as
`Animated agent commands stay visible and inert` in
`src/modules/terminal/terminal.invariants.md`.

## Verification

| Run | Result |
| --- | --- |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1034 tests, 14496 expectations |
| `bun test src/modules/terminal/TerminalCommandController.test.ts` | PASS — 5/5 |
| `bun scripts/harness/smoke-terminal-stage-harness.ts` | PASS — visible typing, inert staging + human Enter, injection stripping, queueing, and run mode all green |
| `bun scripts/harness/smoke-terminal-harness.ts` | PASS — ALL-PASS |
| `bun .claude/skills/invariants/scripts/check_invariants.mjs --all` | PASS |
| `bun .claude/skills/invariants/scripts/check_invariants.mjs --refs` | PASS — 542 annotations, 39 lattice links, 0 problems |
| `bash scripts/conventions-gate.sh` | PASS |
| `git diff --check` | PASS |

Machine load was checked before both driven terminal smokes, with no scoped test, typecheck, smoke,
or `/tmp/wt-typefix` app process running.

## Tip

`d5c0523800724fcec13215a4cedd607f727d44bc`
