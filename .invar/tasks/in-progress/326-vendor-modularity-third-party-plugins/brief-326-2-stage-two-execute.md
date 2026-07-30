# Brief #326 round 2 — STAGE 2 GO (user, 2026-07-30): execute the revised plan

Read [AGENTS.md](../../../../AGENTS.md) fully before any work. Load
[.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md) and the
ivue skill. Then read IN THIS FOLDER: the stage-1 report (the revised plan:
runtime install via signed registry artifacts, network-edge gating,
declared kernel overrides) and the task file's "User guidance" section —
in-app restart on install, VS Code model: stage artifact -> "restart to
apply" affordance -> the app relaunches ITSELF preserving workspace/session
state -> plugin composes at kernel seal on the way back up.

The user gave the explicit GO for stage 2. Execute the plan as revised:

1. Follow the stage-1 plan's own sequencing. Where the plan and this brief
   disagree, the plan file wins; report the disagreement.
2. The in-app restart is part of stage 2's definition of done: install
   without manual reboot, driven end-to-end in the harness (fixture
   registry, fake signed artifact, relaunch, plugin active after).
3. Network-edge gating and signature verification get positive controls:
   an unsigned/tampered artifact must be REFUSED loudly (quote the red).
4. Respect the kernel seal invariant: composition only before seal; the
   relaunch is what makes that compatible with runtime install.
5. Final pass: relevant smokes + `bunx tsc --noEmit; echo TSC=$?` +
   invariants checker --all --refs. Let the commit hook run the gate; known
   pre-existing red classes to quote-not-chase: #214 panel-chrome, #337
   structure-outline.

No push/merge/tag. Append your READY report to this folder as
`report-326-stage-two.md`. END STATE: that file exists with driven evidence
per plan item. If the plan needs a decision only the user can make, STOP at
that item, list the decision crisply in the report, and finish everything
decidable — the user is asleep; do not guess irreversible calls.

## Invariants in scope

- project.invariants.md kernel records ("The app is built only after the
  kernel is sealed", "Construction goes through overridable seams") — the
  relaunch design must uphold, not weaken, the seal.
- plugins/extensions contract records; tasks contract untouched. Report
  each implicated record; name any this list MISSED.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; section present even if
"None observed".
