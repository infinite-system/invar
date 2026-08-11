# READY — brief 522-1: the drive-layer instrument batch (four items)

State: READY (round 3: premise corrected with evidence; guard applied anyway, commit 434e26fc; shortcut-help green)
Branch: fleet/522-drive-scoped-text-click-gesture
Commits: 315672af (code + tests), d575aac1 (skill doc), 65e5f1a2 (census, round 2), 434e26fc (modifier guard, round 3)

## Round 3 (brief 522-3) — the "plain Escape emits the modified form" diagnosis

### In plain words

The brief said my chord branch fires for a plain Escape and breaks the
sheet-closing tests. I checked the real bytes: a plain Escape still
sends the one bare escape byte, at every commit of my branch, and the
shortcut-help test passes here six times in a row. The claimed broken
code path cannot run, because the plain-key lookup above it answers
first. I still added the guard the brief asked for — it is good armor —
and a test that fails loudly if that path ever opens.

### Premise correction (reported per rule 9, with evidence)

The diagnosed mechanism does not exist on this branch, at any commit:

- Direct byte probe at HEAD: `key('Enter')` = codepoint 13,
  `key('Escape')` = 27, `key('Backspace')` = 127 — the bare forms, no
  CSI 27 frame. The claimed `\x1b[27;1;27~` for plain Escape is not
  producible: in `$key` the unmodified named-key lookup
  (`namedKeySequences`) RETURNS before the chord branch on every
  committed version (checked 315672af and HEAD; the branch was
  introduced after that lookup and never reordered).
- `bun scripts/harness/smoke-shortcut-help-harness.ts`: ALL-PASS in my
  worktree, six consecutive runs, including the "sheet shows the Quit
  action" step named as red.
- The round-2 census was not modified-only: its 304-entry battery
  includes the plain forms, and the base-vs-branch diff showed rows
  `Enter "\r"`, `Escape "\x1b"`, and `Backspace "\x7f"` (the census
  prints the raw control bytes, which render invisibly; codepoints 27
  and 127 verified directly) byte-identical
  (only THROWS -> new-form rows differed). The plain-form comparison the
  brief asks for therefore already exists;
  [census-522-key-byte-forms.ts](census-522-key-byte-forms.ts) emits
  those rows for any two checkouts.
- Scope of what I can say: every commit of THIS branch is clean and the
  smoke is green here. I cannot see what tree gate-522-r2 executed; no
  failure log path was named in the brief, and no shortcut-help failure
  dir exists under /tmp on this machine. If a log exists, I will gladly
  diff its bytes against this evidence.

### The fix was still applied (commit 434e26fc)

The explicit guard `modifyOtherKeysCodepoint !== undefined && (hasShift
|| hasAlt || hasControl)` is now in
[HarnessInput.ts](../../../../scripts/harness/HarnessInput.ts):
defense-in-depth, making the no-frame-without-modifiers rule local
instead of dependent on the named table above. New test in
[PtyTestDriver.test.ts](../../../../scripts/harness/PtyTestDriver.test.ts)
pins the plain byte forms and forbids any `\x1b[27;` frame for
unmodified keys. Positive control: planting the removal of the Escape
named entry now makes plain Escape THROW loudly (pre-guard it would
have silently emitted the parameter-1 frame — the exact defect class
the brief describes); the test went red on the plant and green after
revert (reverted by re-edit, not git checkout).

### End state

shortcut-help ALL-PASS (x6 pre-guard, x1 post-guard), full `bun test`
2522 pass, typecheck clean.

## Round 2 (brief 522-2) — the bounded-list-popup gate red

### In plain words

The gate saw the popup test fail on my branch during a busy window and
suspected my key-encoding change. I ran the test many times on my branch
and at the merge base, alone and under load: green everywhere, 18 runs.
The same test failed the same way on an older branch that has none of my
code, and a neighbor gate failed it at the same moment mine did. I also
diffed every key byte form against the merge base by machine: my change
only added forms that used to throw, it altered none. The red is a
pre-existing load flake, not my diff.

### Verdict: PRE-EXISTING / load-only. Evidence:

1. My worktree, solo: 4 runs, ALL-PASS (about 6s each).
2. My worktree, 2x contention (two concurrent runs): both ALL-PASS.
3. My worktree, 3x contention (matching the 3-gate window), 3 rounds =
   9 runs: all ALL-PASS. Logs: session scratchpad `popup-*.log`.
4. Merge base ffe218c7 in a scratch worktree, same conditions: solo
   ALL-PASS, 2x contention both ALL-PASS.
5. Cross-branch same-step failure: the IDENTICAL failing wait ("wheel
   scrolling changes the visible popup list or reveals its tail") is in
   /tmp/merge-gate-failures.6085f6c39f70467b.1521848/ from worktree
   542-log-tip-observation-gate-drift — a branch with none of my code
   (#542, the log-tip observation gate, landed before my dispatch).
6. Same-window sibling failure: /tmp/merge-gate-failures.e2e6c1b3c871edfe.1638618/
   (adjacent pid to my window's 1638619) shows worktree
   543-git-log-drilldown-diff-red failing the SAME smoke at the same
   moment at a different step (popup never opened) — the contention
   signature, two branches red on one smoke in one window.
7. Byte-form census, mechanical: 
   [census-522-key-byte-forms.ts](census-522-key-byte-forms.ts)
   enumerates 304 key names against both checkouts. Every diff line is
   `THROWS -> new modifyOtherKeys form` (modified Enter/Escape/
   Backspace). Zero existing forms changed. The failing step drives
   wheel events and unmodified Backspace; both encode through untouched
   branches (the new branch runs only when a modifier is present).

No timeout was widened; no smoke was edited. The end-state bar is met:
the smoke is green solo and under 2x contention in my worktree, and the
merge-base runs plus the cross-branch logs prove the red pre-exists this
diff. The flake itself (a load-sensitive wheel wait against a
possibly-stale popup geometry captured before the query cleared —
`popupWheelGeometry` is fixed at line ~500 of
[smoke-bounded-list-popup-harness.ts](../../../../scripts/harness/smoke-bounded-list-popup-harness.ts)
while the popup can re-lay-out after the Backspace clear) is reported as
bycatch below, not fixed here: the smoke is another task's surface and
the fix is a design call (re-read geometry from status after the clear).

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

- Suspect (bounded-list-popup smoke flake mechanism): the wheel-scroll
  phase reuses `popupWheelGeometry` captured from the FILTERED popup
  state, then clears the query and wheels against that stale rectangle
  (around line 500 of
  [smoke-bounded-list-popup-harness.ts](../../../../scripts/harness/smoke-bounded-list-popup-harness.ts)).
  If the popup re-lays-out after the clear (under load, re-render can
  land late), the wheel cell and the watched rectangle can miss the live
  list, and the "wheel scrolling changes the visible popup list" wait
  times out. Labeled SUSPECT: I could not reproduce it locally in 18
  runs up to 3x contention, but the same-step red exists on two branches
  (mine and 542-log-tip-observation-gate-drift) and the phase is the
  only one in the smoke holding geometry across a state change. A past
  branch named fix-bounded-list-popup-flake (merge 0b443fb6) shows this
  smoke has a flake history. Proposed fix for a dispatched task: re-read
  geometry from the status projection after the query clears, before the
  wheel loop.
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
