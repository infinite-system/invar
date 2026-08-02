# Brief #459 round 4 — the behaviour changed; its consumers did not

## In plain words

The gate found six red smokes. At least two of them assert the old
behaviour you deliberately removed. Sweep every consumer of what
changed, do not patch the six.

## The gate verdict

`/tmp/gate-459.log` on the merged tree: six failures.

```text
FAIL smoke: workspace tabs harness
FAIL smoke: workspace layout isolation harness
FAIL smoke: panel-split harness
FAIL smoke: tasks harness
FAIL smoke: settings-applied harness
FAIL smoke: shortcut-help harness
```

Failure logs: `/tmp/merge-gate-failures.90a0c83739b4887b.859565/`.

## Two are consumers of the removed behaviour

**`panel-split`** — asserts the thing the user removed:

```text
Timed out waiting for nerd terminal frame close opens the generic
confirmation dialog
```

Instance close no longer opens a dialog. Update the assertion to the
ruling: closing one instance paints NO dialog; a CONTAINER close still
confirms and states the count. Do not restore the dialog to make a
smoke pass.

**`settings-applied`** — asserts the defect you just fixed:

```text
status.panelContentKinds.join(',') === 'agent,terminal,database' &&
status.panelCellKinds.join(',') === 'terminal'
```

That expectation IS the phantom registration: three registered kinds,
one cell. It encoded a registry-versus-view divergence as correct.
Under the new record `Every registered panel content is reachable`,
that state cannot exist. Update the expectation to the reachable set —
and say in the report what the correct set now is and why.

## Two need an A/B before you assume anything

**`workspace-tabs`** — `the second workspace projects only its declared
task pane`. **`tasks`** — `The pinned panel list did not paint
Displaced`.

These may be consumers too, or they may be real breakage from the
factory seam. Run each on plain `main` and on your branch, quiet and
serial, and report both results. Do not assume the change is innocent
because the other four were consumers, and do not assume it is guilty
because it is adjacent. The conductor has been wrong repeatedly this
week by skipping exactly this step.

**`shortcut-help`** is a known pre-existing flake, 1-2 of 5 runs on
unchanged commits, tracked under #457. Confirm it reproduces on main
and then leave it alone.

## The actual lesson — sweep, do not patch

This is the same shape as #452 two days ago: a behaviour changed and
its consumers were not enumerated, so the gate found them one at a
time. Fixing these six individually reproduces the mistake.

Enumerate mechanically. For the removed dialog: every assertion,
helper, and status expectation naming the confirmation. For the
reachability change: every expectation over `panelContentIds`,
`panelContentKinds`, `panelContentLabels` that assumes a registration
without a cell. Report the census count, then fix the census.

Your round 1-3 verification reported `bun test` in full and several
smokes green. Six smokes disagree. Say plainly which of them you
actually ran and which you did not — that gap is a finding about the
verification instruction, not a fault to hide.

## Invariants in scope

- [Every registered panel content is reachable](../../../../src/modules/ui/ui.invariants.md) —
  ACCEPTED and now recorded, with your wording. `settings-applied`'s
  old expectation contradicts it directly.
- [One dialog component serves confirms and prompts](../../../../design.invariants.md) —
  Scope refined to `panel-container close`, as you proposed.
- [The panel contents list mirrors open content](../../../../src/modules/ui/ui.invariants.md) —
  you proposed refining it for the empty-panel Add row. Propose the
  wording now; it was not applied.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Verification

- All six named smokes, run on your branch, quiet.
- `bun test` in FULL, `bunx tsc --noEmit`,
  `bash scripts/conventions-gate.sh`, invariant checker `--all --refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## End state

The report gains a round 4 section: the consumer census count, the
per-smoke verdict with A/B results for the two unclear ones, and an
honest statement of what was and was not run in earlier rounds.
