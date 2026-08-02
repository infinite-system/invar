# Brief #452 round 5 — the identity sweep is not finished

## In plain words

Round 4 fixed the clipboard consumer and that one is now green. Four
more surfaces still break, and every one of them breaks only on your
branch. They pass on main. Finish the sweep: find every place that
still expects a pane identity to read like a kind name, and fix the
class, not the four instances.

## The measurement — read this before you form a theory

Each smoke below was run twice, quiet and serial, with no gate and no
other builder on the machine. Same command, same fixtures, both trees.

| smoke | on `main` | on your branch `a94eb89f` |
|---|---|---|
| `smoke-scrollbars-harness` | ALL-PASS | FAILS every run |
| `smoke-agent-pane-ux-harness` | ALL-PASS | FAILS every run |
| `smoke-agent-cancel-harness` | ALL-PASS | FAILS every run |
| `smoke-keyboard-invariant` | (gate) OK | FAILS in the gate |
| `behavioral-contracts` | (gate) OK | FAILS in the gate |

These are not flakes and not pre-existing. I classified them as
"unrelated" once without measuring, and that was wrong; the four task
folders #453-#456 now carry the correction. Do not inherit my error —
but do check my work, and say so if the A/B does not reproduce for you.

## The failures, verbatim

```text
scrollbars:      Timed out waiting for grid condition: the diff pane
                 vertical thumb is painted before frame collection begins
agent-pane-ux:   FAIL composer keeps composeralpha whole on one row
agent-cancel:    Timed out waiting for grid condition: composer visibly
                 contains /resolver-smoke ARGUMENTANCHOR
keyboard:        Ctrl+Shift+S split the panel (field panelCellIds stayed
                 'pane-instance-2,pane-instance-1', wanted 'agent,terminal')
                 Ctrl+Shift+A closed the agent pane (field panelCellIds
                 stayed 'pane-instance-1', wanted 'terminal')
                 the focused panel content is the terminal:
                 got 'pane-instance-1' want 'terminal'
behavioral:      Timed out waiting for grid condition: the focused
                 structure filter has one leading cell in the shared
                 active tone
```

The keyboard one names the mechanism outright: a status field carrying
IDS is being read for NAMES. The other four are the same defect wearing
different clothes — a lookup, a geometry probe, or a focus check keyed
on an identifier that used to spell its own kind.

## The rule that decides each site

From the folded #441 ruling, already in your round 1 brief:

> If ids become opaque, the projection MUST carry the label explicitly.
> Nothing downstream may derive a display name from an id again.

So for every failing site, decide which side is wrong:

- **The consumer wants a NAME** → it must read a label field, and the
  projection must publish one. Add the field; do not widen the id.
- **The consumer wants IDENTITY** → it must accept an opaque string.
  Fix the consumer's assumption about the id's shape.

Never make an id spell its kind again to satisfy a caller. That is the
defect this whole task exists to remove.

## Do not edit a test to make it pass

`smoke-keyboard-invariant` asserts `panelCellIds == 'agent,terminal'`.
That assertion is asking an id field for a name, so it is genuinely
wrong AND the product genuinely lacks the label field it should have
asked for. Fix both: publish the labels, then assert on the labels.

That is a narrow licence. It applies where the assertion demonstrably
asks the wrong field. It does not apply to the timeout failures — a
thumb that never paints and a composer that never fills are product
breakage, and relaxing their waits would hide it. If you find yourself
loosening a wait, stop and report instead.

## Enumerate, do not patch four times

Round 4 fixed the consumers it was shown. Four more surfaced. That is
the signature of a defect found by symptom instead of by census.

Enumerate every consumer of pane identity mechanically — grep the
kind strings (`terminal`, `agent`, `database`, whatever the kinds are)
against id-typed fields and lookups, across product code, status
projections, harness helpers, and smoke expectations. Report the census
count. The fix must cover the census, not the five reds.

If the census cannot be made mechanical, say why — an honest "I checked
these 30 sites by reading" is worth more than a grep that quietly
missed a family.

## Invariants in scope

- [The UI contract](../../../../src/modules/ui/ui.invariants.md) —
  panel content ordering and identity. The record you proposed for
  identity-is-not-presentation lands or refines here.
- [The app contract](../../../../src/modules/app/app.invariants.md) —
  restore and boot ordering.
- [The terminal contract](../../../../src/modules/terminal/terminal.invariants.md).
- [project.invariants.md](../../../../project.invariants.md) —
  `Public classes use the namespace pattern`, `Live static reads follow
  the receiving class`.
- **The record this task owes.** Five consumers broke silently on an id
  shape change, with no type error. If identity-is-opaque is not
  written down with an `Impossible if true` that a reviewer could
  actually catch this with, the contract is not yet doing its job.
  Propose the sharper wording.
- Any record this list MISSED is a finding about my map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy: runtime
defects, invariant violations in function, comment drift, distillation
possibilities, generator drift or introduced variance, plain nonsense.
Write the `## Bycatch` section even if it reads `None observed`.

## The open question still stands

Neither the identity collision nor the read-stream fix explains the
user's original incident: every terminal in every workspace dead at
once, after idling, with the shells still alive. Do not close that
quietly. If round 5 turns up anything touching it, say so. If not, say
that too — it stays open.

## Verification

- Each of the five named checks, run on your branch, quiet:
  `smoke-scrollbars-harness`, `smoke-agent-pane-ux-harness`,
  `smoke-agent-cancel-harness`, `smoke-keyboard-invariant`, and the
  behavioral-contracts job.
- `bun test` in FULL, not focused.
- `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`, invariant
  checker `--all` and `--refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`. I gate
  and land.

## End state

A report file in this folder, newer than this brief's filing stamp,
opening with `## In plain words`, carrying the census count, the
per-site decision, and the invariants answered record by record.
