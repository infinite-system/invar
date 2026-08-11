# READY — brief 522-1: the drive-layer instrument batch (four items)

State: READY
Branch: fleet/522-drive-scoped-text-click-gesture
Commits: 315672af (code + tests), d575aac1 (skill doc)
Tree: clean (only the dispatch-time fundamentals file remains untracked, as delivered)

## In plain words

The drive layer could only click the first copy of a glyph, could not
paste, could not press chords like Control+Shift+Enter, and a reload
with a new fixture size silently kept the old one. Now a probe can say
WHICH copy it means (a region, a named row, or "the 2nd one"), can paste
as one real paste frame, can press the modified Enter chords, and a size
reload either really rebuilds the fixture or refuses out loud. I drove
every one of these against the real app and watched each check fail on a
planted defect before trusting it.

## The four items

### 1. #522 (scoped clickText) — DONE

`clickText(text, columnOffset?, modifiers?, scope?)` in
[DriveSession.ts](../../../../scripts/harness/DriveSession.ts). Scope is
`{ occurrence: N }` (1-based, row-major), `{ band: 'statusRow' | 'firstRow' }`,
or `{ rectangle: {left, top, width, height} }`; occurrence composes with
either region. The wait is scoped too: the condition counts matches
INSIDE the scope, so a missing Nth twin times out loudly instead of
silently clicking the first. Bad shapes (unknown band, occurrence 0,
band+rectangle together) throw at CALL time. The gesture stays real:
move, hover, press, release through cells. Resolution sits on a new
`findTextOccurrences(marker, rectangle?)` in
[HarnessSnapshot.ts](../../../../scripts/harness/HarnessSnapshot.ts) —
same-row twins included, matches must fit inside the rectangle.

Driven: two `note.txt` files (alpha/, beta/) in one tree. Unscoped click
opened alpha's (negative arm, breadcrumb-proven). From a clean screen,
`{ occurrence: 2 }` opened beta's and alpha never opened. With alpha's
tab open the twin count grows to 5 (breadcrumb, tab, two tree rows,
status row) and a naive occurrence click times out loudly — then
`{ rectangle }` over the tree pane picked beta correctly with the tab
open. `{ band: 'statusRow' }` clicked the status-row twin at row 59,
proven by the app's own received-mouse state. At the 100,000-line
fixture, 52 twins painted and `{ occurrence: 3 }` put the caret on
document line 3 instantly (the scan is screen-bounded, no scale cost).

### 2. #520 (paste gesture) — DONE

Chainable `app.paste(text)`: one bracketed-paste frame
(`\x1b[200~…\x1b[201~`) through the existing `driver.sendPaste`, marking
the input frame boundary like `key`/`type`. The proof wait stays with
the caller (wait on what the paste CHANGED), same contract as `type()`.

Driven: multi-line paste into the editor landed as one paste at the
caret (both lines present, mid-line split correct); two pastes at
machine speed back to back; an empty paste (no crash, no stray bytes);
paste into the find bar filled the query and found the match ("1 of 1"
painted as "1 of 1" — my first probe's needle "1/1" was wrong and the
wait failed LOUDLY with a screen dump, which is the wait contract
working).

### 3. #527 (modified key chords) — DONE

[HarnessInput.ts](../../../../scripts/harness/HarnessInput.ts) now
encodes modified Enter (13), Escape (27), and Backspace (127) as
modifyOtherKeys bytes (`\x1b[27;<mods>;<codepoint>~`). I read both of
OpenTUI's parsers in the vendored package before choosing the form: the
legacy parser matches it directly, and the kitty parser requires a
trailing `u` or a `mods:event` colon group, so it passes this sequence
through untouched — the chord decodes on both protocol paths.
Unsupported chords still throw (`Unknown harness key name`,
`Unknown key modifier`).

Driven: `Shift+Enter` cycled the find match backwards ("2 of 2");
`Control+Enter` replaced the current match; `Control+Shift+Enter` opened
the Replace All consent dialog naming its count, and confirming it
replaced both matches. Negative arm: `Control+F13` and `Meta+Enter`
refused loudly through the fluent layer.

### 4. #541 (reload fixture size) — DONE

`--reload --size N` rebuilds the scale fixture on the warm server: the
server swaps in a fresh fixture, removes the old server-owned one, and
names the new fixture in its answer
(`reloaded (fresh app #3, fixture scale-12.txt)`). The client REFUSES a
size reload the server did not confirm — an older server that ignores
the request field can no longer produce the silent no-op. A failed swap
boot restores the previous fixture and leaves the current app live.
Two more silent-flag combos now refuse loudly: `--attach/--stop --size`
and `--attach/--reload/--stop --open` (message says what to do instead).
Design note: `--reload --size` on a server started with `--open`
deliberately switches it to a fixture workspace — the operator asked for
a fixture; the refusal path is reserved for flags that would do nothing.

