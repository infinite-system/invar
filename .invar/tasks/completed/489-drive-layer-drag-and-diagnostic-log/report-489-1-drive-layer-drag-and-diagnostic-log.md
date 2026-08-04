# READY report 489-1 — drive layer: drag, diagnostic log, --show, loud showScreen

Branch: `fleet/489-drive-layer-drag-and-diagnostic-log`. Commit: `07870d14`.
Worktree clean. Tests green. Checker: 0 problems.

## In plain words

Selecting text with the mouse used to need four raw driver calls. Now one
verb does it: press, glide while pressed, release. The app writes a private
log file, and nothing on the session told you where it was. Now the session
hands you the path and the last lines, and it only shows lines this app
wrote. A quick question used to print hundreds of status lines. Now `--show`
prints just the fields you name. And `showScreen` with a wrong-shaped
argument used to print two misleading rows that looked like evidence. Now it
throws and tells you the right shape.

## The six items, one verdict each

1. **Drag verb — SHIPPED.** `app.drag(fromColumn, fromRow, toColumn, toRow,
   modifiers?)` in [DriveSession.ts](../../../../scripts/harness/DriveSession.ts).
   It sends an unpressed move to the start cell, a real press, eased pressed
   drag-moves along the path, and a release. The pressed moves are always
   emitted, at machine speed unpaced. humanPace only spaces them out. A press
   that teleports to its release selects nothing, so the intermediate bytes
   are correctness, not animation. Modifiers ride every byte. Driven demo
   (verbatim, against the warm server on a 300-line fixture):

   ```
   const screen = await app.screen();
   const hit = screen.findText('DRIVE-LINE-000003');
   await app.drag(hit.column, hit.row, hit.column + 18, hit.row + 3)
      .waitForStatus('hasSelection', true)
      .show('drag verb selects', ['hasSelection','selection']);
   -->  hasSelection = true
   -->  selection = {"start":{"line":2,"col":0},"end":{"line":5,"col":19}}
   ```

   The same drag under `app.humanPace(0.2)` produced the same selection
   shape. The raw-driver baseline I drove first produced the identical
   selection, so the verb is byte-equivalent to the hand-rolled form.

2. **Diagnostic-log access — SHIPPED.** `app.diagnosticLogPath` (the driver's
   actual per-home path), `await app.logTail(20)` (returned lines), and
   `app.showLog(20)` (chainable print). All read through
   [DiagnosticLog](../../../../scripts/harness/DiagnosticLog.ts), so only the
   driven instance's own stamped lines appear. A foreign or leftover line is
   rejected. Driven demo:

   ```
   console.log('path:', app.diagnosticLogPath);
   app.showLog(2);
   -->  == diagnostic log (/tmp/drive-home-lXMDga/tui.log) ==
   -->  2026-08-04T06:21:06.494Z [info] [instance=harness-aa322fe2c642] App started
   -->  2026-08-04T06:21:06.502Z [info] [instance=harness-aa322fe2c642] Boot complete
   ```

   The TUI_LOG_PATH replacement is now documented in the skill: the driver
   DROPS an inherited `TUI_LOG_PATH` and declares its own, so tailing the
   path from your shell reads a file the driven app never writes.

3. **Negative screen condition — ALREADY COVERED, verified and documented.**
   `waitForTextGone(text)` is the absence wait the #356 (motion waits and
   status quoting) builder asked for, and `waitForStatusWithout(field,
   value)` covers list membership. Driven proof:

   ```
   await app.key('Control+p').waitForText('Go to File');
   await app.key('Escape').waitForTextGone('Go to File');   // resolves
   ```

   Nothing genuinely missing. Two cautions now sit in the skill: the absence
   wait pre-satisfies if the text never painted (wait for presence first),
   and `panelActiveContentKind` persists while the panel is hidden, so the
   close condition is `panelVisible === false`, never the kind field. My own
   first probe also proved the ask-the-screen rule: I waited for "Quick
   Open" and the popup is titled "Go to File".

4. **CLI narrow output — SHIPPED.** `--show FIELD[,FIELD]` appends one
   `app.show(...)` step to the probe. Works with `--eval`, `--script`,
   `--attach`, `--attach-script`. Paths reach into published values. Driven:

   ```
   $ bun scripts/harness/DriveSession.ts --attach "" --show panelListGeometry.width
     panelListGeometry.width = 0
   $ ... --eval "await app.key('Control+j').waitForStatus('panelVisible', true)" --show panelVisible,frame
     panelVisible = true
     frame = 7
   ```

   A bare `--show` with no probe, or `--show` with `--serve/--stop/--reload`,
   errors loudly with the correct usage. An unpublished field name still
   fails with did-you-mean suggestions (existing `show()` behavior).

5. **showScreen fix — SHIPPED as loud rejection.** Reproduced first:
   `showScreen([5])` printed rows 5 and 51 — the array coerced to a string
   and `+= 1` concatenated, so the "band" was garbage that read as evidence.
   Now non-integer shapes throw at CALL time with the correct form
   (`showScreen(10, 20)`), and an out-of-range or empty band throws at run
   time naming the live screen size. Row bands (`showScreen(3, 5)`) work.

