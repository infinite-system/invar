# READY — Task 511 inversion design and sync census

## In plain words

The user wants to know what it would cost to run Invar on your own machine
while the files, git, and terminals live on a remote machine. I wrote the
design document that answers this, and a counting script that found the 70
places in the code that read a file or start a program and expect the answer
instantly. Those places would each have to learn to wait. The document
recommends waiting to build it, and names the exact numbers that would
change that answer.

## Result

Status: READY

Commits on `fleet/511-inversion-design-and-sync-census`:

- `cf7e358a` (`design #511: the inversion design doc + the sync-call census`)
- `b111c493` (`bycatch #511: remove dead Files import in RootView`)

The tree is clean apart from the dispatcher's untracked fundamentals file,
which I left untouched.

## Deliverables

1. **[project-inversion-design.md](../../../../project-inversion-design.md)**
   at the repo root. Topology (local model+UI, remote
   `iv --channel-server` grown into the capability daemon), all 16
   Bun-coupled capability classes judged one line each (the feasibility
   note's 12 plus the four that grew in since: the #509 channel trio and
   `RuntimeSample`), the latency plan (mirror caches invalidated by remote
   watcher streams, what stays chatty and why), the invariant records the
   design must respect (cited with anchors, none edited), proposed protocol
   namespace reservations (doc-only), and the recommendation.
2. **[census-511-sync-call-sites.ts](census-511-sync-call-sites.ts)** in
   this task folder. It DISCOVERS the sync method sets from the capability
   sources (never hand-lists them), counts receiver-matched call sites by
   AST, and classifies each site's nearest enclosing function.

## The numbers (stamped at dispatch commit `88316755`)

- **70 synchronous capability call sites**: 55 on `Files` sync-I/O methods,
  15 on `Processes.spawn`. Another 93 `Files` calls are pure path math and
  need no conversion.
- Shape of the bill: 59 sites in sync functions (these ripple to their
  callers), 10 already inside async functions (free), one in a constructor
  (`FfmpegVideoSource`), and **0 in getters**. The zero-getter row means no
  sync I/O hides inside the reactive derivation layer, so no site needs the
  cache-or-nothing redesign.
- Concentration: agent 10, lsp 7, git 6, terminal 5, text 5. About 12-15 of
  the 70 sit in capabilities that stay local, so the remote bill is nearer
  55-58 sites across ~25 files.
- Recommendation: **defer, do not park**. The flip triggers are measured
  `iv ssh` round-trip time above 80-100ms, a green-lit GUI experiment, or
  the census count rising past ~150.

## Verification

- Census controls, all three arms green: positive (known live sites in
  `TextDocument` and `Clipboard` found), negative (56 sync-named calls on
  non-capability receivers seen and zero counted, with the seam files contributing
  zero), completeness (every value-importer of `Files` explained).
- Red arm proven: a deliberately broken receiver-matcher collapsed the
  count from 70 to 13 and exited 1 with
  `POSITIVE CONTROL FAILED: TextDocument Files.read found=false, Clipboard Processes.spawn found=false`.
- The census re-ran green after prettier's commit-hook formatting (exit 0).
- `bunx tsc --noEmit` exits 0. The invariants checker (`--all --refs`)
  reports 0 problems (my doc's first draft introduced 5 anchor-less
  contract links; fixed before commit).
- STE lint on the design doc: 2.02 violations per 100 words, em-dash count
  2 (down from 3.78 / 56 in the first draft). The residue is mostly
  bullet-list paragraph counting and possessive apostrophes the linter
  reads as contractions.

## Bycatch

- **FIXED** (`b111c493`): dead import — `src/modules/ui/RootView.ts`
  imported `Files` and never referenced it. Found by the census
  completeness guard. One line removed, tsc green.
- **Invariant violated in function** — the established record
  [External tools share one launch policy](../../../../src/modules/system/system.invariants.md#external-tools-share-one-launch-policy)
  says its verification grep must report only `Processes.ts` and the
  documented `OpenPtyBackend` exemption. It reports two more live sites:
  `src/modules/monitoring/LinuxProcessSampler.ts:74` (`Bun.spawnSync` of
  `getconf`) and `src/modules/media/FfmpegVideoSource.ts:100`
  (`Bun.spawnSync` of `mkfifo`). Both bypass `hermeticEnvironment`, and both
  reproduce with the record's own verification command. Not fixed here. The
  right fix is a seam decision (add a sync-run surface to `Processes` or
  convert the callers), not a local edit. `LinuxProcessSampler` also reads
  `/proc` via raw `readFileSync` beside the `Files` capability, which is
  defensible (it samples the process, not the workspace) but unrecorded.
- **Comment drift, mild** — that same record's Verification field says the
  grep reports only two files; reality reports four. The record text was
  true when refined (2026-07-24); the two violations grew in afterward.
  One side is the record, the other is the two sites above. Fixing the
  sites heals the record without editing it.

## Instrument feedback

- EASY: `ast-query` for quick probes; the 488 census scripts as a copyable
  model with controls; the invariants checker caught
  my own doc's anchor-less links before commit.
- CONFUSING: running a census script from outside the repo root breaks its
  `typescript` import with an unrelated-looking
  `ts.ScriptTarget is undefined` error (module resolution, not the
  script). Cost one probe. A one-line guard (`assert typescript resolved,
  run from the repo root`) in future census headers would name it.
- MISSING: nothing hard. A reusable "receiver-matched capability call
  census" primitive in ast-query (receiver pattern + method set) would
  have saved the bespoke matcher; the bespoke script was still the right
  call here because of the derived method sets and controls.

## Notes for the conductor

- The design doc proposes protocol namespace reservations (`process.*`,
  `watch.*`, `db.*`) as DOC-ONLY: no edit to
  [docs/iv-channel-protocol.md](../../../../docs/iv-channel-protocol.md)
  rides with this task, per the brief's design-only rule.
- No invariant record was edited. The confined-root refinement from the
  wave draft stays with #508's thread; this doc only states where the
  confinement check must live after an inversion (daemon side).
