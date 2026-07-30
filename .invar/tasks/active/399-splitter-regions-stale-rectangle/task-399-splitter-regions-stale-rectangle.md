# #399 — splitterRegions.bottomPanel publishes a stale zero rectangle

State: ACTIVE
Priority: verification-integrity
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low

## Origin — #387 bycatch 3, reproduced every run

With the panel open and drag={left:38,top:20,width:73} in the same
snapshot, splitterRegions.bottomPanel = {left:0,top:3,width:0} — it
settles later. Site: RootView.splitterRegions via
renderableRegion(panelSplitter.renderable), near RootView.ts:2369. This
made a gated assertion vacuous (''==='', #387 bycatch 2 — repaired
smoke-side already). Fix the publisher so the region is absent-or-true,
never stale-zero; assert publish-time coherence with the drag geometry.
