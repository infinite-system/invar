# Brief 511-1 — M4: the inversion design doc + the sync-call census

## In plain words

DESIGN ONLY, no implementation. Write the document that lets the
user decide the inversion (local Invar over remote capabilities)
on measurements: how the 12 Bun-coupled capability classes become
remote proxies over the 509 channel protocol, and the synchronous-
call census that is the real migration bill. [The wave draft](../../completed/508-local-drop-opens-the-dropped-file/the-wave-draft-blessed.md)
M4 section + [the feasibility note](../../../../project.gui-feasibility.md) + 
[docs/iv-channel-protocol.md](../../../../docs/iv-channel-protocol.md) are your inputs.

## Deliverables (one doc named project-inversion-design at repo root + census script in the task folder)

1. Topology: local model+UI, remote daemon (iv --channel-server
   grown into the capability server); which capability goes remote
   (fs, git, pty, lsp, tasks) vs stays local (theme, settings?) —
   judge each of the 12 with one line.
2. THE SYNC CENSUS (the heart): an AST census counting synchronous
   capability call SITES that would need async conversion (Files.*,
   Processes.* sync surfaces and their transitive callers' shape) —
   stamped with the commit, both-arms controls, script committed to
   the task folder like 488's.
3. Latency plan: what caches, what invalidates them (remote watcher
   event streams), what stays chatty and why that is acceptable.
4. The honest recommendation paragraph: build/defer/park, with the
   number that would change the answer.

## Invariants in scope: none edited (design doc); cite records the
design must respect (one-backend-seam, launch policy, confined root).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the gate via
the planted policy; the conductor gates and lands.
