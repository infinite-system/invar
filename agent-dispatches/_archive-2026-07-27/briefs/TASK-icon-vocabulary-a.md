# TASK — Install icon vocabulary Candidate A, and stop the smokes reading glyph text

You are a builder on the Invar terminal IDE. Work ONLY in this worktree. Do NOT run
`scripts/merge-gate.sh`, do NOT push, merge, tag, or delete branches — the conductor does that. Commit
to this branch when the work is done and report.

## What the user asked for

The user reviewed three rendered icon candidates and said: "i like the icons you proposed, use them."
Install **Candidate A — Familiar outline**, exactly the codepoints below. This is a user decision about
vocabulary; do NOT substitute your own taste for any glyph.

Slot order — activity: tree, git, plugins, search, settings. Heading: add, expand, restore, close.

```
nerd     activity  U+F07B  U+E702  U+F487  U+F002  U+F013
         heading   U+F067  U+F065  U+F066  U+F00D
unicode  activity  ▤ U+25A4   ⎇ U+2387   ⊞ U+229E   ⌕ U+2315   ⚙ U+2699
         heading   + U+002B   ↗ U+2197   ↙ U+2199   × U+00D7
ascii    activity  F  G  X  /  *
         heading   +  >  <  x
```

Two of these change what is already landed (`activitySourceControl` U+F126 → U+E702,
`activityExtensions` U+F12E → U+F487). The four heading slots are currently the WORD placeholders
`'+'`, `'EXPAND'`, `'RESTORE'`, `'X'` — deliberately left as words so the vocabulary landed without
changing appearance under the user. Now they become real glyphs.

The table is `ThemeIcons.$interfaceGlyphVocabularies` in `src/modules/theme/ThemeIcons.ts`. Changing
it is a data edit. That is by design — see the invariant *Appearance is data with a capability
fallback*.

## The actual work: the smokes are coupled to the vocabulary

This is why the task is not a one-line edit. Three drivers locate heading controls by their RENDERED
LABEL, and one of them derives geometry from the label's WIDTH:

- `scripts/harness/smoke-panel-chrome-harness.ts` — `clickHeadingAction(driver, 'EXPAND'|'RESTORE',
  action)` waits for `candidate.findText(marker)`, then clicks `position.column - 3` for the add
  control. That `- 3` is the width of the word `EXPAND` reasoned about by hand. With a one-cell glyph
  it silently clicks the wrong cell — a MIS-CLICK, not a clean failure.
- `scripts/harness/smoke-scrollbars-harness.ts` (~line 1333) — waits on `findText('EXPAND')` and
  `clickText(..., 'EXPAND')`.
- `src/modules/theme/ThemeIcons.test.ts` — asserts the literal words for the four slots.
- `scripts/smoke-agent-pane-ux.sh` and `scripts/smoke-workspace-tabs.sh` also mention the words; check
  whether they assert on them and fix the same way if so.

A test that finds a control by its appearance re-breaks on every vocabulary change, which contradicts
the very invariant that makes appearance data. **Fix the coupling, not the strings.** The app already
computes exactly what the smokes need: `PanelHeading.project()` returns `controlSegments` with each
control's `action` and its column span, and paint and hit geometry come from that same computation
(invariant: *Panel heading controls share paint and hit geometry*).

Required shape:

1. Expose the heading controls' geometry (action + column span + row, and the hovered action) through
   the status projection the harness already reads — `src/modules/app/AppStatusProjection.ts`. Follow
   the existing precedent there: `boundedListPopupGeometry`, `panelListGeometry`, `layoutSlots` are
   all regions published for exactly this purpose. Do not invent a second mechanism.
2. Rewrite `clickHeadingAction` to take the ACTION (`'add' | 'expand' | 'close'`) and click the centre
   of that action's published span. No `findText`, no column arithmetic, no label argument. Same for
   the scrollbars smoke's expand click.
3. `ThemeIcons.test.ts` asserts the new codepoints per tier, plus the properties that must hold for
   ANY future vocabulary: every glyph in every tier measures exactly one display cell under
   `EditorCoordinates.Class.lineWidth`, and no slot collides with the reserved markers `▎` (diff), `●`
   (dirty), or `❯` (powerline separator). Those property assertions are the durable part.
4. Tooltips stay as they are (`Add panel` / `Expand panel` / `Restore panel` / `Close panel`) — with
   glyphs replacing words, the tooltip is now the only place the meaning is spelled out, so verify by
   driving that hovering each control still shows its text.

## Verify by driving — this is the acceptance test

Measurement is not enforcement. You must drive the real user path:

- Hover each of the three heading controls and assert the hover highlight lands on the control's own
  span (not one cell off) and that its tooltip text appears.
- CLICK each control through the new action-addressed path and assert the effect: add opens the panel
  popup, expand expands, restore restores, close closes.
- Prove the ascii tier still works: run the same drive with the ascii glyph level forced, since a
  no-Nerd-Font terminal is a real user configuration.
- Run `bun test src/modules/theme src/modules/ui` and the harness smokes you touched
  (`bun scripts/harness/smoke-panel-chrome-harness.ts`, `bun scripts/harness/smoke-scrollbars-harness.ts`,
  `bun scripts/harness/smoke-activitybar-harness.ts`). Note `smoke-activitybar-harness.ts` asserts the
  OLD nerd codepoints U+F126 / U+F12E around line 125 — update it to the new ones.

## Rules

- Full descriptive identifier names, no abbreviations (`increment` not `inc`). Match surrounding style.
- `Static()` / `Reactive()` ivue conventions; `protected` floor; file-name-follows-class.
- Read `src/modules/ui/ui.invariants.md` and `src/modules/theme/theme.invariants.md` BEFORE editing —
  their Rejected-alternatives sections are paid-for dead ends.
- Every wait observes the condition its assertion reads. No bare sleeps, no predicate the pre-action
  state already satisfies, no clock-based silence assertions.
- If you find that exposing heading geometry requires a design decision beyond this brief, STOP and
  report rather than inventing a parallel mechanism.

## Report back

State: the codepoints installed per tier; how a smoke now addresses a heading control; the drive
output proving hover, tooltip, and all three clicks at both nerd/unicode and ascii tiers; and every
file you changed.