Driven end to end: serve `--open`, `--reload --size 12` → screen shows
scale-12.txt; plain `--reload` after it kept the 12-line fixture;
`--reload --size 100000` served the large fixture; both refusal messages
shown verbatim, exit 1.

## Verification

- Positive controls, all four planted and shown red before trusting:
  (1) scoped resolution rigged to fall back to first match → occurrence
  and rectangle tests failed; (2) Enter codepoint rigged to 10 → chord
  byte test failed; (3) paste rigged to drop the send → paste test
  failed; (4) server rigged to ignore `fixtureSize` (the original #541
  defect, replanted) → the client guard threw and the reload-size test
  failed. All plants removed; suite green after each.
- New automated tests:
  [DriveSession.test.ts](../../../../scripts/harness/DriveSession.test.ts)
  (7 scope/paste unit tests against the real snapshot code, a
  real-server reload-size test, the flag-refusal test) and
  [PtyTestDriver.test.ts](../../../../scripts/harness/PtyTestDriver.test.ts)
  (chord byte forms incl. loud-refusal arms, findTextOccurrences
  row-major/rectangle/edge cases).
- Full `bun test`: 2522 pass, 0 fail (389 files).
- Smokes consuming the changed harness files:
  smoke-paste-harness ALL-PASS, smoke-find-harness ALL-PASS.
- `bun run typecheck` clean; invariants checker `--all` and `--refs`:
  0 problems, 1438 annotations resolved.
- Adversarial families driven: count edges (zero matches → loud timeout,
  one, many, 52 twins at 100k), order/interleaving (scoped click with a
  sibling popup open, twin clicked while its sibling's tab+breadcrumb
  +status duplicated the needle), mid-flight repeats (double paste at
  machine speed, empty paste), broken assumptions (wrong needle, missing
  Nth twin, unsupported chords, stale-server skew guard), neighbors
  (unscoped clickText unchanged first-match; plain reload unchanged;
  find bar Enter/Shift+Enter/Ctrl+Enter family all exercised).
- Scale parity: scoped click at the 10-line twin workspace and the
  100,000-line shared fixture; resolution is screen-bounded (60x220
  cells), so per-probe work does not grow with document size.

## Coherence

One seam family, no parallel layers: scope resolution lives on the
snapshot (where findText/findTextInRectangle already live), the gesture
verbs stay primitive (no app concepts entered the driver), paste reuses
the one `HarnessInput.paste` encoder the smokes already trust, and the
chord fix extends the existing modifyOtherKeys branch family rather than
adding a second encoding path. The reload change also closed the wider
silent-flag class (`--open`/`--size` on attach paths), so the CLI is
more honest than before, not just bigger.

## Bycatch

- FIXED (in-task surface, not separate): none — no out-of-scope edits made.
- Instrument ask (attach error format): when an attached snippet fails,
  [DriveSession.ts](../../../../scripts/harness/DriveSession.ts)'s
  attach error prints `attach: snippet failed: <error>` FIRST and the
  captured step log AFTER it, so any `tail` of the output shows a normal
  step line as the last line and hides the verdict — the
  read-the-verdict-not-the-wrapper trap; it cost me two re-drives
  tonight. Ask: print the captured output first and end with the
  verdict line. Reproduced twice (any failing attach shows it).
- Observation (find bar, minor): with replace mode closed, Tab inside
  the find bar silently does nothing (`switchField` with one field) and
  subsequent typing lands in the query. Defensible for a one-field
  surface, but a probe (or user) who forgot Ctrl+H gets no feedback.
  Seen once, reproduced by design reading of `handleFindBarKey` in
  [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts).
- Observation (dialog copy vs clicks): the Replace All dialog's title,
  body, and confirm button all contain the word "Replace", so a naive
  text click hits the TITLE first. Not an app defect (the scoped click
  is the cure, and I used it), but worth knowing for future probes.
- Process note, honest: after showing the #541 plant red I removed the
  plant with `git checkout` on the not-yet-committed file and wiped my
  own uncommitted DriveSession.ts edits; re-applied them from context,
  re-verified (typecheck + full harness tests green), committed. No
  content was lost; plants are now always removed by re-edit, and the
  code was committed before any later plant.

## Premise check (brief vs reality)

All four premises held at build time: clickText was first-match-only,
DriveSession had no paste verb, `HarnessInput` threw on
`Control+Shift+Enter`, and `--reload --size` was parsed-then-dropped
(the old attach path sent `{reload: true}` only). No premise
corrections.
