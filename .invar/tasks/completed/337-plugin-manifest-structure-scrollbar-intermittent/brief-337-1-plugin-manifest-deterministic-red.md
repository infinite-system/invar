# Brief #337 round 1 — the plugin-manifest gate red went deterministic; find and fix it

Read [CLAUDE.md](../../../../CLAUDE.md) and [AGENTS.md](../../../../AGENTS.md) fully first. Load the /ivue and /invariants
skill docs before governed work. Reason with IBR.

## Why now

This started as a one-sighting intermittent (task file's original body,
plus two more sightings logged in the task file's evidence sections). As
of the #350 gate tonight it is DETERMINISTIC on the base tree: the command
below fails identically with and without unrelated diffs. A deterministic
red in the gate blocks every landing, so this is verification-integrity
work: the gate's trustworthiness is the deliverable.

## Reproduce by driving FIRST

1. Run: bash scripts/smoke-plugin-manifest.sh on current main. Expected
   failure (from the #350 builder): "Timed out waiting for the first Git
   setting is selected". Confirm and capture the failing frame.
2. Also run the harness variant the gate uses (behavioral-contracts step,
   smoke-plugin-manifest-harness — the settings/structure drive).
3. Establish WHEN it went deterministic: this class was intermittent
   earlier tonight. Bisect by driving across tonight's landings if cheap
   (git log --first-parent --since='2026-07-29' main; candidates: #322,
   #335, #334, #336, #339, #340, #342, #351, #350 merges) — find the first
   commit where the smoke fails every time. The answer decides whether
   this is a hardened instrument defect or a real settings-drive
   regression a landing introduced.

## Then fix

- If instrument (the #335-proven class: a settled-geometry/selection wait
  missing what the screen already shows): repair the wait to observe the
  real publisher. Do not widen timeouts. A wait must be a condition.
- If a real regression: name the landing that caused it, fix the product
  code, and add the missing assertion that would have caught it at that
  gate.
- Positive control either way: plant the failure back, see red, remove.

## Rules

- Do NOT run scripts/merge-gate.sh yourself; do NOT use SKIP_GATE. Commit
  normally; the hook runs the gate. A GATE_EXIT=0 chain is part of DONE.
  (Known other pre-existing classes if they bite: #214 panel-chrome,
  #359 panel-split starvation, #360 agent-engine-switch pool flake — name
  them, do not chase them.)
- Builders never push; the conductor lands.

## Invariants in scope

- Harness/gate contracts: [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md) (PTY
  input/output records) and any settings/structure module records the
  failing drive touches (src/modules/settings, src/modules/structure
  contracts). Answer record by record in the READY report: upheld /
  violated / needs refinement, plus records this list missed.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy. Include a ## Bycatch section
even when it reads: None observed.

## Definition of done

READY report in this folder, standard naming (report prefix, number 337,
the task slug, md extension): reproduction evidence, the
deterministic-since commit (or why bisect was not cheap), the fix with
positive control, gate chain, invariants answered, bycatch.
