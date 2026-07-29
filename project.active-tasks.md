# project.active-tasks.md — AUTO-GENERATED, NEVER EDIT BY HAND

Every byte of this file is written by `bun scripts/tasks/tasks-status.ts write-active`,
derived from the Priority: field in each task file. Any hand edit is destroyed on the next
regeneration and reads as STALE-ACTIVE-VIEW until then. Prioritisation REASONING is
hand-written in the sibling file `project.active-priority-tasks.md`.
Detail per task: `.invar/tasks/<state>/<folder>/`.

## IN-PROGRESS (2)
- #259 right-dock-click-leaves-double-focus  [building]
  `tmux attach -t invar/259-right-dock-click-leaves-double-focus`
- #235 tasks-dashboard-pane-live-active-done  [building]
  `tmux attach -t invar/235-tasks-dashboard-pane-live-active-done`

## USER-DIRECTED (4)
- #263 terminal-shrink-markdown-split-frozen
- #256 editor-stray-glyph-after-emoji
- #205 gate-launch-time-and-memory-ceiling
- #199 find-reveal-blank-target-line  [ACTIVE — not yet diagnosed]

## VERIFICATION-INTEGRITY (21)
- #269 smokes-assume-editor-geometry-sweep
- #266 drive-settle-ignores-debounced-parse
- #265 status-projection-drops-plugin-keys
- #261 drive-harness-drops-shifted-control-chords
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

## FLAKE-EVIDENCE (18)
- #260 first-click-of-a-session-lands-nowhere
- #257 last-row-right-border-blank-cell
- #255 extensions-row-locator-wrapped-label
- #252 activitybar-smoke-pre-satisfied-waits
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

## ARCHITECTURE-HYGIENE (12)
- #267 go-to-line-does-not-exist
- #262 structure-activity-action-orphaned
- #242 shared-paint-hit-generator-decision
- #241 ui-contract-split-decision
- #234 navigation-getters-and-hop-depth-ratchet
- #228 source-text-keys-through-pane-context
- #226 clock-freeze-hook-and-getter-conversion
- #224 momentum-ambient-clock-default-parameter
- #217 split-geometry-aggregates-invariant
- #136 shared-scale-fixture-corpus-cache
- #62 parameter-count-ports-object-sweep
- #31 getter-census-scoped-invalidation  [ACTIVE — hold, partly overtaken]

## RECENTLY COMPLETED (last 15 of 49 — full log: project.tasks-completed.md)
- #268 editor-smoke-vs-auto-open-red-main — 5c9965a4 — editor smoke measures the pane; red main cleared
- #264 boot-save-erases-unregistered-settings — 4cc0f68a — persistenceSnapshot round-trips unknown keys; boot save no longer erases contributed settings
- #254 gate-workers-validated-after-side-effects — 93bd4c2c — workers guard joins preflight; violation reproduced then proven absent, both polarities
- #253 ui-contract-systematic-citation-sweep — ad6abff4 — all 244 fields verified via census table; checker refuses short paths repo-wide
- #251 gate-refuses-unlinked-node-modules — 0da7803e — dependency preflight, distinct exit 3, three control arms proven outside the gate
- #245 provider-seam-open-or-bless-decision — b2bd2e57 — one registry census-proven; SQLite+fake+consumer proof; both workarounds deleted
- #244 sdk-binary-extraction-leak-fills-disk — c44c23db — lazy SDK import at first send; bounded boot/exit reaper; permanent extraction smoke
- #243 ui-contract-sibling-rot-round-two — 44d8def4 — five citation repairs AST-verified; 1027/217/0; rot NOT exhausted — systematic sweep filed
- #239 ui-contract-citation-repairs — 83695510 — six citation repairs, AST-verified owners, duplicated paragraph removed; 993/217/0 stable; three more rots found reading neighborhoods -> #243
- #238 structure-default-right-and-md-toc — 578b728a — structure default-ON right + md TOC; smoke fleet adapted to real defaults
- #237 markdown-preview-left-and-auto-open — d42f2af0 — auto-open + left placement + per-document dismissal; five bycatch filed incl. the settings eraser
- #236 markdown-terminal-stylesheet-readable — 06580a9f — one stylesheet seam census-proven; padding, quotes, fences, lists, CJK wrapping; scale parity at 100k
- #233 wrap-contract-red-settings-leak — 3a1172c0 — harness-only: isolated per-run HOME/XDG, pinned geometry, settle race fixed; settings exonerated by hash
- #230 author-ui-lattice — c669256f — ui.lattice.md authored: five generators, three recurring shapes, eight compositions; 77->217 resolved links, 0 problems, all 61 records woven; six-finding bycatch converted to #239-#242
- #222 provider-seam-analysis-and-convention — merged docs-only — classification (9 effectful, 2 pure), convention 12 + gate rule with 5 controls, DataStore cursor seam, minimal set 3 files; corrected the brief twice; bycatch filed as #224-#226
