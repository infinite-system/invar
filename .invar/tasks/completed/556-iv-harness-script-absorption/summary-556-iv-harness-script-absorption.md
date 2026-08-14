# Summary — 556 (what actually happened vs the report)

The report claimed "parseFlags -> switch" — FALSE. The scripted edit
had no assert and silently no-opped when prettier's reformat broke its
match; only the stale-warning half of that edit landed. Discovered
during #561 when the "merge-lost" switch turned out never to have
existed. The switch actually landed in #561. Lesson (conductor md):
every scripted edit asserts its match or it is a lie that says done.
Everything else in the report was delivered as stated; the
report-meta.json it shipped was conflict-markered by the union merge
(fixed in #560).
