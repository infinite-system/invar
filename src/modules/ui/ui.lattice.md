# UI — Invariant Lattice

How the records in `ui.invariants.md` hold together. Derived, never legislative: where this
disagrees with the records, the records win and the finding is against this file.

Use it as a design reviewer. State a proposed change against the generators below BEFORE you write
code. If the proposal needs a new host branch, a second owner of one obligation, or a second
geometry for one control, this file shows the gap while it still costs nothing.

## Placement — why this file exists and what stays in `project.lattice.md`

`scroll.lattice.md` states the criterion in its first line: a domain lattice unifies the records of
ONE sibling contract. The checker enforces that reading — a `*.lattice.md` reports coverage against
the `*.invariants.md` beside it. `ui.invariants.md` holds 61 records with real derivation structure
and had no such file, so the lattice is `ui.lattice.md` and not more sections in
`project.lattice.md`.

`project.lattice.md` keeps what this file may not hold: compositions whose MEMBERS cross contracts.
*Source text state survives replaceable projection* is one of them — it joins project, workspace,
and ui records. This file joins that composition through the ui members it names
([renderables hold no model state][stateless-renderables] and [the source text editor is a pane
content citizen][source-text-citizen]). It does not restate it.

## Dependency map — chosen stands on chosen

```
The panel renders exactly the visible pane content cells each frame
  ├─► A split panel renders every visible cell into its own sub-region
  │     └─► A focused split panel routes keystrokes to the focused cell
  ├─► A focused panel routes keystrokes to its active pane content
  │     ├─► A focused pane consumes only its own scoped bindings
  │     └─► Bracketed paste survives stream chunking
  ├─► Visible panel contents own separate headed regions
  ├─► Each panel instance owns one independent session
  │     └─► A pane runtime owns its processes
  ├─► The file tree is a pane content citizen
  ├─► Plugin panes use the shared pane and popup hosts
  └─► A pane content projects through exactly one surface
        ├─► The source text editor is a pane content citizen
        └─► The editor column's default occupant is a contribution

The active activity item determines its dock content
  ├─► Activity bar order is one persisted sequence
  └─► A contributed dock side moves one live pane
        └─► One panel host owns keyboard focus
Panel content order is one persisted sequence
  └─► The panel contents list mirrors open content   ◄── Each panel instance owns one session

Bounded list popups share paint and hit geometry
  ├─► Bounded list interactions live in one popup
  │     └─► Popup hierarchy is mouse and keyboard reachable
  ├─► Completion reuses bounded popup geometry
  └─► List interactions inspect only visible rows
One painter draws every single-line text field
  └─► (supplies the search row of every bounded popup and overlay field)

  same shape, separate surfaces: Panel controls · Splitter · Tab bars · Command bar ·
  The right dock control owns the status edge

A scrollable pane height is an input not an output  (reality)
  ├─► A scrollbar track is derived per frame from its region rect
  │     ├─► One scrollbar painter gives each axis equal visual weight
  │     └─► The editor overview derives from the decoration snapshot
  │           └─► TS diagnostics render as an underline and overview mark
  └─► Only the visible window is rendered

Input overlays share one modal slot
  ├─► Modal focus withdraws host terminal projections
  ├─► Modal outside presses dismiss and consume
  ├─► Overlay dialogs stay inside the terminal
  │     └─► Settings selection stays inside its viewport
  ├─► Overlay keyboard actions have visible mouse paths
  │     ├─► Settings are editable by mouse per widget kind
  │     └─► Right dock command and mouse affordance share one toggle
  ├─► A context menu is modal and single-consumer
  └─► The shortcut sheet lists the effective bindings
An overlay dismissal clears its cells in the same frame
  - - constrains every dismissal path above
A tooltip never intercepts input
  └─► A hover card reflects the language server type at the pointed symbol

One writer per scroll regime per frame
  ├─► The wheel gesture resolves through one settings-sourced step
  ├─► Wheel impulses start their own frame sequence
  ├─► Same-direction notches accumulate until the glide ceiling
  └─► A fast glide crosses rows in many small steps

Renderables hold no model state
  ├─► Only the visible window is rendered
  ├─► One visible file line is one visual row when word wrap is off
  │     ├─► The caret renders at the cursor display column
  │     └─► Indent guides mark leading whitespace without shifting columns
  ├─► The selected range renders with a background
  │     └─► A scrollable text surface is drag-selectable with edge auto-scroll
  └─► Selection stays anchored to an item

Status text is assembled from ordered contributions
  - - the status bar instance of "the host names no domain"
```

