# #530 blind-press census — full verdict table

## In plain words

We looked at every place a test presses the mouse. A press can miss when the
button it aims at just moved, appeared, or disappeared, because the app's
click-routing map can be one drawing behind the screen. We listed every press,
marked the dangerous ones, and gave each dangerous one a proof: hover the
target first and wait until the app visibly reacts, then press.

## The mechanism, sharpened

OpenTUI dispatches mouse events through a native per-cell HIT GRID that maps
each cell to a RENDERABLE id (checkHit in @opentui/core). The grid can lag the
painted frame by one native render (#529 diagnosis, #538 planted-gap proof).
Consequences used for classification:

- A press is a true class-C member when the RENDERABLE that owns the aimed
  cell moved, appeared, or disappeared since the last proof: panel expand and
  restore, panel or list open and close, dialog and popup open and close,
  resize, dock auto-hide, pane remount. A stale grid routes the press to the
  renderable that used to own the cell.
- Content shifts INSIDE one unmoved renderable (a list refilter, a count text
  widening a segment, tabs reordering inside one strip) are dispatch-safe:
  the stale grid still names the same renderable, and the app maps the event
  coordinates against its current model. The remaining model-race is closed
  by waiting for the final painted state before aiming.
- The fix bar (#538 canonical form): park the pointer off target, await the
  stale reveal dropped, hover the target, await the target's OWN hover reveal
  (dispatched through the same hit grid), then press. Where a surface has no
  hover reveal, the strongest available proof is a paint anchor at the aimed
  cell, and the residual one-native-render window is argued here.

## The query (mechanical completeness)

`census-530-press-sites.ts` (this folder) enumerates every press gesture in
`scripts/harness/smoke-*.ts`: direct `kind: 'press'` sends, `sendMouseClick`
calls, calls to the shared press-emitting helpers (clickText,
clickTextInRectangle, closePanelContentsListRow, requestPanelContainerClose,
clickMarker, dragBetweenCells, dragScrollbarThumb), and calls to local
press-wrapping helpers found by a per-file closure pass. At fix time it
reported 415 raw rows across 76 smoke files; after de-duplicating scenario
calls whose presses are classified at their internal aim lines, the judged
census is 321 rows. Six independent classifier agents each read their file
group in full; every verdict cites the wait that precedes the press. 24 of
the 76 smoke files contain no press gesture at all.

Verdict legend:

- STATIC — the aim comes from a settled wait observing the target on the
  current frame and nothing between aim and press can move the renderable.
- STATIC (hover-verified) — already protected by the canonical pattern.
- MOVED -> FIXED-hover — true member, now hover-proven before the press.
- MOVED -> FIXED-paint / FIXED-wait — true member on a surface with no hover
  reveal (or with a pre-satisfiable wait); now anchored to the post-change
  painted frame, residual one-render window argued.
- ARGUED — technically follows a relocation but safe for the named reason
  (usually: the renderable that owns the cell did not move).

## Fixed-member summary (the class, by file)

| file | members fixed | form |
|---|---|---|
| smoke-panel-chrome-harness.ts | 9 segment clicks (expand/restore cycle, just-opened panel and list, Ctrl+J reopens, resize) + 3 list wrappers (addInstance, closeRow, splitRow) + 1 divider press | hoverProvenClickSegment (cursorLine reveal), hover-revealed row controls (Close/Split instance tooltips), paint anchor for the divider |
| smoke-panel-split-harness.ts | 3 (Plugin Add on just-opened panel x2, add header of just-pinned list) | hoverProvenClickCell (cursorLine reveal) |
| smoke-overlay-dialog-harness.ts | 2 (post-dismissal press at pre-close coordinates; palette row aimed mid-refilter) | dialog-gone paint + fresh aim + Toggle Bottom Panel tooltip reveal; final-query wait + within-element argument |
| smoke-markdown-harness.ts | 3 hover (links via markdownHoveredReference) + 4 paint (dividers, remounted preview bodies) | park-off + hovered-reference proof; divider/border glyph anchors |
| smoke-workspace-search-harness.ts | 5 consent-close presses + 1 thumb drag | dialog-text-absence paint anchors; settled-scroll double-read wait |
| smoke-search-mouse-harness.ts | 2 (Find next button; ab/.* rapid pair) | hover background reveal; per-press fresh aim + toggle-status wait |
| smoke-scrollbars-harness.ts | 2 (preview thumb; clickPanelHeadingAction) | preview scrollTop wait; cursorLine hover reveal |
| smoke-tasks-dashboard-harness.ts | 1 (session action after meta rewrite) | post-rewrite row wait + re-hover tooltip reveal |
| smoke-plugin-manifest-harness.ts | 4 (Extensions heading, gear after menu close, menu row, panel Close) | paint wait; menu-gone wait; cursorLine hover reveals |
| smoke-reserved-chord-harness.ts | 2 | same-frame paint waits (Extensions + marker) |
| smoke-navigation-history-harness.ts | 1 | post-switch marker wait + breadcrumb hover reveal |
| smoke-terminal-follow-harness.ts | 1 (focusPanelCell) | pane-painted anchor, body residual argued |
| smoke-mode-coherence-harness.ts | 1 | palette-gone wait + fresh badge aim |
| smoke-agent-search-harness.ts | 1 | fresh icon re-aim via grid wait |
| smoke-workspace-layout-isolation-harness.ts | 2 (clickPanelControl; pinned-list splitter) | cursorLine hover reveal; list-painted anchor |
| smoke-layout-harness.ts | 1 (selectLayoutPreset popup row, 16 runs) | park-off + row-attributes-changed hover reveal |

Total: 59 MOVED-TARGET candidates from the classifiers; after adjudication
under the renderable-boundary rule, 39 were fixed (hover, paint, or wait
strengthening) and 20 re-classified ARGUED with the named within-element or
position-stability reason recorded at the site or below.

## Per-file verdicts

Row format: `site | target | verdict | grounds`. Sites are pre-fix line
numbers from the classification pass; fixed sites carry #530 comments in the
code, so they are greppable regardless of drift.

### smoke-panel-chrome-harness.ts (64 rows)

| site | target | verdict | grounds |
|---|---|---|---|
| 364 | task-record glyph | STATIC (hover-verified) | reveal awaited at 333 |
| 508 | Terminal container close | STATIC | helper grid-waits the painted marker fresh |
| 527 | terminal prompt | STATIC | aim after dialog-gone grid wait |
| 535, 559 | list row closes | STATIC (hover-verified) | closePanelContentsListRow internal reveal |
| 713 addInstance | list add header | MOVED -> FIXED-hover | header cursorLine reveal before every press |
| 719 closeRow | row close control | MOVED -> FIXED-hover | Close instance reveal before every press |
| 728 splitRow | row split control | MOVED -> FIXED-hover | Split instance reveal before every press |
| 753 | status-bar panel control | STATIC | status bar renderable never moves |
| 762 | instances toggle, just-opened panel | MOVED -> FIXED-hover | hoverProvenClickSegment |
| 774 | space Add | ARGUED | tab row unmoved by the list open |
| 788 | recreated toggle | ARGUED | count text widens inside the unmoved tab-row renderable |
| 830 | add header pressed-state | STATIC (hover-verified) | reveal awaited at 817 |
| 988 | close in EMPTY list | ARGUED | deliberate no-op probe; no-change is the assertion |
| 1160 | add header before cancel | ARGUED | header cell fixed at geometry.top across row removals |
| 1184 | expand control | STATIC | no relocation since panel open |
| 1209, 1229, 1271, 1292, 1311 | expand/restore cycle controls | MOVED -> FIXED-hover | hoverProvenClickSegment at each |
| 1340 | restore after expanded create/remove | ARGUED | row pinned since 1311 expand; two settles intervene |
| 1360 | first click of rapid pair | MOVED -> FIXED-hover | hoverProvenClickSegment |
| 1404 | second rapid click | STATIC (hover-verified) | the #538 fix |
| 1439 | split divider after expand cycle | MOVED -> FIXED-paint | divider glyph anchor; no hover reveal (bycatch) |
| 1466 | close during pointer-owned drag | ARGUED | swallowed press is the asserted outcome |
| 1750 | space Add, panel just opened | MOVED -> FIXED-hover | hoverProvenClickSegment |
| 1964 | splitter edge drags | STATIC (hover-verified) | the #529 fix |
| 2058, 2069, 2080 | editor frame actions | STATIC | cells tooltip-proven; no relocation |
| 2115 | tab drag start | STATIC | press itself starts the relocation |
| 2147 | tab after drag reorder | ARGUED | tabs shift inside the unmoved strip renderable |
| 2162, 2187 | tab / toggle | STATIC | no relocation |
| 2194, 2208 | toggle, Add | ARGUED | body-level list change only |
| 2233, 2241 | Database tab, toggle after space add | ARGUED | within-strip content shifts |
| 2264 | + Database header (3 calls) | STATIC | fresh grid wait each call |
| 2309, 2335 | Database row closes | STATIC (hover-verified) | helper reveal |
| 2381, 2407 | Database container closes | STATIC | fresh marker grid waits |
| 2430 | panel close control | ARGUED | splitter-row control independent of tab count |
| 2460 | expand after Ctrl+J reopen | MOVED -> FIXED-hover | hoverProvenClickSegment |
| 2533, 2540, 2561 | Markdown frame actions | STATIC | frame row unmoved by preview/wrap/scroll |

### smoke-panel-split-harness.ts (15 rows)

| site | target | verdict | grounds |
|---|---|---|---|
| 116 | status-bar terminal icon | STATIC | grid wait observes the icon |
| 139 | Plugin Add, just-opened panel | MOVED -> FIXED-hover | hoverProvenClickCell |
| 177 | terminal frame close | STATIC | glyph grid-waited at the aimed cell |
| 202 | toggle after pane close | ARGUED | count change inside unmoved tab row |
| 222 | add header, just-pinned list | MOVED -> FIXED-hover | hoverProvenClickCell |
| 253 | recreated toggle | ARGUED | same within-element count shift |
| 271 | container close | STATIC | helper grid-waits the marker |
| 388 | status-bar control | STATIC | grid wait at 384 |
| 411 | Plugin Add, just-opened panel | MOVED -> FIXED-hover | hoverProvenClickCell |
| 472 | toggle after agent create | ARGUED | within-element count shift |
| 521 | row split control | STATIC (hover-verified) | Split instance reveal at 517 |
| 596, 740 | agent cell body | ARGUED | wide body region contains the point before and after |
| 645 | terminal cell body | STATIC | settled since split |
| 697 | divider drag start | STATIC | no layout action since aim; press starts the move |

### smoke-overlay-dialog-harness.ts (47 rows)

MOVED members, both fixed:

| site | target | action |
|---|---|---|
| 1329 | status action pressed at pre-close coordinates after Settings dismissal | FIXED: Settings-gone paint wait, fresh re-aim, park-off, Toggle Bottom Panel tooltip reveal, then press |
| 1533 | Help: palette row aimed mid-refilter | FIXED-wait: full typed query + anchor on one frame; palette list renderable unmoved since open (within-element argument in the code comment) |

Remaining 45 rows: 41 STATIC (aim from settled waits observing the target;
includes the hover-verified breadcrumb segment at bounded-list-popup
precedent), 2 ARGUED (Settings scrollbar track and close control — the
dialog bounds the drags provably do not move), and the quit-confirmation /
bounded-list-popup / shortcut-help / voice-picker rows all STATIC per the
group-B table (aim from post-open published geometry and grid waits; the
git history: header row is geometry-fixed by the windowed changes region).

### smoke-markdown-harness.ts (43 rows)

| site | target | verdict | grounds |
|---|---|---|---|
| 814/815 | external link double-click after Ctrl+Tab | MOVED -> FIXED-hover | markdownHoveredReference proof via the sibling resolvable link (external links publish no reference — bycatch) |
| 1322 | preview marker after TOC scroll | MOVED -> FIXED-hover | hovered-reference proof at the aimed cell |
| 2298 | repaired link ctrl-click | MOVED -> FIXED-hover | fresh aim + hovered-reference proof |
| 1907, 2381 | divider presses | MOVED -> FIXED-paint | divider glyph anchor at the aimed cell |
| 2452, 2555 | preview body presses after remount / Find close | MOVED -> FIXED-paint | border glyph anchor beside the aimed row |
| 1015, 1277, 2035 | resize / dock-hide relocations | ARGUED | existing waits accept only the FINAL published position on the current frame |
| 2090 | README tab after tab add | ARGUED | OpenBufferSet.open() APPENDS — README's cell never moves |
| remaining 31 | links, bodies, structure rows, tab bodies | STATIC | aim from settled waits; 2142 already hover-verified |

### smoke-workspace-search-harness.ts (19 rows)

| site | target | verdict | grounds |
|---|---|---|---|
| 575 | search scrollbar thumb mid-momentum | MOVED -> FIXED-wait | two agreeing settle-mode scrollTop reads, then fresh thumb aim |
| 780, 817, 830, 936, 977 | presses after consent-dialog closes | MOVED -> FIXED-paint | consent-text absence waits (presence asserted while open) before aiming; editor body has no hover reveal (bycatch), residual argued |
| 160, 239 | activity item, option buttons | STATIC (hover-verified) | tooltip reveals awaited |
| 172, 178 | activity item re-clicks | ARGUED | dock relayout never moves the fixed activity column |
| remaining 8 | result rows, inputs, Replace All, Undo/Redo | STATIC | aim from settled grid waits observing the post-change frame |

### smoke-search-mouse-harness.ts (8 rows)

216 (Find next button) MOVED -> FIXED-hover (rest-cell delta reveal);
311 (ab/.* pair) MOVED -> FIXED-hover (per-press park + fresh aim + reveal,
toggle status awaited between). 177 and 264 already hover-verified; 365,
420, 565 STATIC (fresh settled aims).

### smoke-scrollbars-harness.ts (9 rows)

663 MOVED -> FIXED-wait (markdownPreviewScrollTop === 0 awaited before the
thumb aim); 1387 clickPanelHeadingAction MOVED -> FIXED-hover (cursorLine
reveal — PanelTabBar paints hovered controls with bg(palette.cursorLine)).
599, 646 STATIC; 694, 506-loop, 618, 2401 ARGUED (fixed tracks, per-axis
independence, body press with landing confirmed by status).

### smoke-tasks-dashboard-harness.ts (8 rows)

1167 MOVED -> FIXED-hover (post-rewrite row wait, park-off, attach-tooltip
reveal). 1093, 1332, 1363 already hover-verified; 717, 1032, 1071 STATIC;
728, 739 ARGUED (fixed segmented header).

### smoke-plugin-manifest-harness.ts (4 press sites, 16 rows with calls)

selectExtensionsRow MOVED -> FIXED-wait + ARGUED (Extensions heading paint
proof; sidebar renderable position-stable); gear-after-menu-close MOVED ->
FIXED-wait (menu row gone); Depth 1 menu row MOVED -> FIXED-hover
(cursorLine row highlight); panel Close after Ctrl+Shift+Y MOVED ->
FIXED-hover (cursorLine control reveal); structure scrollbar track STATIC;
first gear press ARGUED (no overlay moved before it).

### Small files (group F, 62 rows)

reserved-chord 235/270 MOVED -> FIXED-wait (Extensions painted on the same
frame as the marker); navigation-history 407 MOVED -> FIXED-wait+hover
(post-switch marker + breadcrumb ❮ cursorLine reveal); terminal-follow 930
MOVED -> FIXED-paint (pane glyph anchor, body residual argued);
mode-coherence 221 MOVED -> FIXED-wait (palette-gone + fresh badge aim);
agent-search 340 MOVED -> FIXED-wait (fresh icon re-aim). All other group-F
rows STATIC or ARGUED per the group table: agent-pane-ux (6 STATIC),
selection (3 STATIC), git-log (4 STATIC, 1 ARGUED double-click pair),
breadcrumb (1 STATIC, hover-gated), pixel-preview (2 STATIC, 1 ARGUED
backdrop), gutter-diff (2 STATIC), file-open (2 hover-verified),
diff-overview (2 STATIC, 1 hover-verified, 1 ARGUED divider column), agent-
cancel (3 STATIC, 1 ARGUED editor region), goto-definition (3 STATIC),
diagnostics (1 STATIC), tree-scroll (1 ARGUED any-row assertion, 1 STATIC),
terminal-follow editor blur (ARGUED), tabs (2 STATIC), paste (2 STATIC),
mode-coherence 199 (STATIC backdrop), agent-search 213 (STATIC), wrap,
terminal-stage, tasks, ssh-channel (hover-verified), openproject,
indent-guides, hover, field-caret, dirty-marker, agent-engine-switch — all
STATIC per the group table.

### Group E remainder (activitybar, workspace-tabs, terminal, database, clipboard)

All STATIC or ARGUED (fixed activity column, fixed status bar, fresh
snapshot aims, geometry-derived body points, in-place `\r` streaming rows).
smoke-terminal-harness.ts:885 (+ Plugin loop) STATIC — each iteration
re-aims from a settled per-iteration grid wait. No members.

## Shared-helper audit

- closePanelContentsListRow — hover-verified internally (the model).
- requestPanelContainerClose — grid-waits the painted marker fresh, then
  hover-sweeps and presses; its call sites follow settled states. No member.
- clickText / clickTextInRectangle / clickMarker / dragBetweenCells — thin;
  safety judged at call sites (above).
- dragScrollbarThumb — presses caller-measured cells; both risky call sites
  fixed with settled-position waits.
