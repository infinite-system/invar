# 565 — conductor action verbs

Priority: user-directed
State: COMPLETED — ad84a7ef — The conductor's actions are now traced: guarded commit/test/gate, tip-stamped landings, and a night digest answering what was fought with.
Engine: claude
Environment: linux
Model: fable-5
Effort: high
Assignment note: conductor self-do after #564 lands — user order
2026-08-14 ("yes file it as #565"). The deeper purpose is TRACE: every
conductor action becomes a typed ledger event.

## In plain words

The conductor's raw actions (committing, gating, landing, running
tests) become harness verbs that carry the safety rules and leave a
typed trace. The rules stop living in memory, where they degrade with
context depth, and the conductor's own actions become as auditable as
the builders' work.

## Scope (harvested from this session's actual misses)

1. `commit` verb: explicit-paths-only in the main checkout (add -A
   refused there, allowed in fleet worktrees); gate-skip is an explicit
   argument, not a remembered env var; post-commit verifies the claimed
   files landed; REFUSES into a tree whose registered gate is mid-run
   (the r2 mid-gate-edit class).
2. `gate` verb: registers the log AND stamps the tree tip it launched
   on into the log header.
3. `land` guard (in land.sh — binds even without the verb): refuse when
   the gate log's stamped tip differs from the branch tip being landed
   ("the thing you verified must be the thing you land", mechanized).
4. `test` verb: runs a suite and ledgers exit + pass/fail COUNTS parsed
   from output — a claim of green becomes contradictable data (the
   tail-cropped 1-fail incident).
Each guard ships with a planted-defect test (fires AND stays silent).
5. THE NIGHT DIGEST (the capstone — user insight 2026-08-14: "what was
   the conductor actually fighting with"): a derived view over the
   event ledger + registered gate logs + landings. The FIGHT LOG
   (consecutive non-zero-exit events on one subject: gate-564 red x3
   over 40min, causes, resolution), TIME ACCOUNTING (durations by verb
   and task), and CLAIM-VS-EVIDENCE contradictions. The morning report
   becomes a query the user runs, not an essay the survivor writes;
   conductor prose becomes commentary on top, never the source of
   truth. `get digest` or `run report.night`.

## Invariants in scope

- iv-harness.invariants.md: wrapped-script one-place rule (guards that
  move into land.sh live ONLY there; the verb calls it); events ledger.

## Bycatch expected

Report per AGENTS.md taxonomy, even when None observed.
