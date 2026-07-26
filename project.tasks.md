# project.tasks.md — the conductor's task ledger (for review)

The conductor's task list lives in a session, not on disk, so it dies with the session. This file is
the durable copy: every task the current campaign has tracked, its status, and where the evidence is.
In-flight watch paths (live transcripts, worktrees, per-builder briefs) are in
`project.delegation-log.md`; landed branches are tagged `finished/<branch>` and never deleted.

Commits are named ONLY where verified during this session. Older landings say so and point at the
`finished/*` tag namespace rather than guessing a SHA — a wrong SHA in a ledger is worse than none.

Last written: 2026-07-25 20:2x · main at `919e1ad`

## In flight (builders running)

| # | task | branch | status |
| --- | --- | --- | --- |
| 78 | Workspace activation must cost O(depth), not O(repo size) — user report: switching tabs stalls on `blackline-app` / `realized` | `perf-workspace-activation` | codex builder running; diagnosis + measurements handed over, see delegation log |
| 79 | Overlay wheel scrolling: one generator owns the wheel-to-frame obligation — user report: dialogs scroll only by dragging the thumb | `fix-overlay-wheel-scroll` | codex builder running; diagnosis handed over |
| — | coverage ratchet (feature, not a numbered task) | `feat-coverage-ratchet` | gating now; adds `scripts/check-coverage-ratchet.ts` + the *Coverage may fall but never silently* invariant |

## Pending — ordered by what I would do next

| # | task | why it is not done yet |
| --- | --- | --- |
| 68 | Icon vocabulary pass: activity-bar glyphs + panel heading controls (glyph, tooltip, hover, softer close) | user-requested; needs rendered previews for veto before landing a vocabulary |
| 72 | Code-aware wrap break opportunities: one break-opportunity generator, prose and code profiles | user-requested (letter breakoffs look ugly in the editor); wants the same generator as the agent pane's word wrap |
| 76 | Replace clock-based silence/duration assertions with frame-ordering and frame-count assertions | THE structural fix behind today's flakes; collapses the gate's quiet tail. Origin: the user's "why stop at 600ms instead of waiting for it to appear" |
| 62 | Parameter-count sweep: >3 args → ports object (hot paths exempt) + convention + report-only checker rule | user-requested; `buildRootView` was the trigger |
| 64 | Follow-injected turns can strand the spinner: terminal-state guarantee for observation turns | correctness follow-up to the agent terminal-follow setting |
| 73 | Type-aware audit for dropped reactive signals (no runtime helper, no new idiom) | the `.value`-drop class; the user rejected both a syntactic lint and a `track()` helper, so it must be type-aware |
| 75 | In-gate app crash (exit 1) with no diagnosable reason | instrumentation landed (`3efee3d` exit-evidence tail); waiting for the next occurrence to read |
| 77 | Close the coverage-ratchet's remaining holes: self-verifying records, then mutation probes | deliberately NOT dispatched while user-reported bugs are unmerged |
| 59 | Prettier whole-repo reformat + blank-line rule + gate enforcement | must land LAST — it touches every file and would conflict with every open branch |
| 31 | Post-campaign: getter census → scoped invalidation | performance follow-up, no user-visible symptom yet |
| 33 | Capsule arc: per-workspace agent/terminal/membrane → clone-install → harness-builder | architecture arc, large |
| 34 | Plugin-canvas refactor: Workspace stops knowing Git | architecture arc, large |
| 35 | Structure navigator pane — first new plugin citizen | depends on 34 |
| 46 | TerminalObserver: reverse presence (user terminal → agent event stream) — waves 3-4 remain | partially delivered; remaining waves not started |

## Completed this campaign

Verified commits (this session):

