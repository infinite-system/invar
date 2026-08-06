# Task 509 — M2: iv ssh, the channel client (THE MUST)

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: IN-PROGRESS

## In plain words

A local wrapper owning PTY passthrough to ssh with a multiplexed
side channel: protocol FIRST and RPC-shaped from day one (framed,
request/response + streams, capability namespaces reserved: fs.*,
pty.*, dialog.*, drop.*) — the door to local-Invar-over-remote-
capabilities must not be precluded. Drop-upload: intercept
existing-LOCAL-path bracketed pastes, upload to the remote dropzone
(~/.cache/invar/dropzone/), notify server Invar. Byte fidelity: the
keyboard sweep runs THROUGH iv ssh localhost and holds. The blessed
wave draft's M2 + M4-reservations sections govern (copy in the
sibling 508 folder).
