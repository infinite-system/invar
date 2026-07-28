# TASK — Activity-bar order is a persisted property, not registration order (#113 + #128)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-activityorder`
(branch `fix-activity-bar-order`, forked from latest main). Do NOT run `scripts/merge-gate.sh`;
do NOT push/merge/tag/delete branches — the conductor does that. Commit in the worktree and
report to `/tmp/activity-order-READY.md`.
Setup: `export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile`.

Other builders own `src/modules/editor` (fold/scroll work) and the inline-rewrite files
(`InlineRewrite*`). Stay out of both.

## The user, verbatim

Finding 5 (earlier):
> "Nice work on Git / FileTree / Markdown, but when i enable re-enable them, the icons in
> activity bar change positions, we need a way to re-order them, could that be done via drag
> and drop"

Finding 16 (later, while testing):
> "btw regression, agent panel is on right side by default from terminal, but should be on the
> left side, but i just tried dragging the items in list which says Agent / Terminal and it
> reordered, that's nice, but we also wanted the re-order to work in the activity bar for the
> plugins buttons, in the pipeline already?"

## Both findings are ONE mechanism

The panel content list already does this right: `Settings.panelContentOrder` is a persisted
`string[]` of content ids (default `['agent', 'terminal']`, `src/modules/settings/Settings.ts`),
the panel host derives its order from it, and drag-reorder writes it. The activity bar does NOT:
`ActivityBar` reads `this.dependencies.primaryDockHost.orderedContents` — so its order is a
function of REGISTRATION order, which is why toggling a plugin off and on moves its icon.

The reduction: **visible order is a persisted property keyed by stable content id — never
registration order, never array position.** Registration contributes MEMBERSHIP; the persisted
list contributes ORDER. Do this once, the same way the panel list already does it, so the two
surfaces share the generator rather than each rolling their own.

## Work item 1 — #113 activity-bar order

1. A persisted order for the primary dock, keyed by content id, in the same shape and with the
   same validation/dedup discipline as `panelContentOrder` (see `Settings.ts` around
   lines 193/532/662 — the existing sanitizer dedups via `new Set` and rejects non-arrays; match
   it, and prefer EXTRACTING the shared sanitizer over copying it if the two are identical).
2. Ordering rules that must hold:
   - An id in the persisted list keeps its slot across disable → re-enable (this is the user's
     bug: the icon must return to WHERE IT WAS, not to the end and not to the front).
   - An id NOT in the persisted list (a newly installed plugin the user has never ordered)
     appends deterministically at the end — never inserted mid-list.
   - An id in the persisted list that has no registered content is inert, not a gap or a crash.
3. Drag-and-drop reorder in the activity bar, using whatever primitive the panel content list
   already uses for its drag-reorder — find it and reuse it. If it is not reusable as-is, say so
   in the report with the reason, and extract the shared generator rather than writing a second
   drag implementation. (House rule: one generator per behaviour; a second copy is the defect.)
4. Keyboard-reachable equivalent for the reorder, consistent with how the panel list does it, if
   the panel list has one. If it does not, do NOT invent one here — note it in the report.

## Work item 2 — #128 agent-left default regression

The default is ALREADY `['agent', 'terminal']` in `Settings.ts:532`, and the user says dragging
works, so DO NOT assume the default constant is wrong. **Measure before you conclude.** Ranked
hypotheses to test in this order:

1. **Stale persisted value in the user's real HOME.** `settings.json` in the live HOME may carry
   `['terminal','agent']` from an earlier session, so the default only ever applies to a fresh
   profile. Test with an isolated `HOME=$(mktemp -d)` run (repo rule: any smoke that mutates
   settings MUST use a per-run mktemp HOME — the harness HOME is shared and persistent) and
   compare against a run with a planted terminal-first settings file. If this is the cause, the
   user's own file explains it and there may be NO code defect — say that plainly, and then say
   whether a migration/repair is warranted or whether the user simply needs to re-drag.
2. **Default not reaching the host**: the persisted default exists but the panel host resolves
   its initial order from registration/attachment order before settings attach, so first paint
   is registration-ordered. Check the attach sequence in `Bootstrap.ts` (`contentOrder:
   settings.panelContentOrder`, line ~218) against when the agent and terminal contents register.
3. **Sanitizer drops the default**: the validation path at `Settings.ts:662` rejects or rewrites
   the stored value and falls back to something other than the declared default.

Report which hypothesis measurement supported, with the evidence. A structural read is a
hypothesis, not a finding.

## Verification — drive the real user path, report exact exit codes

- `bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
  `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
  `bun scripts/check-coverage-ratchet.ts`.
- A DRIVEN smoke (real app through the harness, not a unit test) proving the user's exact
  sequence: fresh mktemp HOME → assert agent is LEFT of terminal on first paint → disable a
  plugin (git or markdown) → re-enable it → assert its activity-bar icon returned to the SAME
  index it held before → drag it to a new index → assert the new order → restart the app in the
  same HOME → assert the dragged order PERSISTED. Run it 3x and report all three exit codes.
- The disable/re-enable position assertion must be able to FAIL: prove it by running it against
  the pre-fix behaviour (or by temporarily reverting to registration order) and showing the red.
  A check that can only pass is not an instrument.
- Coverage declarations appended per the ratchet's counted-grammar format.

## Rules

Full descriptive identifier names — no abbreviations (`index` not `i`, `increment` not `inc`).
80 columns. ivue conventions: `Static()` / `Reactive()`, `protected` floor, `X.interface.ts`,
file-name-follows-class, never read `Class.prototype.<member>`, subclass `$Class` (never `Class`)
for test doubles. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; leave the tree clean.
