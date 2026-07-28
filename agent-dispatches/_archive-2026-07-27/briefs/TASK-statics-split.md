# TASK — split the ivue statics commit: land the naming axis, park the cache axis

Work ONLY in `/tmp/conductor-statics` (branch `refactor-ivue-statics`, tree clean at
`ad3bd66`). Do NOT run `scripts/merge-gate.sh`. Do NOT push, merge, tag, or delete
branches. Report to `/tmp/statics-split-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

Read `/tmp/statics-READY.md` first — it is your own predecessor's report and its findings
are accepted. Do not re-derive them.

## Why you are here

The migration is correctly BLOCKED: ivue 2.2.0's shipped `Static()` semantics do not cover
this repo's class topologies, and the unconditional shallow freeze crashes startup. Fixing
ivue itself is the user's decision (it is their library, published and versioned), so that
part waits.

But `ad3bd66` bundles **two independent axes**, and only one of them is blocked:

- **BLOCKED — the cache axis:** removing the 56 hand-rolled `Object.defineProperty`
  self-replacements and the four private cache helpers, and bumping ivue to 2.2.0. This
  depends on ivue semantics that do not yet hold.
- **LANDABLE — the naming axis:** the SCREAMING_SNAKE literal-getter convention, the
  `scripts/check-static-getter-naming.ts` checker and its seven tests, the conventions-gate
  step, the `project.conventions.md` documentation of the two orthogonal axes (`$` means
  cached-vs-uncached; case means literal-vs-derived), and the 132 ordinary literal-static
  renames. None of that touches the cache mechanism.

**Your job is to separate them so the landable half lands now.**

## Job 1 — split the commit

Reset to `origin/main` and rebuild the naming axis as its own commit, carrying NO ivue
version bump, NO removal of the hand-rolled caches, and NO removal of the four private
cache helpers. The 18 Pass A / Pass B disagreements your predecessor resolved are part of
the naming axis — keep those resolutions and their reasoning.

The test is mechanical: after your commit, `rg 'Object.defineProperty\(this'` must still
find the 56 existing self-replacements, `package.json` must still say `ivue: ^2.1.0`, and
the app must still boot. **Drive it to confirm the app boots** — that is the check that
failed on the blocked branch, so it is the one that matters most here.

Preserve the blocked work: leave `ad3bd66` reachable on `refactor-ivue-statics` (the
conductor will park it with a tag). Do not amend or discard it — it is the evidence behind
the ivue report and will be the starting point once ivue ships the fix.

## Job 2 — write the ivue defect report

Write `/tmp/IVUE-2.2.0-FINDINGS.md`, addressed to the user, decision-ready in one read. It
must be precise enough to act on without re-running anything, and honest about what is a
defect versus what is a missing contract.

Three findings, each with: the runtime probe that demonstrates it, the exact file and line
in `node_modules/ivue`, the observable consequence in Invar, and the candidate fixes with
their trade-offs.

1. **`$` caching does not reach non-`Static()` classes.** 29 intended cached getters across
   14 classes are fresh-per-read when the namespace is published via `Reactive(...)`, as a
   raw class, or when a test extends `X.$Class` without wrapping. Measured consequences:
   `EditorWrap.test.ts` rebuilds its fold projection 40,001 times and times out;
   `DiffView.test.ts` indexed reads go 1,055 → 2,110. Probe output was
   `{"reactiveStaticStable":false,"staticWrappedStable":true}`.
   Candidate fixes to lay out: install the cache wherever `$` getters are declared rather
   than only in `Static()`'s generated class; OR document that `$` **requires** `Static()`
   and make the violation a gate check rather than silent slow code. Say which you would
   pick and why — silent loss of caching is the worst property of the current behaviour,
   so a loud contract may beat a broader mechanism.
2. **Unconditional shallow freeze crashes startup.** `StatusChannel.$state` is a plain
   object cached through `Static()`; 2.2.0 freezes it, and `Object.assign(this.$state,
   patch)` throws at `StatusChannel.ts:61` during boot. Quote the stack.
   Note the asymmetry that makes the freeze misleading rather than merely strict: it is
   shallow, so `Map`/`WeakMap` `.set()`/`.delete()` still mutate freely and values inside
   collections are untouched. Include your mutation census — the freeze forbids the one
   pattern it can see and permits the seven it cannot.
   Candidate fixes: an opt-out marker for intentionally-mutable cached state; freeze only
   in development; or do not freeze and rely on convention. State the trade-off between
   catching accidental mutation and supporting deliberate mutable caches.
3. **The method-binding order hole persists** at `node_modules/ivue/lib/Static.ts:55` — a
   method is bound and defined on `this` with no `Object.hasOwn` guard, so a parent-first
   call makes a subclass receive the parent-bound method. Probe:
   `{"parentFirst":"parent","ownsParentValue":true,"ownsChildValue":false}`. This is the
   defect behind repo task #130 and is now confirmed against 2.2.0.

**Make no change inside `node_modules/ivue`, and do not touch `/home/parallels/dev/ivue`.**
Report only. Patching a published library is the user's call.

## Verification — quote exact exit codes

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, plus a driven boot of the real app proving it
starts. One verification pass at the end.

Full descriptive identifier names, 80 columns. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>` and leave the tree clean.
