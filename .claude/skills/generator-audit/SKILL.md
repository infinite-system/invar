---
name: generator-audit
description: Reproducible independent-review procedure that finds structural bugs by auditing where generators live and whether consumers sit on them. Distilled from the 2026-07-24 codex review that predicted the provider-identity bug before the user hit it.
---

# Generator Audit — independent review as reduction, not inspection

## What this is and why it works

A periodic audit where independent reviewer agents run the repo's own distillation procedure
against the codebase: for each subsystem, name the shared generator, then check whether every
consumer sits on it. This is review-as-reduction. A line-reader finds point bugs; a generator
audit finds *misplacements*, and each misplacement predicts a bug class rather than a bug.

Evidence from the first run (2026-07-24, three codex reviewers vs main@56fe6df,
`reviews/2026-07-24-independent-codex-review/`):
- Finding #3 predicted the provider-identity bug from structure alone, days before the user
  reported it; the landed fix IS the reviewer's proposed extraction (`AgentProviderRegistry`).
- Finding #2 flagged the hermetic-spawn hole — a recurrence site of the `GIT_AUTHOR_*` hook-leak
  bug class — without knowing that history.
- Finding #6's tell was the recorded invariant verbatim: twenty-plus handlers suppressing
  mutation on a read-only surface = a consumer suppressing a seam core.

The procedure works because the reduction doctrine is written down (AGENTS.md #2,
`project.conventions.md`): a cold agent reads the law and executes it. Keep it that way — the
reviewer prompt below cites the recorded invariant, it does not restate a private version of it.

## When to run

- After a feature wave lands and docs are reality-synced (structure has churned; seams may have
  drifted). NOT mid-wave — the audit reads a moving target and its extractions collide with
  in-flight branches.
- Before committing to a large refactor pass (the audit produces the refactor backlog, ranked by
  evidence instead of taste).
- Reviewers are read-only and CPU-light relative to gates, but do not run the audit while gates
  are running (shared CPU; see gates-need-quiet-machine doctrine).

## Phase 1 — launch independent reviewers

Mechanics (each gotcha here cost a real failure):
- Reviewers get NO builder context: no session summaries, no handoff docs, no conversation. The
  repo + its recorded law is the entire input. Independence is what makes convergence with
  builder knowledge count as evidence.
- Launch as codex CLI, detached, with stdin closed — `< /dev/null` — or the process stalls on
  "reading additional input from stdin".
