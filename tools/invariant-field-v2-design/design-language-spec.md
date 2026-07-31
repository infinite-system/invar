# Field v2 design language

## Direction

Field v2 is a dark scientific instrument with the directness of a good game.
It must feel alive only when data or the user acts. It must become quiet at
rest.

The core image is an invariance well. Reality sits at the center as an
asymptote. Strong records settle inward. Weak, stale, or unsupported records
drift toward the rim. The layout makes the rank model visible before the user
opens a formula.

This direction combines the tactical filtering of
[EVE Online](https://support.eveonline.com/hc/en-us/articles/203273831-Overview-Settings),
the spatial navigation of the
[Elite Dangerous map](https://d1wv0x2frmpnh.cloudfront.net/elite/website/assets/English-PlayersGuide_v2.00-Horizons.pdf),
and the UI-led clarity shown in the
[Into the Breach postmortem](https://media.gdcvault.com/gdc2019/presentations/Into%20the%20Breach%20Postmortem%20Final.pdf).
The complete research set is in [sources.md](sources.md).

## Design principles

### Meaning before spectacle

Every bright mark carries data. Every moving mark shows a state change. Empty
space, depth fog, and glow are framing devices. They never become another
dataset.

[Into the Breach’s UI-guided design](https://media.gdcvault.com/gdc2019/presentations/Into%20the%20Breach%20Postmortem%20Final.pdf)
supports stable icon meaning. [Apple’s motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion)
supports purposeful motion that does not overshadow the task.

### One channel, one job

Radius carries rank. Angular sector carries domain. Hue names the domain.
Silhouette names the record kind. Surface treatment shows verification.
Corrosion marks show rot. A channel never changes meaning between views.

This separation follows the inspectable encodings in the
[Observable force graph](https://observablehq.com/@d3/force-directed-graph).
It also meets the rule to
[avoid color-only status](https://vercel.com/geist/badge).

### Quiet at rest, immediate on contact

The resting field does not pulse, orbit, or drift. Hover responds in 90
milliseconds. Selection confirms in 140 milliseconds. A longer camera flight
may follow, but input can interrupt it at once.

[Material motion](https://m1.material.io/motion/duration-easing.html) places
desktop transitions in the 150 to 200 millisecond range and varies duration
with travel. [Apple](https://developer.apple.com/design/human-interface-guidelines/motion)
asks for brief, precise, and cancellable feedback.

### Depth must explain structure

Three-dimensional depth separates domains and relation planes. It does not
change rank. The exact radius remains visible through rings, labels, and the
2D view. The user can always reset the camera.

The EVE map team calls out
[region layout, zoom thresholds, and data scaling](https://www.eveonline.com/news/view/2d-star-map-playtest)
as core map concerns. Field v2 makes all three explicit controls.

## Visual identity

The canvas starts at `#06080C`. Panels rise through `#0D131C` and `#111A26`.
Borders use blue-gray light instead of white opacity. This produces a
terminal-native black field without flat black-on-gray stacking.

The main light is cold cyan. Reality is warm gold. Selection is violet.
Alarm and rot use separate red and orange values. The exact values live in
[tokens.ts](tokens.ts) and [tokens.css](tokens.css).

Panels use one thin border, a faint inner highlight, and the lowest useful
shadow. The lens is the only persistent high surface.
[Vercel’s material guidance](https://vercel.com/geist/material) supports this
low-elevation rule.

Glow has three layers:

1. A crisp mark preserves location.
2. A narrow halo marks interaction or semantic weight.
3. A broad, faint bloom gives depth.

No normal dot uses the broad bloom. Reality, current selection, and alarm are
the only persistent bloom owners.

Fine contour lines describe the pull toward reality. This adapts
[Territory Studio’s use of isometric lines](https://territorystudio.com/project/jupiter-ascending/)
to show invisible forces. Lines stay below meaningful-graphic contrast unless
the user selects their record.

## Semantic encoding

| Property | Visual encoding | Rule |
|---|---|---|
| Rank | Distance from `R` | Radius is identical in 2D and 3D. |
| Domain | Angular sector and hue | Labels stay on the outer frame. |
| Reality absolute | Four-point diamond | The filled center stays light. |
| Reality renegotiable | Open hexagon | The open center signals a condition. |
| Chosen | Filled circle | This is the most common and quietest mark. |
| Executed pass | Crisp core and complete rim | The record looks resolved. |
| Citation only | Half rim | The record keeps a visible open question. |
| Missing or failed | Broken rim and alarm notch | Shape carries the failure with color. |
| Selected | Violet bracket, anchor line, and label | Selection never depends on size alone. |
| Lattice membership | Thin relation arc | Width shows relation weight. |
| Rot | Orange fracture and outward trail | Rot is a change, not a permanent animation. |
| Orphan pressure | Amber outward tick | The tick points away from `R`. |

The shape-plus-color rule follows
[WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
and Vercel’s
[redundant status guidance](https://vercel.com/design/guidelines).

## Field anatomy

### Reality well

`R` is a small gold core with two quiet rings. It never becomes a sun or
decorative star. Its label reads `REALITY / ASYMPTOTE` at high zoom and `R`
below that.

### Rank shells

Five labeled shells mark the current rank bands. The labels show numeric
radius on hover or keyboard focus. Shells are ellipses in perspective and
circles in 2D. Their data values do not change between modes.

### Domain sectors

Eight stable hue slots wrap around the field. Repository domains map to these
slots by a stable hash. Users can filter or isolate a domain without changing
its angle. New domains split the least occupied sector only after an explicit
layout migration.

### Record marks

The visual mark is 8 pixels at default zoom. Its pick proxy is at least 24
pixels. The chosen mark grows to 12 pixels without moving its center.
[three.js point picking](https://threejs.org/manual/en/picking.html) supports
separate visual and picking representations.

### Relation traces

Relations appear only for the selected record, active lattice, or timeline
event. Unrelated traces fade to zero within 900 milliseconds. The field never
shows a permanent hairball.

### Instrument chrome

The top bar holds identity, snapshot state, view mode, search, and sound
status. The left rail holds domain filters. The right lens holds the selected
record. The timeline forms the bottom edge. Chrome aligns to a 4-pixel base
grid, following [Vercel’s deliberate alignment guidance](https://vercel.com/design/guidelines).

## Two-dimensional presentation

The 2D view is the measurement view. It uses exact concentric circles and
fixed domain wedges. Labels remain horizontal. Relation lines use bundled
curves around the clear central well.

Use 2D for comparison, dense selection, screenshots, reduced motion, and
keyboard-only review. It is not a fallback with fewer data channels.

A radial force may settle collision offsets along each semantic shell.
[D3 forceRadial](https://d3js.org/d3-force/position) supplies the right
constraint because it pushes toward a circle without redefining the radius.

## Three-dimensional presentation

The 3D view is the exploration view. Start near orthographic, with a 12-degree
pitch and no yaw. Limit manual orbit to 12 degrees of pitch and 24 degrees of
yaw. Prevent roll.

Rank stays in the base plane. Domain families may lift into shallow relation
planes. Selection brings a local neighborhood forward. The camera keeps the
reality core or a fixed axis visible as a stationary reference.

Batch dots as point sprites. Use a separate pick proxy when density demands
it. [three.js examples](https://threejs.org/examples/?q=points) show both
point clouds and interactive point raycasting.

## Timeline dramaturgy

Timeline play is a sequence of evidence changes, not a screensaver.

### Birth

A new record first appears as a quiet outline on the rim. Its domain hue
arrives in 140 milliseconds. The record then settles inward over 420
milliseconds. A short radial trace shows its first rank.

### Strengthening

Evidence or verification pulls a record inward. The old position remains as
a faint ring. The record lands with one 140-millisecond confirmation halo.

### Weakening

Lost evidence moves the record outward with an orange trailing line. The
movement uses the 520-millisecond exit curve. No shake or bounce appears.

### Rot

Rot fractures the rim before the outward move begins. The lens states the
cause in text. Alarm red is reserved for failed execution. Rot orange marks
age, unresolved citations, or decayed support.

### Death

A removed record collapses to an outline and dissolves. It never flies into
reality or explodes. The timeline keeps its departure marker.

### Snapshot change

The timestamp updates first. Changes receive a 140-millisecond signal. Spatial
morphing follows over 640 milliseconds. The next snapshot can interrupt the
current morph. This follows
[Material’s distance-aware duration](https://m1.material.io/motion/duration-easing.html)
and [Apple’s cancellable-motion rule](https://developer.apple.com/design/human-interface-guidelines/motion).

## Typography and density

Use the interface family for record names and prose. Use the instrument
family for paths, ranks, hashes, timestamps, and axis labels. Tabular numbers
prevent metric jitter, as recommended by
[Vercel’s interface guidelines](https://vercel.com/design/guidelines).

Body text starts at 14 pixels. Metadata starts at 12 pixels. Micro labels may
use 10 pixels only when they are redundant and non-interactive. The type scale
is in [tokens.ts](tokens.ts).

The field gets visual space. Chrome stays dense. The lens uses reading line
height and never compresses invariant prose into a dashboard tile.

## Accessibility floor

Normal text must reach 4.5:1 contrast. Large text and meaningful graphics must
reach 3:1. These values come from
[WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
and [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Every record is reachable from the list and the field. The field uses a
roving tab stop. Arrow keys move to the nearest record in that direction.
Enter selects. Escape returns to the prior focus owner.

Color never carries kind, verification, rot, or selection alone. Labels,
silhouettes, line patterns, and text duplicate those states.

The reduced-motion mode responds to
[`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion).
It makes 2D the default. It replaces camera travel, parallax, scale, and
spatial morphs with a 120-millisecond dissolve and a persistent position
trace. This follows
[Apple’s reduced-motion criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria).

Sound stays off by default. No state relies on sound. If a future build adds
sound, it needs a visible toggle, separate volume, and no autoplay.

## Responsive behavior

At widths above 1180 pixels, show the domain rail, field, and lens together.
Between 760 and 1179 pixels, overlay the lens after selection. Below 760
pixels, use the 2D field above a full-width list and lens.

At every width, preserve the field, selected record, view toggle, timeline,
and search. Reduce decoration before reducing data.

## Acceptance checks for build tasks

- A user can name rank, domain, kind, verification, selection, and rot without
  opening the formula.
- A screenshot remains readable in grayscale.
- 2D and 3D show the same rank radius for every record.
- The field is still when data and input are still.
- Selection responds within 140 milliseconds.
- Camera travel never blocks another selection.
- Reduced motion removes pan, zoom, parallax, and scale transitions.
- The list can reach every field record.
- The field remains legible at sparse, normal, and dense snapshots.
- The user can reset the camera and recover from every exploratory state.

The [static proof](mockup.html) tests the visual direction. It does not prove
the final data layout or renderer performance.
