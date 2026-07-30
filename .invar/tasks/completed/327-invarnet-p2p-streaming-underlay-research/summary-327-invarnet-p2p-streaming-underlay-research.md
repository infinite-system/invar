# Summary — #327 Invarnet p2p underlay research

Landed: e332ebd9 (merge of 03f5b0ab), 20 minutes dispatch-to-landing.
Builder: codex / gpt-5.6-sol / high. Record-only landing (map + records,
zero product code; verified nothing outside .invar/tasks/).

## What happened

The map (795 lines, 46 cited sources) tested the conductor's
four-invariant reduction and BROKE it — the honest outcome the record
invited. Fifth invariant required: every accepted fragment proves
membership in the authenticated stream (without it, the set cannot
reject attacker-generated ciphertext, so pollution defeats the swarm).
One claimed impossibility refuted: "no fragment incriminates its relay"
does not hold as stated. Three invariants survive in refined form
(measured-slack envelope, eligible-consumption contributes, no fixed
machine after replication). Physical conservation stays decisive:
coding changes WHICH fragments peers need, it does not create
bandwidth. Recommendation: no global credit ledger, no absolute
server-independence claim; first rung is a three-process local
instrument with measured byte flows. Eight ranked questions await the
user's answers before any implementation task exists.

## Friction / conductor notes

- Landing blocked once: the user's own staged dispatch.sh edit (codex
  effort floor) was in the index; committed as user-directed
  (dc24997d), then the merge went clean.
- The lazy session-link resolver (f1817b7e) passed its production
  positive control here: archive resolved and copied without hand
  repair, first time in four landings.

## Left undone (converted, not dropped)

- Conventions tag-name drift fixed at landing (orphaned/ -> retired/,
  986d8f65) — builder's bycatch.
- #333 filed: dispatch brief round-number heading mismatch.
- The 8 user questions are the open thread; the map holds them ranked.