## Import-style references — derivation

Anchors are identity. Each line below states which record GENERATES which.

**The pane seam.** [The panel renders exactly the visible pane content cells each
frame][panel-projection] is the root of the ui family. It says a host projects an opaque
`PaneContent` and holds no per-content branch. Everything below is that one seam refined:

- [A split panel renders every visible cell into its own sub-region][split-cells] refines the seam
  from one region to N. The single cell is the degenerate case, so nothing forks.
  [A focused split panel routes keystrokes to the focused cell][split-keys] then refines
  [A focused panel routes keystrokes to its active pane content][panel-keys] at the same grain.
- [A focused pane consumes only its own scoped bindings][scoped-bindings] bounds
  [panel-keys]. Routing to the focused pane is not enough on its own: a global chord that merely
  MATCHED inside a pane context would be eaten. The record makes the matched binding's declared
  context the test, so the host never prefix-matches an action name.
- [Bracketed paste survives stream chunking][paste] assembles a second input kind once. Existing
  path tokens enter the focused pane when it declares the path-paste route, or leave through the
  application open-by-kind seam. Every other payload continues through the same focused-pane seam.
  Its fallback is [panel-keys] for a payload that arrives in pieces.
- [Visible panel contents own separate headed regions][headed-regions] and
  [Each panel instance owns one independent session][instance-session] separate PRESENCE from
  IDENTITY. The first says two contents coexist rather than becoming tabs; the second says each
  instance owns its own backend and releases it only on its own close.
- [A pane runtime owns its processes][pane-runtime] stands on [instance-session]. Once an instance
  owns a session, the host must not be the thing that builds it. The runtime owns the process end to
  end and the host keeps an opaque content.
- [The file tree is a pane content citizen][tree-citizen] and
  [Plugin panes use the shared pane and popup hosts][plugin-panes] are the seam's first two
  customers. They prove the socket takes a core pane and a plugin pane with no host edit.
- [A pane content projects through exactly one surface][one-surface] is the seam's sharpest
  refinement. A content returns cells OR paints its own renderables, never both and never neither.
  It exists because [source-text-citizen] could not use the seam otherwise: forcing the editor to
  return an empty `StyledText` would be a consumer suppressing the seam's core, which is the tell
  that a boundary is drawn in the wrong place.
