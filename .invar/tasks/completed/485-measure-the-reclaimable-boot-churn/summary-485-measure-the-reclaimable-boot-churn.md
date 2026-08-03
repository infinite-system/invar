# Summary 485 — measure the reclaimable boot churn

Landed efe1eb8f, 29m dispatch-to-landing, first-try green gate.

The measurement: 189 Invar starts across the full smoke set; 36 reclaimable
(19 percent, ~8.5GB-boots at 236MB each); 153 semantic (the boots ARE the
coverage). Strict classification: uncertain counted as semantic.

USER DECISION 2026-08-03: NO conversion. Verbatim: "we won't be converting
it, no need for cross test contamination risk, returns are marginal and our
gate is now mostly running smooth." The warm-reuse question is CLOSED —
do not re-propose smoke conversion to a shared warm app. The instruments
(source census, runtime boot counter) stay; #486 refines the counter.

Bycatch converted: #486 (counter counts drivers, not subjects). The two
gate contention FAILs were the declared remainder residuals.
