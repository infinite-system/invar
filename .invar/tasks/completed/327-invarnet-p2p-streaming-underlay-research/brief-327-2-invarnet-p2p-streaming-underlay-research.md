# Brief #327-1 — Invarnet p2p underlay research map

Read the [task record](task-327-invarnet-p2p-streaming-underlay-research.md)
in FULL before anything else. The user's verbatim words in it GOVERN
scope; the six arms and the acceptance section are the specification.
This brief adds only mechanics.

Load [the IBR skill](../../../../.claude/skills/ibr/IBR.md) before starting: the map's primary
success criterion is an IBR test — does the four-invariant reduction in
the record GENERATE the surveyed design space, and does its
impossibility set hold? Breaking the candidate set is a valid and
valuable outcome; say so explicitly if you do.

## Mechanics

- RESEARCH ONLY. Zero product code, zero dependencies added, nothing
  outside this task folder.
- Deliverable: replace the stub
  [project-invarnet-p2p-underlay-map.md](project-invarnet-p2p-underlay-map.md)
  in this task folder with the full map, covering all six arms of the record.
- Every ecosystem claim carries a citation (paper, RFC, spec, or
  deployment report; name and locator). A claim you cannot cite is
  labeled as your own inference.
- For each prior-art system in arm 1: name WHICH of the four candidate
  invariants it violates or proves, and tie that to why it collapsed or
  scaled.
- Be honest about negative results: NAT traversal percentages,
  incentive failure modes, and the legal-gray relay reality are part of
  the map, not hand-waves.
- Commit the map on your branch (record-only; SKIP_GATE=1 is correct
  for a markdown-only commit and say so in the report). Leave the tree
  clean.

## Invariants in scope

None of the repo's code contracts bind (no code changes). Two records
still govern the WRITING:
- The candidate invariant set inside the task record itself: the map
  must test it, arm by arm, and verdict it (generates / fails to
  generate / needs a fifth).
- Plain prose per [AGENTS.md](../../../../AGENTS.md) (STE flavored):
  short sentences, active voice, exact numbers. Cite paths root-relative.
Answer this section in the READY report; name any record you believe
this list missed.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy. For a
research task the likely finds are contract-layer gaps and comment
drift in the docs you read. Carry a `## Bycatch` section even if it
reads "None observed".

## End state (mechanically checkable)

A report file named `report-327-<slug>.md` (this task's slug) exists in
this folder, READY on line 1, naming the map file and the commit hash
of a clean worktree. The report summarises the recommendation, the
reduction verdict, and the ranked user-facing questions. Do not push,
merge, or tag. The conductor lands.
