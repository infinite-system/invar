# Brief 510-1 — M3: the Open button and picker tiers

## In plain words

An Open affordance with three tiers: the in-app filesystem browser
(works everywhere, browses where Invar runs), the native local
dialog, and — over iv ssh — the CLIENT's native picker feeding the
dropzone. [The wave draft](../../completed/508-local-drop-opens-the-dropped-file/the-wave-draft-blessed.md) M3 section is
the spec; 509's protocol doc ([docs/iv-channel-protocol.md](../../../../docs/iv-channel-protocol.md)) already
reserves dialog.*.

## The work

1. Tier 1: an Open... affordance (palette command + a visible
   control where the design fits — propose placement with a driven
   screenshot; the user rules on looks at review) opening a
   filesystem browser popup (BoundedListPopup + enumeration
   machinery; keyboard + pointer). Browsing is read-only; opening a
   file routes through 508's kind seam; outside-root = read-only
   badge rule.
2. Tier 2: a native-dialog capability class (zenity/kdialog/
   osascript probing via Bun.which through Processes) used when
   local and available; falls back to tier 1.
3. Tier 3: dialog.request over the 509 channel; iv ssh opens the
   client-native picker and feeds the selection through the dropzone
   (extend the localhost-sshd smoke with one picker arm — the client
   side can fake the dialog binary for determinism).
4. Ratchet: smoke arms per tier (tier 2 with a stub dialog binary).

## Invariants in scope

- File access is confined to a single root ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md)) — same working rule as 508; refinement stays proposed.
- External tools share one launch policy ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md)) — the dialog capability goes through Processes.
- Input overlays share one modal slot ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)).
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the gate via
the planted policy; the conductor gates and lands.
