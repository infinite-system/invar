# Field v2 interaction specification

## Shared grammar

Every direct action gets visible feedback within 140 milliseconds. Longer
motion may continue after that signal. It must stay cancellable.

The timing follows
[Material’s desktop motion guidance](https://m1.material.io/motion/duration-easing.html)
and [Apple’s brief, precise feedback rule](https://developer.apple.com/design/human-interface-guidelines/motion).
The exact durations and curves live in [tokens.ts](tokens.ts).

The interaction stack has three parts:

1. A contact signal confirms the input.
2. A state signal shows what changed.
3. A spatial transition preserves context when location changed.

This separates control, amplification, and support in the way described by
the [Designing Game Feel survey](https://arxiv.org/abs/2011.09201).

Input always wins over animation. A second selection retargets the current
flight. Escape cancels transient motion and restores the previous focus.
Apple recommends that users can
[cancel motion without waiting](https://developer.apple.com/design/human-interface-guidelines/motion).

## Field surface

| State | Presentation | Input | Transition |
|---|---|---|---|
| Rest | Still field, quiet grid, no ambient pulse | Pan, orbit, zoom, filter, search | None |
| Pointer hover | Nearest mark gets a crisp rim and short label | Pointer move | 90 ms enter, 70 ms exit |
| Keyboard explore | One roving focus bracket and directional neighbors | Arrow keys | 90 ms bracket move |
| Panning | Grid and dots move together, chrome stays fixed | Primary drag or Space-drag | Direct, no easing |
| Orbiting | Pitch and yaw stay within their limits | Secondary drag | Direct, no inertia |
| Zooming | Semantic zoom replaces labels at thresholds | Wheel or pinch | 180 ms after input ends |
| Filtered | Excluded domains dim and stop picking | Domain controls | 180 ms opacity |
| Empty result | Field remains, with a centered recovery action | Search or filter | 180 ms dissolve |
| Reduced motion | Exact 2D rings and dissolve changes | Same commands | 120 ms opacity only |

Panning and orbiting do not share a gesture. The
[Elite Dangerous guide](https://d1wv0x2frmpnh.cloudfront.net/elite/website/assets/English-PlayersGuide_v2.00-Horizons.pdf)
supports explicit camera translation controls. A visible reset prevents
spatial dead ends, as demonstrated by the recovery controls in
[Bruno Simon’s portfolio](https://bruno-simon.com/lab/experiments/terrain-shader/).

## Record dot

| State | Presentation | Input | Transition |
|---|---|---|---|
| Rest | Kind silhouette, domain hue, verification rim | None | None |
| Hover | Crisp rim, 24 px hit proxy, one-line label | Pointer | 90 ms |
| Focus | Cyan bracket and full accessible name | Tab or arrows | 90 ms |
| Pressed | Core contracts to 92 percent | Pointer down or Space | 70 ms |
| Selected | Violet bracket, anchor line, persistent label | Click, Enter, Space | 140 ms confirm |
| Related | Thin relation trace and 80 percent core | Select another record | 180 ms |
| Muted | 24 percent opacity, still visible in context | Filter or lattice focus | 180 ms |
| Alarm | Broken rim, red notch, text in lens | Failed verification | 140 ms signal |

The visual dot remains small while the pick proxy stays generous. This
separates display density from picking accuracy, following the
[three.js picking guide](https://threejs.org/manual/en/picking.html).

Selection starts on input, not on release animation. The immediate contact
signal is the game-like part. The field does not add shake, particles, or
sound to routine selection.

## Focus flight

The contact signal appears in 140 milliseconds. The camera starts only after
the selected state exists. It flies for at most 520 milliseconds with
`focusFlight`.

The selected record ends inside the central 62 percent safe region. Reality
or one fixed axis remains visible. The lens may open during the flight, but
the selected record never hides behind it.

If the record already sits in the safe region, do not move the camera. If the
user pans, orbits, zooms, or selects another record, retarget or stop the
flight immediately.

Reduced motion skips the flight. It draws an anchor line, dissolves the new
selection, and updates the lens.
[Apple’s reduced-motion criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria)
recommend dissolve, highlight, or color changes in place of depth motion.

## Record card

| State | Presentation | Input | Transition |
|---|---|---|---|
| Rest | Name, kind glyph, rank, domain, status | None | None |
| Hover | Border gains one contrast step | Pointer | 90 ms |
| Focus | Cyan 2 px outline | Tab | Immediate |
| Selected | Violet left rule and `Selected` text | Click or Enter | 140 ms |
| Expanded | Evidence, mechanism, and verification become visible | Disclosure button | 180 ms |
| Loading | Stable skeleton matches final rows | Data request | 180 ms dissolve |
| Error | Inline reason and retry action | Failed request | 140 ms alarm |

Cards do not float on hover. Elevation marks hierarchy, not pointer presence.
This follows [Vercel’s low-elevation guidance](https://vercel.com/geist/material).

## Record list

| State | Presentation | Input | Transition |
|---|---|---|---|
| Rest | Dense rows with stable columns | None | None |
| Hover | Row background gains one step | Pointer | 90 ms |
| Focus | Full-row focus outline | Arrow keys or Tab | Immediate |
| Selected | Violet rule, selected text, field sync | Enter or click | 140 ms |
| Sorted | Header arrow and announced order | Header action | 180 ms |
| Filtered | Result count updates beside filters | Filter action | 180 ms |
| Virtualized | Only the visible window mounts | Scroll | Direct |

List selection and field selection are one state. Neither surface mirrors a
private copy.

## Timeline

| State | Presentation | Input | Transition |
|---|---|---|---|
| Rest | Commit track, current marker, change counts | None | None |
| Hover | Commit gets date, hash, and subject | Pointer | 90 ms |
| Scrubbing | Snapshot follows the thumb with no easing | Drag | Direct |
| Step | Timestamp updates, then change signals appear | Arrow or step button | 140 ms signal |
| Playing | Marker advances after each settled snapshot | Play | 640 ms morph |
| Paused | Current geometry freezes at once | Pause, scrub, select | 70 ms |
| End | Play changes to replay, no automatic loop | Final snapshot | 180 ms |

Playback order per snapshot is fixed:

1. Update the timestamp and commit label.
2. Mark births, deaths, strengthening, weakening, and rot.
3. Morph record positions.
4. Settle the field.
5. Advance only when the prior snapshot settles.

Do not use a fixed frame count. Use the snapshot state as the completion
condition. The next user action may interrupt any step.

## Timeline events

| Event | Signal | Spatial action | Duration |
|---|---|---|---|
| Birth | White outline, then domain hue | Rim to ranked radius | 420 ms |
| Strengthen | Inward arrow and old-position ring | Move toward `R` | 520 ms |
| Weaken | Orange trail | Move away from `R` | 520 ms |
| Rot | Fractured rim and cause text | Outward only when rank changes | 520 ms |
| Removed | Empty outline and departure marker | Dissolve in place | 180 ms |
| Verification pass | Complete rim and success label | No move unless rank changes | 140 ms |
| Verification fail | Broken rim and alarm notch | No shake | 140 ms |

The sequence uses motion to explain change, not to decorate it. This matches
[Apple’s purpose-first motion rule](https://developer.apple.com/design/human-interface-guidelines/motion).

## Lens

| State | Presentation | Input | Transition |
|---|---|---|---|
| Closed | A thin selected-record tab remains | Escape or close | 180 ms exit |
| Preview | Name, rank, path, and one sentence | Hover hold or focus | 160 ms enter |
| Open | Full invariant record and calculation | Selection | 180 ms enter |
| Pinned | Pin label and stable width | Pin action | 140 ms confirm |
| Compare | Two columns share aligned fields | Compare action | 180 ms |
| Error | Inline source error and retry | Failed load | 140 ms alarm |

The lens does not cover the selected record. On narrow screens it becomes a
sheet and the field preserves the selected position before the sheet opens.

The lens uses the strongest persistent elevation. It keeps a crisp border
because shadow contrast weakens on dark surfaces, as noted by
[Vercel’s material guidance](https://vercel.com/geist/material).

## Search and filters

Search opens with `/` or the visible search control. Results update after
input without moving the camera. Enter selects the first result. Escape first
clears the query, then closes search.

Domain and kind filters use text, glyph, and hue. Active filters remain
visible above the field. A `Reset view` action clears camera, filters,
composition, and search without changing the snapshot.

[EVE Online’s overview](https://support.eveonline.com/hc/en-us/articles/203273831-Overview-Settings)
shows the value of a configurable visible tactical set. Field v2 keeps that
power shallow and reversible.

## Sound

Sound is off by default. The top bar always shows `SOUND OFF`. No hover,
selection, timeline, alarm, or success state requires audio.

A later opt-in sound set may use a quiet tick for timeline steps, a low chime
for inward settlement, and a dry click for selection. It must include a mute
shortcut and a volume control.

## Accessibility behavior

Text meets 4.5:1 contrast. Controls, focus, selected states, and meaningful
graphics meet 3:1, per
[WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
and [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

The field, list, timeline, and lens expose clear landmarks and accessible
names. Selection moves focus only when the user asked to move it. Pointer
selection does not steal keyboard focus.

`prefers-reduced-motion: reduce` selects 2D and removes camera, parallax,
scale, and spatial morphs. Non-essential interaction animation must be
disableable under
[WCAG animation guidance](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html).

The app keeps an explicit motion setting because some users need less motion
without changing the operating system. The system preference remains the
default authority.

## Input map

| Input | Action |
|---|---|
| Click or Enter | Select focused record |
| Arrow keys in field | Move to nearest record in that direction |
| Arrow keys on timeline | Step one snapshot |
| Space on timeline | Play or pause |
| Primary drag | Pan |
| Secondary drag | Orbit in 3D |
| Wheel or pinch | Zoom |
| `/` | Open search |
| `2` | Switch to exact 2D |
| `3` | Switch to constrained 3D |
| `0` | Reset camera |
| Escape | Cancel motion, then close transient UI |

All commands need visible buttons or menu entries. Keyboard shortcuts are
accelerators, not the only route.