- [The source text editor is a pane content citizen][source-text-citizen] stands on [one-surface].
  [The editor column's default occupant is a contribution][editor-default] stands on both: once the
  editor is an ordinary citizen, the column's occupant can be REGISTERED, so the editor becomes
  uninstallable like any other contribution.

**Membership and order.** [The active activity item determines its dock content][activity-active]
gives every registered dock content one activity identity. [Activity bar order is one persisted
sequence][activity-order] adds the second axis: membership comes from every dock registration, order
comes from one setting, and a disabled plugin keeps its slot. [A contributed dock side moves one
live pane][dock-side] changes which host owns a registration without changing the activity identity;
[One panel host owns keyboard focus][host-focus] makes the visible pane's focus follow that move.
[Panel content order is one persisted sequence][panel-order] gives the bottom panel two ordered
levels: groups in a container and members in a split group. [The panel contents list mirrors open
content][contents-list] is their visible projection — it stands on [panel-order] for both sequences
and on [instance-session] for what a row means. A singleton group is full width; only an explicit
split action creates a multi-member group.

**One geometry for paint and hit.** [Bounded list popups share paint and hit
geometry][popup-geometry] owns box bounds, search row, visible window, icon column, scrollbar, and
the row-to-item map for painting AND hit-testing:

- [Bounded list interactions live in one popup][popup-one] adds the behavior vocabulary on top of
  that geometry — filtering, wrapped selection, keep-open activation, drill-forward.
  [Popup hierarchy is mouse and keyboard reachable][popup-hierarchy] stands on it: the `..` parent
  is an ORDINARY row, so it inherits the one activation chokepoint instead of minting a second
  navigation model.
- [Completion reuses bounded popup geometry][completion-geometry] is the seam's hardest case. It
  hides the search row and the backdrop and anchors at a caret, and it still adds no second geometry.
- [List interactions inspect only visible rows][popup-visible-rows] bounds all three. It prices the
  seam: an item set may be scanned once, but movement, wheel, hover, accept, and paint may not grow
  with item count.
- [One painter draws every single-line text field][field-painter] supplies the caret and the state
  tone that [popup-geometry] delegates for its search row. It is the ui realization of the project
  record [editable text fields share one input model][proj-text-input]: the model owns the edit, the
  painter owns the cell.

The same shape recurs on surfaces that share no code with popups:
[Panel controls share paint and hit geometry][panel-controls],
[Splitter paint and hit testing share one geometry][splitter],
[Tab bars share paint and hit geometry][tab-bars],
[Command bar paint and hit geometry are identical][command-bar], and
[The right dock control owns the status edge][status-edge]. Each says the walk that PLACES a
control also RETURNS its hit segment. They are separate records because their generators differ —
a column cursor, a one-cell cross-axis rect, a right-pinned segment list — not because the rule
differs.

**Scrollbars and marks.** [A scrollable pane height is an input not an output][pane-height] is the
one reality record here, and it is the floor for every windowed surface: a height derived from
rendered content makes the render window feed itself. [A scrollbar track is derived per frame from
its region rect][scrollbar-track] stands on it — the track can only be derived per frame if the
region is not a function of what was drawn. [One scrollbar painter gives each axis equal visual
weight][solid-thumb] refines the same bar into ONE painter whose normalized rect also drives the
native hit test. [The editor overview derives from the decoration snapshot][overview] adds
marks to that bar without touching track or thumb geometry, and [TS diagnostics render as an
underline and overview mark][diagnostics] is one contributor into that projection, plus the reason
the diff gutter carries no diagnostic.

**The modal slot.** [Input overlays share one modal slot][modal-slot] is the ui statement of "one
owner of one obligation": exactly one input-capturing overlay is open:

- [Modal focus withdraws host terminal projections][modal-withdraws] extends the slot from CELLS to
  the host terminal. A modal owns the screen, so the hardware cursor and pixel placements withdraw.
- [Modal outside presses dismiss and consume][outside-press] gives the slot a pointer rule. One
  press dismisses and reaches nothing beneath.
- [Overlay dialogs stay inside the terminal][dialog-bounds] bounds the slot's geometry at every
  live size, and [Settings selection stays inside its viewport][settings-reveal] is that bound
  applied to one dialog's selected row.
- [Overlay keyboard actions have visible mouse paths][overlay-mouse] states the parity duty for
  every action in the slot. [Settings are editable by mouse per widget kind][settings-mouse] and
  [Right dock command and mouse affordance share one toggle][right-dock-toggle] are two instances:
  the widget zones the renderer drew this frame are the zones the click hits, and one closure serves
  the command and the button.
- [A context menu is modal and single-consumer][context-menu] is the slot for a pointer-opened menu,
  enforced by hit-grid construction rather than by per-handler guards.
- [The shortcut sheet lists the effective bindings][shortcut-sheet] is an occupant of the slot whose
  ROWS derive from the keybinding registry at read time, so the sheet cannot advertise a chord the
  keys do not run.
- [An overlay dismissal clears its cells in the same frame][dismissal-frame] constrains every
  dismissal above. It is methodological about the GAP: a state change and the projection an observer
  reads must be atomic for that observer.
- [A tooltip never intercepts input][tooltip] is the deliberate NON-member. It is display-only and
  masks its own hit-grid stamp. [A hover card reflects the language server type at the pointed
  symbol][hover-card] stands on it and takes exactly one exception — its own box scrolls — so long
  content stays reachable without joining the slot.

**Scroll, seen from the surface.** [One writer per scroll regime per frame][one-writer] is the ui
face of [One generator owns each scroll position][scroll-one-generator]. It names every offset in
this module — editor, git log, tree window, transcript, terminal scrollback — and requires one
writer per frame. Standing on it:

- [The wheel gesture resolves through one settings-sourced step][wheel-step] governs how a gesture
  is MEASURED before that write, so no consumer re-derives notch size.
- [Wheel impulses start their own frame sequence][wheel-first-frame] assigns the first-frame
  obligation to the shared viewport, so a queued impulse can never sit unadvanced at rest.
- [Same-direction notches accumulate until the glide ceiling][notch-accumulation] and
  [A fast glide crosses rows in many small steps][glide-steps] are the surface-visible forms of
  [Same-direction impulses accumulate to the ceiling][scroll-acc] and the cadence it must arrive in.

**Projection discipline.** [Renderables hold no model state][stateless-renderables] realizes the
project record [ivue owns state and OpenTUI owns projection][proj-ownership] inside this module, and
every body-painting record below stands on it:

- [Only the visible window is rendered][visible-window] prices the projection at O(viewport). It
  stands on [pane-height] as well: a window can be bounded only if the container is.
- [One visible file line is one visual row when word wrap is off][one-row] fixes row identity ABOVE
  the renderable. [The caret renders at the cursor display column][caret-column] and
  [Indent guides mark leading whitespace without shifting columns][indent-guides] both stand on that
  mapping — the caret anchors to the laid-out cell of the row, and a guide REPLACES the space in its
  column so the mapping does not move.
- [The selected range renders with a background][selection-background] keeps the model the only
  selection writer. [A scrollable text surface is drag-selectable with edge auto-scroll][drag-select]
  stands on it and on [one-writer]: the drag's own scroll is that frame's sole writer.
- [Selection stays anchored to an item][list-selection] is the same discipline for lists.
  Selection, hover, and scroll are three separate states. Click, keyboard movement, and the
  file-tree active-document reveal target an item before they write selection.

**The host names no domain.** [Status text is assembled from ordered
contributions][status-segments] is the status-bar instance of the shape that [panel-projection],
[plugin-panes], and [editor-default] state for slots: the host joins ordered contributions and never
names a domain.

## Constraint from outside

- *One provider creates every workspace buffer view* constrains this family from the workspace side.
  [The source text editor is a pane content citizen][source-text-citizen] says the pane's `dispose`
  releases the views its provider created; [One provider creates every workspace buffer
  view][ws-provider] is what makes that release EXPRESSIBLE, because one creator recorded what it
  made and one releaser frees it. Without it the pane could only guess which views were its own, and
  withdrawing the pane would leave live views behind — the orphaned-pane defect that
  [A pane runtime owns its processes][pane-runtime] fixed one layer up. The edge runs one way: the
  ui records may not name the view class, and the workspace record may not name a pane.
- `scroll.invariants.md` holds the cross-surface scroll generator. The ui records
  [one-writer], [wheel-step], [wheel-first-frame], [notch-accumulation], and [glide-steps] are the
  surface bindings of [One generator owns each scroll position][scroll-one-generator],
  [Every wheel event becomes one impulse][scroll-event-impulse],
  [Live motion defines gesture continuation][scroll-continuation],
  [The glide tail is bounded and effective][scroll-tail], and
  [Scroll frame cost is document-length independent][scroll-cost]. `scroll.lattice.md` owns how
  those five hold together; this file owns which ui surfaces are bound by them.
  [Driven scroll contracts derive their quantities][scroll-method] constrains how the ui scroll
  records may be verified — a measured frame count is never an expected constant.
- The project roots this family stands on are [The terminal shows a bounded viewport][proj-viewport],
  [Cost tracks the actively observed set][proj-cost], [Data flows one way][proj-flow],
  [Seams are drawn at the shared generator][proj-shared],
  [A pane is a self-contained scrollable viewport][proj-pane],
  [The host canvas is complete without plugins][proj-canvas], and
  [Appearance is data with a capability fallback][proj-appearance].

## The recurring shapes

**One owner of one obligation.** [modal-slot] owns input focus, [one-writer] owns a scroll offset,
[popup-geometry] owns a popup's cells, [scrollbar-track] owns a track, [instance-session] owns a
backend, and [editor-default] owns the editor column. Two owners of one obligation is this
repository's most frequent defect, and every one of those records was written after a second owner
appeared or was proposed.

**Paint and hit are one walk.** [popup-geometry], [panel-controls], [splitter], [tab-bars],
[command-bar], [settings-mouse], and [solid-thumb] all say the same thing in different geometry: the
cell that is drawn is the cell that acts. A second hit computation is not a bug that MAY appear — it
is a bug that always appears, because the two computations drift on the first layout change.

**The host holds an opaque occupant.** [panel-projection], [one-surface], [pane-runtime],
[editor-default], [plugin-panes], and [status-segments] each remove one host branch. The test they
share: adding a second occupant of that kind must cost zero host edits.

## Compositions — emergent guarantees

### Every occupant is uninstallable

**Members:** [pane seam][panel-projection] · [one surface][one-surface] ·
[source text citizen][source-text-citizen] · [registered default][editor-default] ·
[runtime-owned processes][pane-runtime] · [instance sessions][instance-session] — with
[one provider creates every workspace buffer view][ws-provider].

**Guarantee:** Every occupant of every slot — sidebar pane, panel cell, editor column — can be
withdrawn and reinstalled at runtime, leaving no live pane, process, or view behind.

**Mechanism of conjunction:** The host owns the slot and knows the occupant only through the seam.
A contribution registers the occupant, so withdrawal is expressible. The runtime releases its panes;
the content releases its views through the workspace's one releaser. Remove any one and the
withdrawal becomes partial: a live process, a rendering orphan, or a view no one frees.

**Breaks if:** A host file imports a pane runtime or an editor class; a second default provider takes
the column; a withdrawal path drops a registration without releasing what it built; a released pane
keeps the panel's keyboard focus.

### Exactly one consumer per input

**Members:** [one modal slot][modal-slot] · [outside presses][outside-press] ·
[modal withdrawal][modal-withdraws] · [context menu][context-menu] · [tooltip transparency][tooltip]
· [focused-cell routing][split-keys] · [scoped bindings][scoped-bindings].

**Guarantee:** Every keystroke and every press has exactly one consumer, and the user is never
trapped — reserved global chords still run.

**Mechanism of conjunction:** The slot admits one input overlay. The modal owns the hit grid and the
host-terminal projections while it is open. Below the slot, focus picks one cell, and the pane takes
only bindings that declared its context. The tooltip is deliberately outside and masks its own hit
stamp, so it cannot become a second consumer by accident.

**Breaks if:** Two overlays report open; a press both dismisses a modal and edits the pane beneath; a
pane swallows a global chord; a display-only surface joins the hit grid; the panel branch runs while
a modal owns the keyboard.

### A painted cell is the cell that acts

**Members:** [popup geometry][popup-geometry] · [panel controls][panel-controls] ·
[splitter][splitter] · [tab bars][tab-bars] · [command bar][command-bar] ·
[settings widgets][settings-mouse] · [solid thumb][solid-thumb] · [popup hierarchy][popup-hierarchy].

**Guarantee:** No pointer target in the ui can drift from what the user sees, at any terminal width
and after any resize.

**Mechanism of conjunction:** Each surface computes its segments ONCE, during the walk that places
the glyphs, and resolves pointer input from those stored segments. The thumb goes further: the
normalized painted rect REPLACES the native hit rect, so one rect serves both.

**Breaks if:** A hit test re-derives a column from a label length; a control is placed by one walk and
hit-tested by another; a narrow heading leaves an invisible clickable control; a drag grab-point
disagrees with the drawn thumb.

### Mouse and keyboard cannot disagree

**Members:** [overlay mouse paths][overlay-mouse] · [settings widgets][settings-mouse] ·
[right dock toggle][right-dock-toggle] · [popup hierarchy][popup-hierarchy] ·
[activity selection][activity-active] · [list selection][list-selection] ·
[the shortcut sheet][shortcut-sheet].

**Guarantee:** Every action reachable by keyboard is reachable by mouse and reaches the SAME model
method, and the sheet that advertises the chords cannot lie about them.

**Mechanism of conjunction:** Pointer handlers call the model method the key binding calls, never a
parallel path. One active identity drives both the accent and the rendered content. The sheet reads
effective bindings at read time instead of a hand-written list, so a rebind relabels it with no
bookkeeping. The mouse is the reliability floor when terminal key delivery is missing.

**Breaks if:** A pointer edit bypasses the keyboard's adjust path; Enter and a click activate
different rows; the accent moves without switching the content; a chord string is written into the
sheet's row source.

### The frame costs a screenful

**Members:** [pane height is an input][pane-height] · [visible window only][visible-window] ·
[visible-row list work][popup-visible-rows] · [stateless renderables][stateless-renderables] ·
[glide cadence][glide-steps] — on [cost tracks the actively observed set][proj-cost].

**Guarantee:** Frame cost tracks the visible window, not the document, the repository, or the item
count — and it stays that way while the user is scrolling fast.

**Mechanism of conjunction:** A pinned height keeps the render window from feeding itself; the
window is the only thing materialized; list work is bounded by visible rows; renderables hold no
per-item model state to grow; and the glide delivers its travel in many small per-frame steps, so no
single frame does a document-sized amount of work.

**Breaks if:** A scrollable pane sizes to its content; a paint walks a full item set for a width; a
reactive object per row or cell appears; a frame teleports the viewport by more than the cadence
allows.

### Order and identity survive a restart

**Members:** [panel order][panel-order] · [activity order][activity-order] · [dock side][dock-side] ·
[contents list][contents-list] · [instance sessions][instance-session] ·
[headed regions][headed-regions] · [split cells][split-cells].

**Guarantee:** What the user arranged — which panes exist, in what order, in which cells — comes back
after a restart, after a plugin is disabled and re-enabled, and after a drag or a keyboard reorder.

**Mechanism of conjunction:** One persisted sequence per dock is the single authority. Membership
comes from registration and order from settings, so an unregistered identifier stays inert instead of
being deleted. The contents list, the split, and the docked rows all READ that one sequence rather
than keeping copies.

**Breaks if:** Drag and keyboard reorder write different sequences; a list row moves without its
cell; disabling a plugin deletes its identifier; a second boot restores an older order.

### An overlay's disappearance is atomic

**Members:** [same-frame dismissal][dismissal-frame] · [one modal slot][modal-slot] ·
[modal withdrawal][modal-withdraws] · [dialog bounds][dialog-bounds] · [hover card][hover-card].

**Guarantee:** When an overlay is dismissed, nothing it drew — cells, hardware cursor, or pixel
placement — survives into the frame an observer can read.

**Mechanism of conjunction:** The compositor repaints only what changed, so a flag alone leaves
stamped cells. The dismiss handler hides the renderables in the same handler that changes the state,
and the modal derivation withdraws the out-of-band projections in the same frame. Reactively
dismissed overlays are exempt for a stated reason: their mutation and their paint land in one tick,
so no gap exists to close.

**Breaks if:** A dismiss handler flips a flag and waits for a later reactive paint; a kitty placement
survives above a modal; a resize while a modal is open restores the old geometry.

### The editor is an ordinary citizen

**Members:** [one surface][one-surface] · [source text citizen][source-text-citizen] ·
[registered default][editor-default] · [stateless renderables][stateless-renderables] ·
[caret column][caret-column] · [selection background][selection-background] ·
[one visual row][one-row] · [indent guides][indent-guides] · [drag selection][drag-select] ·
[diagnostics][diagnostics] · [overview marks][overview].

**Guarantee:** The hottest surface of the product goes through the same seam as a terminal pane, and
loses none of its native behavior: native selection, the terminal's own caret, wide-glyph columns,
underlines, and overview pips are unchanged.

**Mechanism of conjunction:** The capability split lets the content paint its own renderables while
the host still owns the slot. Row identity, caret column, and selection stay decided above the
renderable, so the projection can be rebuilt without moving them. Marks and underlines read the one
decoration snapshot the gutter and body already read. This composition supplies the ui members of
`project.lattice.md`'s *Source text state survives replaceable projection*; the model side lives
there.

**Breaks if:** The host calls a source-text renderer; a native content is forced to return cells; the
caret is derived from string length or a layout constant; a second decoration scan appears beside the
overview.

## The generated system

Because the host projects an OPAQUE pane content, everything that occupies space in this application
is the same kind of thing. A terminal, a file tree, a plugin pane, and the source text editor differ
only in what they paint and which capabilities they declare. That one decision generates the rest:
membership becomes registration, so order must be persisted separately from membership; ownership
becomes a runtime's duty, so withdrawal must release; and the editor becomes uninstallable, which is
observable proof that no host branch names it.

Because a bounded viewport prices every frame, the window is the unit of work everywhere — the
editor body, the tree, every bounded list, and every glide frame. Because a pane's height is an
INPUT, that window can be bounded at all.

Because exactly one surface may own input at a time, the modal slot, the pointer backdrop, the
focused cell, and the scoped-binding test are one rule seen at four grains. And because a painted
cell must be the cell that acts, every control in the ui computes its geometry once and answers both
questions from it.

[pane-height]: ui.invariants.md#a-scrollable-pane-height-is-an-input-not-an-output
[status-segments]: ui.invariants.md#status-text-is-assembled-from-ordered-contributions
[plugin-panes]: ui.invariants.md#plugin-panes-use-the-shared-pane-and-popup-hosts
[field-painter]: ui.invariants.md#one-painter-draws-every-single-line-text-field
[popup-geometry]: ui.invariants.md#bounded-list-popups-share-paint-and-hit-geometry
[popup-visible-rows]: ui.invariants.md#list-interactions-inspect-only-visible-rows
[popup-one]: ui.invariants.md#bounded-list-interactions-live-in-one-popup
[popup-hierarchy]: ui.invariants.md#popup-hierarchy-is-mouse-and-keyboard-reachable
[panel-controls]: ui.invariants.md#panel-controls-share-paint-and-hit-geometry
[panel-order]: ui.invariants.md#panel-content-order-is-one-persisted-sequence
[activity-order]: ui.invariants.md#activity-bar-order-is-one-persisted-sequence
[contents-list]: ui.invariants.md#the-panel-contents-list-mirrors-open-content
[completion-geometry]: ui.invariants.md#completion-reuses-bounded-popup-geometry
[splitter]: ui.invariants.md#splitter-paint-and-hit-testing-share-one-geometry
[headed-regions]: ui.invariants.md#visible-panel-contents-own-separate-headed-regions
[status-edge]: ui.invariants.md#the-right-dock-control-owns-the-status-edge
[tab-bars]: ui.invariants.md#tab-bars-share-paint-and-hit-geometry
[activity-active]: ui.invariants.md#the-active-activity-item-determines-its-dock-content
[dock-side]: ui.invariants.md#a-contributed-dock-side-moves-one-live-pane
[host-focus]: ui.invariants.md#one-panel-host-owns-keyboard-focus
[indent-guides]: ui.invariants.md#indent-guides-mark-leading-whitespace-without-shifting-columns
[modal-slot]: ui.invariants.md#input-overlays-share-one-modal-slot
[modal-withdraws]: ui.invariants.md#modal-focus-withdraws-host-terminal-projections
[dialog-bounds]: ui.invariants.md#overlay-dialogs-stay-inside-the-terminal
[overlay-mouse]: ui.invariants.md#overlay-keyboard-actions-have-visible-mouse-paths
[outside-press]: ui.invariants.md#modal-outside-presses-dismiss-and-consume
[shortcut-sheet]: ui.invariants.md#the-shortcut-sheet-lists-the-effective-bindings
[one-writer]: ui.invariants.md#one-writer-per-scroll-regime-per-frame
[wheel-step]: ui.invariants.md#the-wheel-gesture-resolves-through-one-settings-sourced-step
[notch-accumulation]: ui.invariants.md#same-direction-notches-accumulate-until-the-glide-ceiling
[wheel-first-frame]: ui.invariants.md#wheel-impulses-start-their-own-frame-sequence
[glide-steps]: ui.invariants.md#a-fast-glide-crosses-rows-in-many-small-steps
[context-menu]: ui.invariants.md#a-context-menu-is-modal-and-single-consumer
[tooltip]: ui.invariants.md#a-tooltip-never-intercepts-input
[hover-card]: ui.invariants.md#a-hover-card-reflects-the-language-server-type-at-the-pointed-symbol
[dismissal-frame]: ui.invariants.md#an-overlay-dismissal-clears-its-cells-in-the-same-frame
[stateless-renderables]: ui.invariants.md#renderables-hold-no-model-state
[visible-window]: ui.invariants.md#only-the-visible-window-is-rendered
[one-row]: ui.invariants.md#one-visible-file-line-is-one-visual-row-when-word-wrap-is-off
[caret-column]: ui.invariants.md#the-caret-renders-at-the-cursor-display-column
[selection-background]: ui.invariants.md#the-selected-range-renders-with-a-background
[drag-select]: ui.invariants.md#a-scrollable-text-surface-is-drag-selectable-with-edge-auto-scroll
[scrollbar-track]: ui.invariants.md#a-scrollbar-track-is-derived-per-frame-from-its-region-rect
[overview]: ui.invariants.md#the-editor-overview-derives-from-the-decoration-snapshot
[solid-thumb]: ui.invariants.md#one-scrollbar-painter-gives-each-axis-equal-visual-weight
[list-selection]: ui.invariants.md#selection-stays-anchored-to-an-item
[diagnostics]: ui.invariants.md#ts-diagnostics-render-as-an-underline-and-overview-mark
[settings-reveal]: ui.invariants.md#settings-selection-stays-inside-its-viewport
[settings-mouse]: ui.invariants.md#settings-are-editable-by-mouse-per-widget-kind
[right-dock-toggle]: ui.invariants.md#right-dock-command-and-mouse-affordance-share-one-toggle
[command-bar]: ui.invariants.md#command-bar-paint-and-hit-geometry-are-identical
[tree-citizen]: ui.invariants.md#the-file-tree-is-a-pane-content-citizen
[panel-projection]: ui.invariants.md#the-panel-renders-exactly-the-visible-pane-content-cells-each-frame
[instance-session]: ui.invariants.md#each-panel-instance-owns-one-independent-session
[panel-keys]: ui.invariants.md#a-focused-panel-routes-keystrokes-to-its-active-pane-content
[split-cells]: ui.invariants.md#a-split-panel-renders-every-visible-cell-into-its-own-sub-region
[split-keys]: ui.invariants.md#a-focused-split-panel-routes-keystrokes-to-the-focused-cell
[paste]: ui.invariants.md#bracketed-paste-survives-stream-chunking
[pane-runtime]: ui.invariants.md#a-pane-runtime-owns-its-processes
[scoped-bindings]: ui.invariants.md#a-focused-pane-consumes-only-its-own-scoped-bindings
[one-surface]: ui.invariants.md#a-pane-content-projects-through-exactly-one-surface
[source-text-citizen]: ui.invariants.md#the-source-text-editor-is-a-pane-content-citizen
[editor-default]: ui.invariants.md#the-editor-columns-default-occupant-is-a-contribution
[ws-provider]: ../workspace/workspace.invariants.md#one-provider-creates-every-workspace-buffer-view
[scroll-one-generator]: scroll.invariants.md#one-generator-owns-each-scroll-position
[scroll-event-impulse]: scroll.invariants.md#every-wheel-event-becomes-one-impulse
[scroll-acc]: scroll.invariants.md#same-direction-impulses-accumulate-to-the-ceiling
[scroll-continuation]: scroll.invariants.md#live-motion-defines-gesture-continuation
[scroll-tail]: scroll.invariants.md#the-glide-tail-is-bounded-and-effective
[scroll-cost]: scroll.invariants.md#scroll-frame-cost-is-document-length-independent
[scroll-method]: scroll.invariants.md#driven-scroll-contracts-derive-their-quantities
[proj-cost]: project.invariants.md#cost-tracks-the-actively-observed-set
[proj-viewport]: project.invariants.md#the-terminal-shows-a-bounded-viewport
[proj-ownership]: project.invariants.md#ivue-owns-state-and-opentui-owns-projection
[proj-flow]: project.invariants.md#data-flows-one-way
[proj-shared]: project.invariants.md#seams-are-drawn-at-the-shared-generator
[proj-pane]: project.invariants.md#a-pane-is-a-self-contained-scrollable-viewport
[proj-canvas]: project.invariants.md#the-host-canvas-is-complete-without-plugins
[proj-text-input]: project.invariants.md#editable-text-fields-share-one-input-model
[proj-appearance]: project.invariants.md#appearance-is-data-with-a-capability-fallback
