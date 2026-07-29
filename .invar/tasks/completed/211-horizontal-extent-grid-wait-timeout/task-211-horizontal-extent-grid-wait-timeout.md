# 211 — smoke-horizontal-extent's grid-condition wait timed out, attempt AND retry

State: COMPLETED — b076fef — unreachable wait: faeaa99 wrapped encodeBandsJpeg across rows, so the contiguous-string predicate could never match (#173 class, harness side); smoke now waits on the comment tail with a pre-action hidden assertion; positive control red demonstrated
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

`smoke-horizontal-extent-harness`'s grid-condition wait timed out on BOTH the initial attempt and
its retry during #59's automatic pre-commit gate — a hard red, not a retry-rescued flake, which
makes it a different class from the retry population (#177).

Reported as bycatch by #59's builder, PRE-EXISTING: the reformat commit is formatting-only (proven
semantically inert by unchanged tsc error set and green tests before/after), so the branch did not
cause this.

- Evidence: `/tmp/merge-gate-failures.1587581/`
- Same gate also saw `smoke-agent-cancel-harness` time out once and pass on retry — that one joins
  the known retry population, not this task.

First question, per the wait doctrine: is the grid condition REACHABLE — is the thing false right
now, and can the action make it true? A both-attempts timeout on a formatting-only tree smells like
the unreachable-wait class (family 1), not load.

## Sources

- [report-59-prettier-format-gate-and-reformat.md](../59-prettier-format-gate-and-reformat/report-59-prettier-format-gate-and-reformat.md) (## Bycatch) — the finding's origin, verbatim.
