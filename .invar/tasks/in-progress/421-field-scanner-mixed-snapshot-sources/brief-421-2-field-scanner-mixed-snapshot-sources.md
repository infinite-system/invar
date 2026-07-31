# Brief 421-1 — one source per snapshot in the field scanner

Read the task file in this folder. The Invariant Field v2 scanner
builds each history snapshot from TWO sources: contract text from the
working tree, annotations/evidence resolved at HEAD (RepositoryHistory
buildSnapshot). A snapshot must be one commit's world — mixed sources
make the playout lie near the present.

Work:
1. Reproduce by DRIVING: run the v2 server
   (bun tools/invariant-field-v2/server.ts, port 4314), craft a
   working-tree contract edit that HEAD lacks, and show the snapshot
   mixing (screenshot or DOM evidence via the committed BrowserDrive
   helper). If it will not reproduce, say so plainly.
2. Fix buildSnapshot so every component of one snapshot resolves at
   the SAME commit (HEAD snapshots read HEAD contract text; a
   present/working-tree snapshot, if kept, reads working-tree
   everything and is labeled as such).
3. Scope: tools/invariant-field-v2/ ONLY. v1 (tools/invariant-field/)
   stays byte-untouched. Scanner stays read-only toward contracts.
4. Contract: extend the instrument's own
   [invariant-field.invariants.md](../../../../tools/invariant-field-v2/invariant-field.invariants.md)
   with the one-source-per-snapshot record if absent, per its local
   format; run the instrument's release gate documented in its README.
5. Drive again post-fix: the same edit now appears ONLY in the
   present snapshot. No merge-gate.sh; no push; commit; READY report
   here.

End state: report exists; drive evidence before/after; release gate
green; checker --all/--refs clean.

## Invariants in scope
The instrument's own contract (tools/invariant-field-v2/) — answer
record by record; refute any my list missed.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
