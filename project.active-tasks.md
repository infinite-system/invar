# project.active-tasks.md — AUTO-GENERATED, NEVER EDIT BY HAND

Every byte of this file is written by `bun scripts/tasks/tasks-status.ts write-active`,
derived from the Priority: field in each task file. Any hand edit is destroyed on the next
regeneration and reads as STALE-ACTIVE-VIEW until then. Prioritisation REASONING is
hand-written in the sibling file `project.active-priority-tasks.md`.
Detail per task: `.invar/tasks/<state>/<folder>/`.

## IN-PROGRESS (3)
- #239 ui-contract-citation-repairs  [building]
  `tmux attach -t invar/239-ui-contract-citation-repairs`
- #233 wrap-contract-red-settings-leak  [building]
  `tmux attach -t invar/233-wrap-contract-red-settings-leak`
- #35 structure-navigator-plugin-pane  [building]
  `tmux attach -t invar/35-structure-navigator-plugin-pane`

## USER-DIRECTED (6)
- #238 structure-default-right-and-md-toc
- #237 markdown-preview-left-and-auto-open
- #236 markdown-terminal-stylesheet-readable
- #235 tasks-dashboard-pane-live-active-done
- #205 gate-launch-time-and-memory-ceiling
- #199 find-reveal-blank-target-line  [ACTIVE — not yet diagnosed]

## VERIFICATION-INTEGRITY (17)
- #240 momentum-records-placement-call
- #232 file-tree-empty-outside-git-repo
- #231 agent-tmux-launch-and-list-defects
- #229 scale-parity-selection-smoke
- #227 dispatch-cuts-worktree-after-record-commit
- #225 system-invariants-rotted-enumeration
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

## ARCHITECTURE-HYGIENE (11)
- #242 shared-paint-hit-generator-decision
- #241 ui-contract-split-decision
- #234 navigation-getters-and-hop-depth-ratchet
- #228 source-text-keys-through-pane-context
- #226 clock-freeze-hook-and-getter-conversion
- #224 momentum-ambient-clock-default-parameter
- #223 database-plugin-proves-provider-seam
- #217 split-geometry-aggregates-invariant
- #136 shared-scale-fixture-corpus-cache
- #62 parameter-count-ports-object-sweep
- #31 getter-census-scoped-invalidation  [ACTIVE — hold, partly overtaken]

## RECENTLY COMPLETED (last 15 of 35 — full log: project.tasks-completed.md)
- #230 author-ui-lattice — c669256f — ui.lattice.md authored: five generators, three recurring shapes, eight compositions; 77->217 resolved links, 0 problems, all 61 records woven; six-finding bycatch converted to #239-#242
- #222 provider-seam-analysis-and-convention — merged docs-only — classification (9 effectful, 2 pure), convention 12 + gate rule with 5 controls, DataStore cursor seam, minimal set 3 files; corrected the brief twice; bycatch filed as #224-#226
- #221 editor-owns-no-view-state-uncited — merged contract-only — record subsumed and folded clause-by-clause (12->11 records, 67->77 lattice links, new composition); pointer left in place; checker 973/77/0; first consumer of #216 fixed on-ramp
- #220 editor-registers-as-contributor-with-manifest — 219f160a — eighth DefaultPlugins contributor with uninstall symmetry; release goes THROUGH the buffer set (the fourth-verse reversibility fix); EditorColumnDefault beside EditorSurfaceContents; empty column states its affordance; censuses honest; fingerprints unchanged; ran at medium
- #219 source-text-view-onto-pane-content-seam — 43b6002 — PaneContent grew native-surface (who paints); editor is a citizen via SourceTextPaneContent + PaneProjection; paint-then-selection ordering became a tested invariant; release path ready for #220; fingerprints unchanged at 10/100k/500k; boundaries filed as #228, #229
- #218 workspace-buffer-splits-document-from-view — 2e36ed83 — workspace holds documents plus view handles via SourceTextViewProvider; casts replaced by the recorded creator invariant; TextCursor/TextViewport extracted; fold state document-adjacent; #219 boundary mapped in the report
- #216 drive-onramp-quick-open-blind-enumeration — 03b61df — Quick Open publishes degraded (never a false complete) with a recovery message; drive fixtures in system temp outside the ignored path; codex-ships-ripgrep caught by PATH surgery; one-sighting probed 3x, no repro, parked
- #215 agent-tmux-send-confirm-false-negative — 7968d49f — claude confirm keys on the bottom composer frame (structure, not strings); codex signature kept; dispatch waits 15s for the cwd-derived session file; planted false-positive shape reds the contract; bycatch filed as #231
- #211 horizontal-extent-grid-wait-timeout — b076fef — unreachable wait: faeaa99 wrapped encodeBandsJpeg across rows, so the contiguous-string predicate could never match (#173 class, harness side); smoke now waits on the comment tail with a pre-action hidden assertion; positive control red demonstrated
- #209 mine-session-transcript-for-task-detail — 4e23b88, 3e31e4a
- #208 git-commit-collapse-wiring-gap — merged 15f51dc
- #207 silently-discarded-user-input — fb199cb
- #206 gate-retry-population-repair — eabe010 (merged as fleet/205-flake-population; the label predates this ID)
- #204 drive-tool-step-model-and-targeting — merged 7aa3a7c
- #203 folded-editing-scale-invariance — e479b98
