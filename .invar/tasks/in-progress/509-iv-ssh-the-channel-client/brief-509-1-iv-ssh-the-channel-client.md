# Brief 509-1 — M2: iv ssh, the channel client

## In plain words

Build the thin local client: iv ssh <host> wraps ssh with byte-perfect
PTY passthrough plus a multiplexed side channel. The protocol comes
FIRST and is RPC-shaped from day one — the same channel must one day
carry fs/pty capability calls (local Invar, remote machine), so
nothing in its framing may preclude that. First cargo: drag-drop
upload. [The blessed wave draft](../../in-progress/508-local-drop-opens-the-dropped-file/the-wave-draft-blessed.md) M2 + M4 sections are the spec.

## Order of work

1. PROTOCOL DOC first (docs/ or scripts/, versioned): framed
   messages, request/response + streams, capability namespaces
   reserved (drop.*, dialog.*, fs.*, pty.*), error model, version
   negotiation. One page, exact. The inversion (M4) is a named
   design constraint.
2. Transport: pick ssh subsystem vs second exec channel vs port
   forward — one paragraph judging them, then build the choice.
   The wrapper is a Bun compiled binary (the dist/iv pipeline).
3. Passthrough fidelity BEFORE features: iv ssh localhost must pass
   the keyboard byte sweep (bash scripts/smoke-keyboard-invariant.sh
   driven THROUGH the wrapper) — raw mode, SIGWINCH, exit codes.
4. Drop-upload: detect existing-LOCAL-path bracketed paste,
   intercept (the raw local path never reaches the remote app),
   stream to ~/.cache/invar/dropzone/<hash>-<name> remote-side,
   notify server Invar (private OSC or graph event) which routes it
   through 508's seam. Dropzone hygiene: age-out + size cap.
5. Ratchet: a smoke that runs iv ssh against localhost sshd (or a
   spawned sshd fixture), drops a fixture file, and asserts the
   remote app opened it; byte-sweep arm included.

## Invariants in scope

- Terminal bytes cross exactly one backend seam
  ([src/modules/terminal/terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md)) — the wrapper adds a
  channel BESIDE the PTY, never a second byte route into the app.
- Copy reaches the host terminal ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md)) —
  OSC 52 must traverse the wrapper untouched (byte sweep covers).
- External tools share one launch policy ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md)).
Answer record by record; propose new records for the channel's own
guarantees (framing, fidelity) — propose-only.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the gate via
the planted policy; the conductor gates and lands.
