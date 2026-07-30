# Summary #390 — both docks bounded

Landed 181936b7 (branch dab2e38e), 35m. One shared generator bounds both
docks (30% content cap + editor-precedence cap incl. chrome); requests
never rewritten; painted-width consumers read the resolved viewport.
Record refined right-only -> both-docks. Positive control proven. Known
flakes only (#193 995-row, git-watch/scrollbars retries).
