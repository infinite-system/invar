# 333 — dispatch renames the conductor's brief to round N but the heading keeps round 1

State: active
Priority: architecture-hygiene
Engine: codex
Model: 5.6-sol
Effort: low
Provenance: BYCATCH of #327 (Invarnet p2p research), 2026-07-30

## Mismatch

The conductor authors `brief-<n>-1-<slug>.md` in the task folder.
`dispatch.sh` files it into `in-progress/` as `brief-<n>-2-<slug>.md`
(its round counter counts the authored file already present), while the
Markdown heading still says "Brief #<n>-1". #327's builder reproduced
the mismatch with a second read (also visible in #322's dispatch).
A filename that disagrees with its own heading is a record that lies
about its identity.

## Work

Pick one generator: either dispatch does not bump the round when the
brief it is filing IS the file already counted (same inode/content), or
dispatch rewrites the heading's round number when it renames. Add the
check to dispatch's DRY_RUN output and a self-test arm proving both
polarities (a genuine round-2 filing still bumps; a first filing does
not drift).
