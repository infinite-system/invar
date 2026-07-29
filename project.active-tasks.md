# project.active-tasks.md — AUTO-GENERATED, NEVER EDIT BY HAND

Every byte of this file is written by `bun scripts/tasks/tasks-status.ts write-active`,
derived from the Priority: field in each task file. Any hand edit is destroyed on the next
regeneration and reads as STALE-ACTIVE-VIEW until then. Prioritisation REASONING is
hand-written in the sibling file `project.active-priority-tasks.md`.
Detail per task: `.invar/tasks/<state>/<folder>/`.

## USER-DIRECTED (3)
- #199 find-reveal-blank-target-line  [ACTIVE — not yet diagnosed]
- #202 tab-reactivation-rereads-whole-file
- #205 gate-launch-time-and-memory-ceiling

## VERIFICATION-INTEGRITY (11)
- #105 unrun-smokes-cannot-report-rot
- #177 gate-retry-ratchet-and-floor  [ACTIVE — needs 3–5 clean gates before the ratchet can tighten]
- #179 gate-compares-numbers-to-itself  [ACTIVE — partially addressed; the general form is open]
- #180 no-smoke-runs-on-macos  [ACTIVE — CRITICAL]
- #181 terminal-factory-platform-untested  [ACTIVE — pairs with #180]
- #182 collect-until-false-success-wait
- #183 quiet-lock-degrades-and-runs-anyway  [ACTIVE — unfixed, and it has already cost samples]
- #190 pool-membership-must-be-earned  [ACTIVE — premise corrected in place]
- #210 mutation-probes-for-semantic-weakening
- #75 in-gate-app-crash-undiagnosed  [ACTIVE — reproduced, mechanism still open]
- #90 harness-diagnostic-provenance-guard

## FLAKE-EVIDENCE (12)
- #109 agent-permissions-quiet-tail-flake  [ACTIVE — dispatch condition: no other builder live]
- #124 terminal-follow-escape-intermittent  [ACTIVE — but see "State discrepancy" below; a fix was demonstrated and may have landed]
- #164 panel-chrome-ascii-tier-timeout  [ACTIVE — pre-existing, reproduced on BOTH populations]
- #165 glide-canary-zero-margin-boundary
- #166 latency-instrument-crashes-at-one-sample
- #167 audio-narration-pool-timeout
- #173 grid-predicates-assume-contiguous-text
- #174 markdown-preview-omits-ragged-table
- #176 tabs-harness-retry-only-pass
- #193 fold-dense-contract-row-shortfall  [ACTIVE — single unexplained miss]
- #198 selection-harness-pre-satisfied-wheels
- #200 input-byte-latency-above-baseline

## PERFORMANCE-BEHAVIOUR (9)
- #104 editor-glide-monotonicity-deferred  [ACTIVE (deferred by user decision)]
- #140 real-terminal-freeze-capture  [ACTIVE — deliberately NOT dispatched; waiting on one user check]
- #153 overlay-horizontal-fling-slower  [ACTIVE — WAITING ON THE USER (a feel call)]
- #154 perf-baselines-reach-no-verdict
- #160 context-menu-wheel-double-dispatch
- #175 attribute-boot-time-irreducible-cost  [ACTIVE — brief not yet written]
- #185 behavioral-contracts-shared-fixtures
- #86 wheel-first-frame-fixed-latency  [ACTIVE — WAITING ON THE USER (a feel decision, not a defect)]
- #94 popup-arrow-keys-fall-through  [ACTIVE — decision taken, not yet built]

## ARCHITECTURE-HYGIENE (8)
- #114 modularity-umbrella-provider-runtime  [ACTIVE — Wave A landed, Wave B open]
- #122 editor-becomes-final-contributor  [ACTIVE — blocked, strictly after #114]
- #136 shared-scale-fixture-corpus-cache
- #31 getter-census-scoped-invalidation  [ACTIVE — hold, partly overtaken]
- #35 structure-navigator-plugin-pane  [ACTIVE — sequenced after the #114/#122 capstone]
- #46 terminal-observer-reverse-presence  [ACTIVE — design doc exists, no branch cut]
- #59 prettier-format-gate-and-reformat  [ACTIVE — deliberately LAST]
- #62 parameter-count-ports-object-sweep

