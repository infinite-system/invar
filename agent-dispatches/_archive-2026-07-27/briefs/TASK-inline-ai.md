# TASK — Inline AI rewrites through a provider port (#98)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-inlineai`
(branch `feat-inline-ai`, forked from main at `d61124d`). Do NOT run `scripts/merge-gate.sh`;
do NOT push/merge/tag/delete — the conductor lands it. Commit and report to
`/tmp/inline-ai-READY.md`. Run `bun install --frozen-lockfile` first.

## What the user asked for, verbatim (two messages, the second refines the first)

> "copilot like code suggestions... routed to smaller Codex Spark model on low effort... (do you
> think you can take a stab at it?) and you have codex spark limits still at 100%"

> "So basically the copilot like functionality must fire after you type in text in editor after
> sometime it analyses your intent and modifies it to suit your need in context, then rewrites if
> you accept (maybe if we could cycle through different variations, that would be going beyond
> copilot even)"

Note the refinement: this is NOT ghost-text-at-caret Copilot. The user wants: you type; after a
quiet period the model analyses INTENT over the recent edit region; it proposes a REWRITE of that
region (possibly multi-line); the user accepts, rejects, or CYCLES through variations.

## Architecture (from the landed taxonomy — hold it)

1. **A provider, not a contributor.** Per *Plugin boundaries grant one authority*: this answers a
   typed question ("given this document, this recent-edit region, this context — what rewrites do
   you propose?"). Define `RewriteProvider` beside `LanguageProvider` in the provider family:
   request carries document text, the edit region, cursor, and language id; response carries an
   ordered list of candidate rewrites (region + replacement text + one-line rationale). The EDITOR
   owns presentation; the provider owns inference. The provider must be swappable (mock in tests,
   codex in production).
2. **Codex backend**: route to codex CLI non-interactively (the `codex exec` shape, low effort /
   spark-class model if the CLI exposes the knob — check `codex exec --help` for model/effort flags
   and use the cheapest). One in-flight request maximum; a newer trigger CANCELS the older (kill the
   child process); responses arriving after the document changed beneath them are DISCARDED (compare
   a document revision captured at request time). The child runs detached from the render loop —
   `idle-quiescence` must stay green while a request is in flight (spinner state may paint on
   arrival, not on a timer).
3. **Trigger**: debounce after typing stops (~1.5–2 s quiet in the editor, only when the buffer is
   dirty and the recent edits are within one region); never while an overlay is open; never in a
   non-editor focus. An explicit chord to request NOW (editor context, through the keybinding
   table, deliverability-proven).
4. **Presentation**: the proposed rewrite paints as a DISTINCT overlay/decoration on the affected
   lines (dim/italic per theme tokens — add vocabulary slots, no hardcoded colors), with a compact
   hint line naming the keys. Accept = apply as ONE undo step. Reject = dismiss. Cycle = next/prev
   variation. Keys: Tab CANNOT be accept in the editor (Tab indents — #91); pick chords that are
   deliverability-proven and do not collide with the reserved set, plugin layers, or completion's
   keys; document the choice. Any ordinary edit keystroke dismisses the proposal and applies the
   keystroke normally — a proposal must never eat typing.
5. **Safety rails**: no request leaves the machine beyond what codex CLI itself does; the feature
   is OFF unless the codex CLI is present, and controlled by a contributed/schema setting
   (`inlineRewrite.enabled`, default on when codex is available); errors degrade silently to
   "no proposal" with a status-projection counter, never a modal.

## Verification — exact exit codes

- Full checker suite.
- **Driven smoke with a MOCK provider** (deterministic): type, wait the debounce, proposal paints,
  cycle variations, accept applies as one undo step, reject dismisses, typing-through dismisses and
  the keystroke lands, stale response discarded (drive: request, then edit before the mock replies,
  assert no paint). Register in the gate pool.
- **One real-codex drive** (not in the gate; an opt-in instrument like the tsgo completion path):
  prove the plumbing reaches real codex once, report its latency, and add a row to
  `project.tools.md`.
- `idle-quiescence` green with the feature enabled and a request in flight.
- Three runs each; one loaded run. Coverage declarations (counted grammar, APPEND).
- Record invariants: one in-flight request, stale responses discarded by revision, a proposal never
  consumes an ordinary edit keystroke.

## Rules

Full descriptive names, 80 columns, ivue conventions, `X.interface.ts`, no `Class.prototype` reads.
Tab indents; host focus chord Ctrl+Shift+J. Fold marks `⌄ ›` and the reserved-mark table are taken.
Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; clean tree; no TASK
files tracked.
