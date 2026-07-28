# 209 — mine the session transcript for the task detail the ledger is missing

State: DONE — 4e23b88, 3e31e4a
Created: 2026-07-28
Engine: claude
Environment: linux
Model: opus-5
Effort: high
Priority: USER-DIRECTED, next task

## Outline

53 of 61 task files hold one line of content. The detail exists — it was reasoned out in conversation
across this session and several compactions — but it never reached disk. The user's instruction:

> "go surgically into claude session history and extract all proper tasks and put them into each task"

### The source

```
/home/parallels/.claude/projects/-home-parallels-dev-ibr/faf7e858-c256-4735-9bbd-ba8dca8023dd.jsonl
```

**307 MB, one JSON object per line.** This is the authoritative record of the whole session INCLUDING
the parts summarised away by compaction. Sibling sessions in that directory are small (20 KB, 15 KB) and
are not this work. Total directory: 402 MB.

**Do not read it into context.** At 307 MB a naive read is impossible and a naive `grep` returns
megabytes. Stream it, filter first, extract second.

### Why this is needed — the failure it repairs

The complete task record lived in the conductor's session task list, which dies with the session.
`migrate-task-ledger.ts` transferred only each task's one-line `subject`, so 61 folders landed at 12-13
lines apiece. The detail was not lost to compaction — it was dropped in transfer, in a script whose
output was never inspected. A dry run printed "61 outlines created" and that was taken as success
without asking what was IN them.

Same shape as two other misses the same evening: "35 dispatch files migrated" (out of how many? 235 sat
unmigrated) and a positive control that supplied its own subject. **The through-line: verifying that a
script RAN is not verifying that its output is any good.** Do not repeat it here — this task's own
success criterion is content, not completion.

It is also the coverage ratchet's VAGUE RECORD hole (#77) applied to the ledger itself: an entry that
satisfies a structural check while carrying none of the information the check exists to preserve.

### What to extract, per task

For each of the 53 thin task files, find in the transcript:

- the **mechanism** — the traced cause, with file and line where it was named
  (e.g. `Drive.ts:421-422`, `GitWorkspace.ts:501`, `QuickOpen.ts:258-286`)
- the **measured evidence** — real numbers with their units and conditions
  (e.g. `634 ms -> 2,417 ms first paint at 1M`, `2,000,000 document reads`, `0/6 both arms`)
- **what was REFUTED** — hypotheses killed by measurement. These are the highest-value lines and the
  ones a fresh reader will otherwise re-derive. Examples already known: the stale-snapshot-coordinate
  candidate for terminal-stage (coordinates were identical `47,33` in every run); pool concurrency as
  the shared flake cause (single-worker counterexample); `rg` missing as the reserved-chord cause for a
  codex-launched agent (codex bundles its own).
- the **ranked repair options** with their trade-offs, where a ranking was actually reasoned
- **what remains unproven** — stated as hypothesis, not fact

### Method

1. **Filter before extracting.** Stream with `jq -c` or a Bun script reading line-by-line. Select
   assistant text mentioning a task number (`#\d{2,3}`) or a known task slug. Never load the file.
2. **Anchor on the task number**, not on prose similarity. Fuzzy slug matching was tried during the
   archive migration and demonstrably mis-assigned — it proposed `panel-chrome-flake` for #164 and
   `quiet-lock-validity` for #183, while those documents declare #159 and #147 themselves. **A wrong
   mapping files real evidence under the wrong task, which is worse than leaving the file thin.**
3. **Write into `## Outline`** of `.invar/tasks/<state>/<n>-<name>/task-<n>-<name>.md`, preserving the
   heading, `State:`, `Created:` and the `## Sources` section.
4. **Report a denominator.** How many of 53 got detail, how many did not, and name the ones that did
   not. A count without a denominator is what caused this task to exist.

### Constraints

- A task file holds THE TASK. No convention boilerplate, no provenance hedging — that is
  `project.tasks-ledger.md` and `meta.json` respectively.
- Where the transcript genuinely holds nothing more, leave the one line and let `## Sources` say
  `None. Only the subject line above survives.` **Do not invent specificity.** An honest stub is worth
  more than a plausible fabrication, because the next reader plans against what they find.
- Do not run `scripts/merge-gate.sh`, push, merge, tag, or delete branches.
- Do not edit the working tree while a gate is running — it reads this tree. That mistake was made
  twice in one evening.

## Sources

- The transcript named above (307 MB, this session, spans multiple compactions).
- `project.ledger.md` — the index that existed at the time (since consolidated into `project.tasks-ledger.md`; content in git history).
- `agent-dispatches/_archive-2026-07-27/` — 139 briefs and reports whose headers carry NO task number
  and which are therefore still unplaced. The transcript may identify some of them; if it does, place
  them by the same number-declared-in-document rule, never by slug similarity.