- One reviewer per lens, run concurrently (they are read-only; they do not collide):

  1. **Correctness lens** — bugs, races, unhandled edges, resource leaks; must cite file:line
     and a concrete failure scenario per finding.
  2. **Generator lens** (the heart of the audit) — canonical prompt v1:

     > Read AGENTS.md and project.conventions.md first; apply the repo's recorded modularity
     > invariant (seam at the shared generator) as your procedure, not your opinion. For each
     > module: (a) name the shared generator the module's behavior implies; (b) find consumers
     > that DUPLICATE it, BYPASS it, or SUPPRESS its core (the three failure signatures — e.g.
     > a consumer carrying dead mutation paths on a read-only surface, or calling a lower layer
     > directly and losing the seam's policy); (c) for each violation, state the finding with
     > file:line citations, a severity tag, and an `Extraction:` line proposing the minimal
     > seam that dissolves the violation class. Also flag FALSE shared generators — seams that
     > unify consumers whose generators actually differ. Do not edit files. Do not run the
     > merge gate. End with: mechanical checks you ran (tsc, unit tests, invariant checker),
     > and modules deeply read vs scanned vs skipped — coverage honesty is part of the report.

  3. **Performance + docs lens** — measure against recorded budgets and baselines (repair the
     harness if broken rather than skipping); diff every doc claim against code reality. An
     honest WARN that names its cause is a feature.

## Phase 2 — archive verbatim + disposition ledger

- Write each report verbatim into `reviews/YYYY-MM-DD-<name>/` — reviewer output is
  findings-at-a-point-in-time, never doctrine.
- Write a `README.md` disposition ledger: every finding gets exactly one disposition —
  **fixed** (branch named), **deferred backlog** (recorded, awaiting a dedicated pass), or
  **known limitation / follow-up investigation** (with the honest reason).
- Gotcha: "doc-only" archives are NOT gate-exempt — the invariant checker greps docs, and a
  reviewer's line-citation into a `*.invariants.md` file parses as a dangling reference.
  Neutralize checker-significant citations when archiving (see the note inside the 2026-07-24
  report where this was handled).

## Phase 3 — conductor triage (the audit finds candidates; this makes them true)

- **Reproduce before fixing.** Structure-reading produces plausible-but-unproven claims. Drive
  the real user path (FrameProbe / smokes) for every finding you intend to act on. A finding
  that won't reproduce gets recorded as such, not fixed speculatively.
- **Re-grade severity yourself.** Reviewer labels inflate: their "FATAL" is usually a scoping
  finding (real, worth fixing, no user-visible failure). Apply the repo's severity language —
  fatal / scoping / flag — and let the re-graded severity, not the reviewer's, set priority.
- Fix reproduced point-bugs same-cycle on fix-tracks; extractions go to the backlog for
  explicit adoption. The user decides which deferred extractions are pursued and when
  (provenance rule: reviewer proposals are conductor-side inventions until adopted).

## Phase 4 — executing adopted extractions

- One brief per extraction, dispatched to a builder (fleet-mix policy applies), containing:
  the finding verbatim, a **zero-behavior-change contract** (existing tests + smokes define
  behavior), full-name conventions, no-gate/no-push/no-delete rules, and a **sweep proof**
  where applicable (e.g. `grep -rn "Bun.spawn" src/` must return only the seam + documented
  exemptions — proof the migration is total, not partial).
- Judge-on-delivery: a disproportionate diff is declined without ceremony — the branch stays
  (never deleted), only merge is withheld. Gate serially on a quiet machine.

## Substrate uniformity — why the audit works here, and its blind spot

The procedure's precision is proportional to the substrate's uniformity. Four mechanisms:

1. **A uniform grammar turns semantic violations into visible anomalies.** Duplicate / bypass /
   suppress are deviations from an expected shape, and deviation is only detectable against a
   background of sameness. A direct `Bun.spawn` inside a backend was findable by one grep because
   the grammar says syscalls live behind a `Static()` seam — off-pattern syntactically before any
   semantic analysis. Low structural entropy makes defects high-contrast.
2. **`Static()` manifests pre-compute half the audit.** The lens prompt says "name the generator
   each module implies" — but modules here DECLARE their generators; the manifest is the claimed
   seam inventory. The reviewer's job collapses to diffing the claim against the usage. An
   inferred seam can be argued with; a declared one can only be violated.
3. **One navigable object graph makes authority questions answerable.** "Who else writes this?"
   is traceable when all state is refs one hop apart — duplicate-authority bugs (the
   provider-identity class) hide behind event buses and DI indirection elsewhere.
4. **A boring substrate frees the reviewer's whole budget for domain structure.** No framework
   physics to simulate; the runtime model fits in a sentence. The same compression that lets a
   one-page-primed builder ship correct code lets a context-free reviewer audit in one pass.

**The blind spot:** uniformity reveals deviation FROM the pattern, not wrongness OF the pattern.
A mistake embedded in the convention itself is invisible-by-normality — everything matches, so
nothing stands out (the functional `main.ts` remnant survived every convention check because it
looked like what entry points conventionally look like). False UNIFICATION (finding #7's one
action table serving three surfaces) is likewise invisible to shape-matching — its shape was
perfectly uniform; only the semantic step (consumers suppressing the seam's core) exposes it.
So: expect bypass and duplication to surface nearly mechanically; budget real reviewer reasoning
for false shared generators and convention-embedded mistakes — and treat "it matches the
convention" as zero evidence of correctness during triage.

Division of labor: the architecture is the evidence base, the recorded doctrine is the query,
the reviewer is the executor. Each alone underperforms; together a context-free agent finds
structural bugs in one pass. Corollary: every convention the gate enforces is also quietly
buying cheaper audits forever.

## Quality bar

The audit succeeded when its findings are *generative*: each accepted extraction deletes a bug
class (a suppression thicket, a policy-bypass site, a second authority) rather than patching an
instance. If a run produces only point fixes, the generator lens regressed into a line-reader —
check that its prompt still forces the name-the-generator step. Convergence signal: when a
reviewer's proposed extraction is later demanded by an independently-reported user bug, record
it — that is the audit paying rent, and the count of such predictions is the metric that
justifies the next run.
