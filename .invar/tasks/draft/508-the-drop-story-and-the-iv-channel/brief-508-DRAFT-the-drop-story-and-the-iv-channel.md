# Brief 508 (DRAFT for user review — NOT dispatched) — the drop story and the iv channel

## In plain words

Files must reach Invar the way humans expect: drag a file onto the
terminal (local OR over ssh) and it opens; click an Open button and
pick a file. The carrier is a new thin client, `iv ssh`, whose
channel is designed from day one to also carry capability calls —
the door to running Invar locally against a remote machine later.
Four milestones, each independently landable and driven.

## Milestone 1 — local drop (small, immediate)

Every terminal converts a file drop into a (bracketed) paste of the
file path. OpenTUI parses \e[200~ but never ENABLES mode 2004 — the
known gap. Work:
- Enable bracketed paste at boot; route paste events through one seam.
- Drop detection: bracketed paste whose content is one or more
  existing-path tokens (shell-quoted variants handled; multi-file
  drops parsed).
- Routing by kind: image/video -> media plugin pane; text file ->
  open buffer; directory -> offer open-as-workspace (popup);
  non-workspace path -> the confined-root decision (below).
- Ratchet: PTY smoke pastes a path with 2004 framing and asserts the
  media pane / buffer opens; negative arm: the same text typed
  UNBRACKETED does not trigger drop handling.

## Milestone 2 — `iv ssh`: the channel client (THE MUST)

A local wrapper owning the PTY passthrough to ssh, with a private
side channel multiplexed over the same connection (ssh subsystem or
a second exec channel — builder proposes, protocol doc required):

- PROTOCOL FIRST, and RPC-shaped from day one: framed messages,
  request/response + streams, capability namespacing (drop.upload,
  dialog.request, fs.*, pty.* reserved). One protocol doc in
  scripts/ or docs/, versioned, with the VS-Code-server-inversion
  explicitly named as a design constraint it must not preclude.
- Drop-upload: wrapper detects an existing-LOCAL-path bracketed
  paste, intercepts (never forwards the raw local path), uploads via
  the channel to ~/.cache/invar/dropzone/<hash>-<name> on the
  remote, then notifies server Invar (graph channel or private OSC)
  which routes it exactly like Milestone 1.
- Passthrough fidelity: when not intercepting, byte-perfect and
  latency-neutral; the keyboard smoke's byte sweep must hold THROUGH
  the wrapper (run it under iv ssh localhost).
- Server side: Invar gains the dropzone listener; cleanup policy for
  the dropzone (age out; size cap).

## Milestone 3 — the Open button and picker tiers

- Tier 1 (everywhere): an in-app filesystem browser popup (reuse
  BoundedListPopup + enumeration machinery), opening from an Open…
  affordance (status bar or Files dock header) and the palette.
- Tier 2 (local runs): native dialog via a capability class
  (zenity/kdialog/osascript), falling back to tier 1.
- Tier 3 (over iv ssh): the button sends dialog.request down the
  channel; the wrapper opens the CLIENT's native picker; the
  selection uploads through the dropzone; server Invar opens it.

## Milestone 4 — the inversion door (DESIGN ONLY in this wave)

A short design doc, not code: how the 12 capability classes become
remote proxies over the M2 protocol (local Invar, remote fs/git/pty/
LSP), with the sync-call census attached (count synchronous Files/
Processes call sites — the real migration bill). No implementation;
the deliverable is the honest number and the protocol reservations.

## The confined-root decision (USER TO CONFIRM at review)

"File access is confined to a single root" is an established record.
Proposed refinement: dropped/picked files OUTSIDE the workspace root
are IMPORTED (copied into the dropzone / workspace) or opened
read-only with a visible badge; free browsing stays read-only; the
explicit crossings are open-as-workspace and import. Builder proposes
the record refinement text; conductor + user confirm before any write.

## Assignment proposal

M1: codex sol high (terminal/paste seam). M2: codex sol high, its own
task (protocol + wrapper + smoke through iv ssh localhost). M3: after
M2, codex. M4: fable medium (doc + census). Separate tasks 508-511,
this draft splits at dispatch.

## Invariants in scope (all milestones)

- Terminal bytes cross exactly one backend seam; the keyboard byte
  sweep records (terminal/keybindings contracts).
- File access is confined to a single root (system) — refinement per
  above, propose-only.
- Graph observation reads and never mutates (system) — the dropzone
  notification is an event, not a graph write.
- Harness: waits are conditions; the M2 wrapper smoke runs the byte
  sweep THROUGH the channel.

## Bycatch / Instrument feedback

Standard sections per AGENTS.md in every milestone's task brief.