6. **Skill doc notes — SHIPPED.** [drive-pty SKILL.md](../../../../.claude/skills/drive-pty/SKILL.md)
   gains: the drag verb, the diagnostic-log surface and TUI_LOG_PATH
   replacement, a "wait-value and needle traps" block (typed values in
   waits, never `'false'` the string; `type()` then `waitForRepaint()` is
   pre-satisfied — wait on the typed text; `waitForTextGone` pre-satisfies
   too; the panelVisible close condition; broad findText needles match other
   surfaces first), and the `--show` filter. The #356 "JSON quoting" note
   was adapted: the one-shot `field="agent"` CLI form is gone, the surviving
   rule is typed values in fluent waits.
   [drive.md](../../../../scripts/harness/drive.md) was rewritten — see
   Bycatch.

## Locking coverage

[DriveSession.test.ts](../../../../scripts/harness/DriveSession.test.ts)
gains five tests: drag byte order (press first, only pressed moves between,
release last, modifiers on every byte, final move at the target), drag
geometry refusal, showScreen shape rejection, showScreen band rejection, log
provenance (foreign and unstamped lines never appear), and `--show`
parse/append. 9 pass. Positive control run: I planted an unpressed-glide
defect in drag and the byte-order test went red, then green after revert.
Full pass: `bun test scripts/harness/DriveSession.test.ts
scripts/harness/DiagnosticLog.test.ts scripts/harness/PtyTestDriver.test.ts`
= 33 pass, 0 fail. `tsc --noEmit` clean.
`check_invariants.mjs --all --refs`: 1378 annotations, 0 problems.

## Invariants in scope, record by record

- **Harness input and output use the real PTY — upheld.** The drag verb is
  three byte forms (press, pressed SGR moves, release) through the existing
  `sendMouse`/`sendMouseWithoutFrameExpectation` seam. No teleport path
  added. The log surface is read-only observation of a file the app writes.
- **Harness waits observe conditions not frame ordinals — upheld.** No new
  wait was added. Drag's tempo delays are animation on gestures, never
  synchronization, matching the existing click/glide contract. The demo
  sequenced on `waitForStatus('hasSelection', true)`, a real condition.
- **Every wait names itself — untouched.** No new wait primitives.
- **Harness app homes are complete and isolated — upheld and now
  discoverable.** The new log surface reads through the provenance guard
  this record mandates. The skill now documents the TUI_LOG_PATH
  replacement instead of leaving it implicit.
- **Drive session clicks resolve from roles and text — STALE, see Bycatch.**
- **Shared seam changes verify every consumer — upheld.** DriveSession's
  consumers are GraphClient, InvarMcpServer, HarnessSmoke, the tour drive,
  and the two test files. Changes are additive except showScreen, which no
  existing consumer calls with the now-rejected shapes (grepped). Consumer
  tests run green (InvarMcpServer.test.ts 1 pass).

## Bycatch

- **FIXED (in-task, same commit): [drive.md](../../../../scripts/harness/drive.md)
  was heavily stale.** It documented the removed one-shot flags (`--key`,
  `--wheel`, `--click`, `--cells`, `--env`, `--wait-for-status`,
  `--frame-silent`, `fold-control=` click targets) as the current CLI.
  Rewritten to the fluent reality since it documents the CLI item 4 changes.
  Reproduced by reading `DriveScriptRunner.main` — none of those flags parse.
- **Stale invariant record:** "Drive session clicks resolve from roles and
  text" in [harness.invariants.md](../../../../scripts/harness/harness.invariants.md)
  cites `DriveSession.ts (resolveClickTarget, fold glyph search)` and
  generates `fold-control=HEADER_TEXT` targets. `resolveClickTarget` and
  `fold-control` exist NOWHERE in the tree (grepped scripts and src). The
  record's core survives (clickText still resolves visible text immediately
  before input), but the fold-control component and the Evidence citation
  rotted when the one-shot was removed. Needs a `refines` pass. Not edited —
  contract edits are the conductor's call.
- **Suspect, labeled hypothesis:** Escape does not clear an editor mouse
  selection (`hasSelection` stayed true after Escape, twice). Many editors
  behave this way on purpose, so this may be intended. One line, zero cost
  to check against the design intent.
- **--env note:** the removed one-shot's `--env KEY=VALUE` flag has no
  fluent equivalent, so the old [drive.md](../../../../scripts/harness/drive.md)
  example that re-enabled folder-open tasks is no longer expressible from
  the CLI. Related to the open #491 (settings pin primitive) ask below.

## Not in this batch (left for the conductor)

The task file carries two asks the brief's six items do not include: the
#491 (agent-terminal seeding) `--setting KEY=VALUE` primitive, and the #356
round-3 asks (motion-wait timeout messages printing the momentum sequence,
and per-run homes for the direct keyboard harness). Untouched here.

## Instrument feedback

- EASY: the warm server loop. Six sightings and every demo ran as ~1s
  attaches against one boot. The wrong-path miss messages on `show()` are
  excellent.
- CONFUSING: an attach that fails mid-chain leaves the app in the failed
  snippet's state (my wrong "Quick Open" needle left the popup open for the
  next probe). The skill says state persists, but a one-line note that a
  FAILED attach also persists its partial state would have saved me a probe.
- MISSING: nothing new. The asks I would have filed are the ones this batch
  shipped.

## How to re-verify in one minute

```
bun test scripts/harness/DriveSession.test.ts
bun scripts/harness/DriveSession.ts --serve --size 300 &
bun scripts/harness/DriveSession.ts --attach "
const hit = (await app.screen()).findText('DRIVE-LINE-000003');
await app.drag(hit.column, hit.row, hit.column + 18, hit.row + 3)
  .waitForStatus('hasSelection', true).showLog(2);
" --show hasSelection,selection
bun scripts/harness/DriveSession.ts --stop
```
