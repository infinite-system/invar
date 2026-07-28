# 153 — the horizontal fling profile split

State: TODO — WAITING ON THE USER (a feel call)
Created: 2026-07-28
Engine: user
Environment: any
Model: —
Effort: default
Assignment note: Keep the hover card at 80 and document why, or unify overlays to 220.

## Outline

### The framing was corrected twice, and the corrected version is the task

**First version (wrong):** `#50`'s one-profile fix never reached `ScrollableTextViewport`, so horizontal
fling is 2.75× slower in overlays than in the editor.

**A builder reported (also too strong):** `Momentum.defaultOptions` (max 80) is unreachable dead code.

**What is actually true**, from the call-site audit: `Momentum.defaultOptions` **is** reached, at
`ScrollableTextViewport.ts:189-193` — it is the live **hover-card** horizontal profile, because
`HoverCard` is the one consumer that deliberately leaves horizontal scrolling ON. The editor and the
diff view bypass it entirely and feed the settings-derived **220** profile to both axes.

**So the split is not vertical-vs-horizontal. It is editor/diff vs hover card** — 2.75× between two
surfaces reached by the same gesture.

### The decision the user owns

Two options, with a recommendation on record:

1. **Keep 80 for the hover card and document why** (recommended). A hover card is a small transient
   surface; a 220 ceiling inside it may overshoot its own content.
2. **Unify overlays to 220.** One number, one feel, no explanation needed.

This is a feel call, not a defect, which is why it sits open rather than dispatched.

### Provenance worth keeping

Both wrong diagnoses came from reasoning about the code rather than driving it, and both were overturned
by a builder who drove. The same pass corrected #152's premise (vertical cut while horizontal eased —
actually both axes run the same 220 ceiling; the real split there is ceiling-reaching vs not). Two
structural reads, two refutations, one measurement session.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
