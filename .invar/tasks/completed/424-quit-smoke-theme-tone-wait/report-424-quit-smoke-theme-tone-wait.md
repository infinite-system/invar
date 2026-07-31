# READY — theme-tone smoke waits (#424)

State: READY

Task commit: `6e8042cc5a839eea1f24cbbdaa68e678c7dbb48f`

The branch head advanced to merge commit `1b668ad676e30197e263165ab8f8f2a1bb8444d4` after the task
commit. That merge changes none of the five task files. I did not initiate it.

## Result

The two reported failures did not reproduce under load. The quit smoke stayed green in seven
loaded runs. The Markdown smoke stayed green in five loaded runs. I still confirmed the unsafe
wait shape in both named sites.

I changed each unsafe frame read so its wait observes the exact tone, background, or stable region
that the following assertion checks. I did not add a sleep or widen a timeout. The assertions remain
as coverage ratchets.

## Reproduction

| Smoke | Background load | Attempts | Result |
| --- | --- | ---: | --- |
| [Quit confirmation](../../../../scripts/harness/smoke-quit-confirmation-harness.ts) | Repeated full `bun test` runs | 7 | Seven green; reported red did not reproduce |
| [Markdown](../../../../scripts/harness/smoke-markdown-harness.ts) | Repeated full `bun test` runs | 5 | Five green; reported red did not reproduce |

## Census

The committed [AST census](424-assert-after-switch-census.ts) scans every
`scripts/harness/smoke-*.ts` file. It scanned 72 smoke files. It produced 225 switch, wait, and
visual-assertion review leads across 33 files. I reviewed the switch-adjacent frame assertions and
found these ten unsafe groups:

| Site | Unsafe observation | Resolution |
| --- | --- | --- |
| [Quit initial focus](../../../../scripts/harness/smoke-quit-confirmation-harness.ts#L234) | The wait saw dialog text, then the assertion read the focused `No` tone. This includes the reported 100,000-line light arm. | The wait now requires the active theme selection tone. |
| [Task preview styles](../../../../scripts/harness/smoke-markdown-harness.ts#L571) | Dark and light preview launches waited for text, then asserted heading and link colors. | The wait now requires the heading treatment and all three link tones. |
| [Upward-link preview](../../../../scripts/harness/smoke-markdown-harness.ts#L740) | Both 12-line and 100,000-line arms waited for link text, then asserted resolved and dead-link tones. | Both the initial paint and tab-return paint now require all three tones. |
| [Initial dark code preview](../../../../scripts/harness/smoke-markdown-harness.ts#L1069) | The 500-line and 100,000-line arms waited for code text, then asserted six heading colors and the fenced-code background. This includes the reported 500-line arm. | The wait now uses the same heading and code-fence predicates as the assertions. |
| [Live light Markdown theme](../../../../scripts/harness/smoke-markdown-harness.ts#L1110) | The wait checked only the first heading color, then asserted all headings and the code fence. | The wait now requires all heading colors and every fenced-code cell. |
| [Restored dark Markdown theme](../../../../scripts/harness/smoke-markdown-harness.ts#L1148) | The wait checked only the first heading color, then asserted all headings and the code fence. | The wait now requires all heading colors and every fenced-code cell. |
| [Restored dark link tones](../../../../scripts/harness/smoke-markdown-harness.ts#L1179) | The wait saw link text after the theme switch, then asserted three link colors. | The wait now requires current, missing, and external link tones. |
| [README tab return](../../../../scripts/harness/smoke-markdown-harness.ts#L2074) | The wait saw the preview heading after a tab switch, then read link colors from later snapshots. | One coherent snapshot now waits for the heading and all link tones. |
| [Live light scrollbars](../../../../scripts/harness/smoke-scrollbars-harness.ts#L380) | The wait derived scrollbar targets, then the assertion read the new theme pair. | The wait now requires the exact light panel and dim colors. |
| [Terminal follow mode](../../../../scripts/harness/smoke-terminal-follow-harness.ts#L178) | The palette action changed mode, then a later assertion compared an agent-footer frame without proving the footer survived that action. | The action now proves the footer region stays byte-identical while another region changes. |

The live-theme paths in the breadcrumb, terminal, and tasks-dashboard smokes already wait for the
asserted frame color. The Markdown view-mode smoke waits for the exact preview-only projection. The
keyboard terminal-follow paths wait for their published mode state and do not make an immediate
frame assertion. I left these sites unchanged.

## Positive controls

- I changed the quit wait and assertion from `palette.selection` to `palette.cursorLine`. The smoke
  went red at the first focused-tone condition. I removed the plant.

- I changed the Markdown code-fence predicate from `palette.selectionMuted` to the dark panel
  background. The smoke went red while waiting for the 500-line code fence after parent growth. I
  removed the plant.

## Verification

One final runtime pass was green:

- Quit confirmation standalone: exit 0 at 10 and 100,000 lines.
- Markdown standalone: exit 0 at 500 and 100,000 lines.
- Scrollbars standalone: exit 0 at 500 and 100,000 lines.
- Terminal follow standalone: exit 0.
- Quit confirmation with a concurrent full `bun test`: smoke exit 0; unit suite exit 0.
- Markdown with a concurrent full `bun test`: smoke exit 0; unit suite exit 0.

The final static pass was also green:

- `bunx prettier --check` on all five changed files.
- `bunx tsc --noEmit`.
- `bun scripts/check-harness-wait-observation.ts`. It reported its existing semantic-review
  candidates and exited 0.
- `bun scripts/check-coverage-ratchet.ts`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,302 annotations,
  259 lattice links, and 0 problems.
- The committed census: 72 smoke files and 225 review leads.

The worktree is clean. I did not push or merge.

## Invariants in scope

The brief's “none recorded” statement is not correct. Two records bind this work:

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals).
- [Coverage may fall but never silently](../../../../project.invariants.md#coverage-may-fall-but-never-silently).

The terminal-follow change also follows [Stable regions stay byte-identical across actions](../../../../scripts/harness/harness.invariants.md#stable-regions-stay-byte-identical-across-actions).

## Bycatch

- CONTRACT DRIFT: [the brief](brief-424-2-quit-smoke-theme-tone-wait.md#invariants-in-scope)
  says no harness invariant is recorded. The harness and project records above govern this exact
  change. I did not edit the brief.

- TOOLING CONFLICT: the normal commit hook started `scripts/merge-gate.sh`, although
  [the brief](brief-424-2-quit-smoke-theme-tone-wait.md) forbids that command for this task. I
  observed this once, stopped only the hook-owned process group, and committed with the hook's
  documented `SKIP_GATE=1` bypass. No merge gate completed.
