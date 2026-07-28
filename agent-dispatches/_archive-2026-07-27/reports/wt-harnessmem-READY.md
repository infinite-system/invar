# READY — harness output retention

Commit: `fd2e48d fix(harness): bound retained terminal output`

## Delivered

- `PtyTestDriver` retains a 4 MB output tail by default, tracks discarded output and overflow,
  and documents `recordedOutput()` as a tail-returning API.
- `retainFullOutput: true` is an explicit opt-in used by both terminal fixture recorders.
- `TerminalOutputAudit` is a stateful streaming parser. Its static whole-string API is a thin
  wrapper over `consume`, and emission offsets remain absolute across chunks and retained-tail
  trimming.
- `outputSequenceCount` registers and accumulates counts incrementally with cross-chunk carry.
  First registration after overflow throws a sequence-naming error instead of undercounting.
- Clipboard consumers use `PtyTestDriver.clipboardEmissions()`. Paste and pixel-preview sequence
  consumers register their sequences before output can overflow.
- Added the chosen harness invariant `Harness output history stays bounded` and its enforcement
  annotation.

## Measurements

All measurement runs started only after an actual `bash scripts/merge-gate.sh` preflight returned
no process.

| Measurement | Before (`d8a642e`) | After (`fd2e48d`) | Delta |
| --- | ---: | ---: | ---: |
| `smoke-clipboard-frame-boundary-harness` peak RSS | 280,252 KB | 270,248 KB | -10,004 KB (-3.57%) |
| `smoke-paste-harness` peak RSS | 328,172 KB | 332,220 KB | +4,048 KB (+1.23%) |
| Full 53-smoke registry wall time | 322.11 s | 289.07 s | -33.04 s (-10.26%) |

The raw process peak for paste increased slightly; the direct bounded-tail tests prove the memory
retention bound independently of that noisy whole-process maximum.

Baseline wall-time caveat: the before registry exercised all 53 smokes but
`smoke-workspace-tabs-harness` incurred a 30-second timeout after another worktree launched a gate
during the run, so the raw 322.11-second before number includes that timeout. The authoritative
post-change run completed 53/53 green in 289.07 seconds.

Raw evidence:

- `/tmp/wt-harnessmem-before-clipboard.time`
- `/tmp/wt-harnessmem-after-clipboard.time`
- `/tmp/wt-harnessmem-before-paste.time`
- `/tmp/wt-harnessmem-after-paste.time`
- `/tmp/wt-harnessmem-before-registry.seconds`
- `/tmp/wt-harnessmem-after-registry-clean.seconds`
- `/tmp/wt-harnessmem-after-clean-smoke-*-harness.log`

## Verification

- `bunx tsc --noEmit` — PASS
- `bun test` — PASS, 1,323 tests
- invariants `--all` — PASS
- invariants `--refs` — PASS, 664 annotations resolved and 0 problems
- `bun scripts/check-file-grammar.ts` — PASS
- `bash scripts/conventions-gate.sh` — PASS
- focused retention/audit tests after commit formatting — PASS, 17 tests and 181 expectations
- every registered harness smoke solo — PASS, 53/53

## Handoff state

- Worktree clean.
- `git ls-files | grep '^TASK'` returns no files; the untracked task packet was removed.
- Detached baseline worktree removed.
- No gate, push, merge, or tag was performed; the commit used `SKIP_GATE=1`.
- `origin/main` advanced by five commits while this task was running. The task branch remains the
  requested implementation commit without integrating those later upstream changes.