| # | task | landed |
| --- | --- | --- |
| 74 | Bound the harness's diagnostic byte retention; make the output audit streaming | `3efee3d` (gate 373s) |
| 40 | Gate optimization: parallel smoke pool + serial quiet tail | `5dd8575` (pool 4m50s vs 8m03s serial; 32 parallel / 21 quiet buckets) |
| 70 | Nothing paints above a modal: hide the terminal cursor, withdraw terminal graphics | `6156999` + contract fix `47802a8` (70 + 23 driven probes) |
| 66 | Breadcrumb segment picker with drill-in navigation | `3a1f2d1` (gate 296s; also closed the last text-input census entry) |
| 63 | Overlay dialogs: vertical scrollbar, fit-on-resize, top close button, click-outside dismissal | click-outside landed `dcd2f1e` |
| 69 | One text-input primitive installed everywhere | `2fbd5c8` (`TextInputModel`) |
| 65 | Vertical scrollbar thumb breathing (regression) | `ccc8c0e` — culprit bisected to `341590c`, fixed at the `SolidThumbScrollBar` generator |
| 67 | Invar agent has no skills/CLAUDE.md | `70a438b` (`AgentPromptResolver` + `settingSources`) |
| 44 | Interface filename convention: `X.interface.ts` | `8aa0eff` |

Landed earlier in the campaign (commits in the `finished/*` tag namespace and
`project.delegation-log.md`, not restated here):

| # | task |
| --- | --- |
| 29 | Land tab-gap + latency-proxy repair on gate green |
| 30 | Campaign: port all smokes to PTY harness (user-adopted) |
| 32 | Sweep: detached helpers → protected members + gate rule |
| 36 | Terminal UX pack: staged execution + themed prompt + live header cwd |
| 37 | Land the smoke swap: harness gate + 4-smoke tmux sentinel ring |
| 38 | Land narration inline-code fix (user bug) |
| 39 | Switchlag + thumb-oscillation investigation on a quiet machine |
| 41 | Land input-correctness pack (emoji typing, copy/paste, word ops) |
| 42 | Fix gutter-diff stale-head cross-file comparison (106ms/350ms switch cost) |
| 43 | Layout & splitter uniformity: one splitter seam, right pane dock, full-height sidebar |
| 45 | BoundedListPopup seam: buffer dropdown + branch selector (+ layouts menu) |
| 47 | Narration garble round 2: remaining unspeakable token classes |
| 48 | Separate agent pane from terminal panel: own heading |
| 49 | Layout settings inert: panel alignment, right-dock vertical span |
| 50 | Horizontal scroll slower than vertical, lost smoothness (regression) |
| 51 | Panel & status-bar UX: taller panel, click-to-split, time + right-dock control |
| 52 | Agent pane word-boundary wrap + composer right padding |
| 53 | Agent terminal-follow setting (follow all / on-error / on-request / off) |
| 54 | Sweep residual sample-without-wait (`requireCondition` on async state) |
| 55 | Agent turn cancel via Escape + stuck-spinner liveness (the 2-hour hang) |
| 56 | Message queueing: compose and post while the agent replies |
| 57 | Panel content ordering + terminals/agents mini-panel; agent-left default |
| 58 | Layout distillation round 2: right-dock full-height, named presets |
| 60 | BoundedListPopup search bar: hover highlight + focus retention |
| 61 | LSP autocomplete through the universal LanguageProvider contract |
| 71 | Terminal wheel scrolling with momentum + agent thumb input-stability audit |

## How to check up on any of these

- Live builder transcript, worktree, brief, and report path per in-flight task:
  `project.delegation-log.md` (most recent section).
- A landed branch's exact change: `git show finished/<branch>` — branches are parked and tagged,
  never deleted.
- Why a decision was made the way it was: `project.decisions.md`.
- What the gate enforces and why each check exists: the comments in `scripts/merge-gate.sh`.
- Orchestration lessons (what went wrong and the rule earned): `project.conductor.md`, and the
  longer write-up in `~/dev/ibr/Skills/Orchestration Lessons.md`.
