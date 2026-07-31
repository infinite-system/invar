# Field v2 research sources

This source set supports the choices in the
[design language](design-language-spec.md) and
[interaction specification](interaction-spec.md). Each note states the part
that Field v2 adopts.

## Spatial interfaces

- [EVE Online 2D star map playtest](https://www.eveonline.com/news/view/2d-star-map-playtest)
  names region layout, zoom thresholds, and data scaling as core map concerns.
  Field v2 treats these as testable parts of the map, not visual polish.
- [EVE Online overview settings](https://support.eveonline.com/hc/en-us/articles/203273831-Overview-Settings)
  lets users filter the visible tactical set. Field v2 keeps domain and kind
  filters near the field.
- [Elite Dangerous player guide](https://d1wv0x2frmpnh.cloudfront.net/elite/website/assets/English-PlayersGuide_v2.00-Horizons.pdf)
  documents camera translation in a three-dimensional galaxy map. Field v2
  uses a constrained camera with an explicit reset.
- [Into the Breach design postmortem slides](https://media.gdcvault.com/gdc2019/presentations/Into%20the%20Breach%20Postmortem%20Final.pdf)
  show UI-guided design and icon development. Field v2 gives each record kind
  a stable silhouette and keeps outcomes legible before decoration.
- [Territory Studio, Jupiter Ascending](https://territorystudio.com/project/jupiter-ascending/)
  uses isometric lines to show invisible forces. Field v2 uses restrained
  contour lines to make inward rank pressure and outward rot visible.

## Data visualization and playful exploration

- [D3 radial position force](https://d3js.org/d3-force/position) defines a
  force toward the nearest point on a circle. Field v2 can use this force to
  settle records on semantic rank shells while collision remains separate.
- [Observable D3 force-directed graph](https://observablehq.com/@d3/force-directed-graph)
  shows group color, node titles, link width, and simulation invalidation in
  one inspectable graph. Field v2 separates group hue, node identity, and
  relation weight in the same way.
- [three.js point examples](https://threejs.org/examples/?q=points) show point
  clouds, sprites, and interactive point raycasting. Field v2 can batch record
  marks while retaining direct picking.
- [three.js picking guide](https://threejs.org/manual/en/picking.html) explains
  ray and GPU picking tradeoffs. Field v2 specifies a generous pick proxy
  around each smaller visual mark.
- [Bruno Simon’s portfolio](https://bruno-simon.com/lab/experiments/terrain-shader/)
  exposes controls, quality, audio, reset, and recovery beside a playful
  world. Field v2 borrows the toy-like directness, but keeps the map’s meaning
  ahead of spectacle.

## Motion and game feel

- [Material motion duration and easing](https://m1.material.io/motion/duration-easing.html)
  recommends short desktop motion, distance-aware duration, and asymmetric
  acceleration. Field v2 uses 90 to 180 milliseconds for chrome and longer,
  cancellable flights for spatial travel.
- [Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion)
  asks for purposeful, brief, precise, optional, and cancellable motion.
  Field v2 never locks input behind an animation.
- [Good Game Feel](https://doi.org/10.26503/dl.v2018i1.936) frames juice as
  audiovisual feedback that makes an action feel meaningful. Field v2 uses
  small confirmation stacks only for user actions and timeline events.
- [Designing Game Feel survey](https://arxiv.org/abs/2011.09201) separates
  physicality, amplification, and support. Field v2 uses stable spatial rules,
  selective emphasis, and forgiving input as separate concerns.

## Product chrome

- [Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)
  describes perceptual color work and expressive headings with readable body
  type. Field v2 uses restrained display type and a calmer instrument face.
- [Vercel Geist colors](https://vercel.com/geist/colors) separates background,
  component, border, and text steps. Field v2 uses the same role separation
  instead of one gray for every surface.
- [Vercel Geist material](https://vercel.com/geist/material) recommends the
  lowest elevation that still reads. Field v2 reserves strong elevation for
  the lens and transient overlays.
- [Vercel web interface guidelines](https://vercel.com/design/guidelines)
  recommend deliberate alignment, layered shadows, crisp borders, tabular
  numbers, and explicit animated properties. Field v2 applies these rules to
  the instrument chrome.
- [Radix Themes color](https://www.radix-ui.com/themes/docs/theme/color)
  assigns separate steps to backgrounds, interactions, borders, solids, and
  text. Field v2 keeps semantic roles independent from raw colors.
- [shadcn/ui theming](https://ui.shadcn.com/docs/theming) pairs semantic
  surface tokens with foreground tokens. Field v2 tokens use role names so a
  builder does not copy raw hex values into components.

## Accessibility

- [WCAG 2.2 text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)
  requires 4.5:1 for normal text and 3:1 for large text.
- [WCAG 2.2 non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
  requires 3:1 for meaningful controls, states, and graphical objects.
- [WCAG animation from interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html)
  requires a way to disable non-essential interaction motion.
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)
  documents the browser media query that detects this preference.
- [Apple reduced motion criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria)
  recommends replacing depth, pan, and scale motion with dissolve, highlight,
  or color changes when motion carries meaning.
