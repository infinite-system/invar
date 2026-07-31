# Brief 416-1 — Field v2 design language: research the net, write the spec

## Mission

The Invariant Field (tools/invariant-field/) works but looks basic. The
user wants it to SHINE: "make this look and interact inspiringly and
game-like". Your deliverable is the DESIGN LANGUAGE the build tasks
(#417 3D field + timeline playout, #418 code-lens explorer, #419 Opus
synthesis) will implement in the v2 clone at tools/invariant-field-v2/
(#415 creates it; v1 stays untouched) — researched from the best of the web, not
invented from nothing. You produce SPEC + TOKENS + one working visual
proof, not the full implementation.

## Research phase (use your network access; cite everything)

Search the web for craft in exactly these veins and study the actual
techniques (write down concrete, implementable findings — colors,
easing curves, layering, interaction grammar — not vibes):

1. Sci-fi star-map and orbital UIs (EVE Online map, Elite Dangerous
   galaxy map, Into The Breach clarity principles, FUI/HUD design
   collections such as Territory Studio work).
2. Data-viz masters: observablehq notebooks, D3 force/radial layouts,
   three.js showcase entries, Bruno Simon-style playfulness where it
   serves comprehension.
3. Motion/interaction grammars: Material motion durations/easings,
   Apple HIG dynamics, game-feel ("juice") principles — feedback under
   150ms, eased camera, focus-follows-selection.
4. Modern dark-UI design systems for the chrome (Linear, Vercel,
   shadcn/radix patterns) — restraint, depth via elevation and glow,
   typography scale.

## Spec phase (the deliverable, in tools/invariant-field-v2-design/)

1. The design language document (file: design-language-spec, .md) —
   the reimagined Field: visual identity matching
   Invar (terminal-native, precise, dark, restrained glow), the
   game-like interaction grammar (hover, select, focus flight, timeline
   playout dramaturgy — how dots being born/moving inward/rotting
   outward FEEL), 2D and 3D presentation concepts, accessibility floor
   (reduced-motion mode, contrast).
2. tokens.ts + tokens.css — concrete: full palette (background layers,
   domain hues, kind encodings, rot/alarm, glow), type scale, spacing,
   z/elevation, easing curves and durations, named per component.
3. The interaction spec document (file: interaction-spec, .md) — per
   surface (field, dot, card, list, timeline,
   lens): states, transitions, timings, sounds-off default.
4. PROOF: one static HTML mockup (no build step) of the reimagined
   field view rendered with the tokens — enough visual truth that the
   user can veto or bless the direction cheaply.
5. Every claim cites its source URL; a sources document lists them.

## End state

design/ contains the four artifacts + sources; the mockup renders in a
browser from a file path; a READY report in this folder summarizes the
direction in ten lines with the mockup path. No changes outside
tools/invariant-field-v2-design/ (a sibling directory — do not touch
v1, and do not race #415's clone). Commit before READY. No merge gate
needed beyond hygiene (docs plus one mockup): run conventions/prettier
on your files and say so.

## Invariants in scope: none — documentation and a static mockup only;
the builder may refute this.

## Bycatch expected

Report per the AGENTS taxonomy; None observed is a valid body.
