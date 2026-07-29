# project.active-tasks.md — AUTO-GENERATED, NEVER EDIT BY HAND

Every byte of this file is written by `bun scripts/tasks/tasks-status.ts write-active`,
derived from the Priority: field in each task file. Any hand edit is destroyed on the next
regeneration and reads as STALE-ACTIVE-VIEW until then. Prioritisation REASONING is
hand-written in the sibling file `project.active-priority-tasks.md`.
Detail per task: `.invar/tasks/<state>/<folder>/`.

## IN-PROGRESS (1)
- #218 workspace-buffer-splits-document-from-view  [READY delivered — builder idle, awaiting landing]
  `tmux attach -t invar/218-workspace-buffer-splits-document-from-view`

## USER-DIRECTED (2)
- #205 gate-launch-time-and-memory-ceiling
- #199 find-reveal-blank-target-line  [ACTIVE — not yet diagnosed]

## VERIFICATION-INTEGRITY (14)
- #221 editor-owns-no-view-state-uncited
- #216 drive-onramp-quick-open-blind-enumeration
- #215 agent-tmux-send-confirm-false-negative
- #210 mutation-probes-for-semantic-weakening
- #190 pool-membership-must-be-earned  [ACTIVE — premise corrected in place]
- #183 quiet-lock-degrades-and-runs-anyway  [ACTIVE — unfixed, and it has already cost samples]
- #182 collect-until-false-success-wait
- #181 terminal-factory-platform-untested  [ACTIVE — pairs with #180]
- #180 no-smoke-runs-on-macos  [ACTIVE — CRITICAL]
- #179 gate-compares-numbers-to-itself  [ACTIVE — partially addressed; the general form is open]
- #177 gate-retry-ratchet-and-floor  [ACTIVE — needs 3–5 clean gates before the ratchet can tighten]
- #105 unrun-smokes-cannot-report-rot
- #90 harness-diagnostic-provenance-guard
- #75 in-gate-app-crash-undiagnosed  [ACTIVE — reproduced, mechanism still open]

## FLAKE-EVIDENCE (14)
- #214 panel-chrome-agent-close-intermittent
- #213 drive-quit-key-post-quit-frame-wait
- #212 markdown-100k-paste-focus-wait
- #200 input-byte-latency-above-baseline
- #198 selection-harness-pre-satisfied-wheels
- #193 fold-dense-contract-row-shortfall  [ACTIVE — single unexplained miss]
- #176 tabs-harness-retry-only-pass
- #173 grid-predicates-assume-contiguous-text
- #167 audio-narration-pool-timeout
- #166 latency-instrument-crashes-at-one-sample
- #165 glide-canary-zero-margin-boundary
- #164 panel-chrome-ascii-tier-timeout  [ACTIVE — pre-existing, reproduced on BOTH populations]
- #124 terminal-follow-escape-intermittent  [ACTIVE — but see "State discrepancy" below; a fix was demonstrated and may have landed]
- #109 agent-permissions-quiet-tail-flake  [ACTIVE — dispatch condition: no other builder live]

## PERFORMANCE-BEHAVIOUR (9)
- #185 behavioral-contracts-shared-fixtures
- #175 attribute-boot-time-irreducible-cost  [ACTIVE — brief not yet written]
- #160 context-menu-wheel-double-dispatch
- #154 perf-baselines-reach-no-verdict
- #153 overlay-horizontal-fling-slower  [ACTIVE — WAITING ON THE USER (a feel call)]
- #140 real-terminal-freeze-capture  [ACTIVE — deliberately NOT dispatched; waiting on one user check]
- #104 editor-glide-monotonicity-deferred  [ACTIVE (deferred by user decision)]
- #94 popup-arrow-keys-fall-through  [ACTIVE — decision taken, not yet built]
- #86 wheel-first-frame-fixed-latency  [ACTIVE — WAITING ON THE USER (a feel decision, not a defect)]

## ARCHITECTURE-HYGIENE (9)
- #223 database-plugin-proves-provider-seam
- #222 provider-seam-analysis-and-convention
- #220 editor-registers-as-contributor-with-manifest
- #219 source-text-view-onto-pane-content-seam
- #217 split-geometry-aggregates-invariant
- #136 shared-scale-fixture-corpus-cache
- #62 parameter-count-ports-object-sweep
- #35 structure-navigator-plugin-pane  [ACTIVE — sequenced after the #114/#122 capstone]
- #31 getter-census-scoped-invalidation  [ACTIVE — hold, partly overtaken]

## RECENTLY COMPLETED (last 15 of 27 — full log: project.tasks-completed.md)
- #211 horizontal-extent-grid-wait-timeout — b076fef — unreachable wait: faeaa99 wrapped encodeBandsJpeg across rows, so the contiguous-string predicate could never match (#173 class, harness side); smoke now waits on the comment tail with a pre-action hidden assertion; positive control red demonstrated
- #209 mine-session-transcript-for-task-detail — 4e23b88, 3e31e4a
- #208 git-commit-collapse-wiring-gap — merged 15f51dc
- #207 silently-discarded-user-input — fb199cb
- #206 gate-retry-population-repair — eabe010 (merged as fleet/205-flake-population; the label predates this ID)
- #204 drive-tool-step-model-and-targeting — merged 7aa3a7c
- #203 folded-editing-scale-invariance — e479b98
- #202 tab-reactivation-rereads-whole-file — 8d9bd6a — bounded warm set: 2 most-recent clean documents stay hydrated; clean 500k switch 107-113ms -> 12-22ms; 103-tab RSS bounded (+4.9MB); editor smoke updated to the exact warm count with a demonstrated red
- #201 quick-open-silent-empty-enumeration — fb199cb
- #197 lsp-size-budget-guards-reads — 659b649
- #196 editor-flyweight-edit-path
- #195 start-script-drops-path-argument — fb199cb
- #194 reserved-chord-fixture-self-contained — d3721b2
- #192 residual-harness-wait-audit
- #191 terminal-stage-compound-predicate
