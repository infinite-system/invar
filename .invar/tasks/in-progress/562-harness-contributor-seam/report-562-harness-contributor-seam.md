# READY — 562 harness contributor seam

## In plain words

Any project can now extend the graph by dropping one small file — a
Rust repo can add cargo semantics under its own key — without touching
iv-harness core, so core stays updateable. Broken or outdated
extension files are skipped with a loud message and the host keeps
answering.

## Delivered

- contributors module: .invar/harness/<name>.harness.ts default-exports
  {name, contractVersion, node(context)}; dynamic import happens BEFORE
  graph construction (the graph stays synchronous); mounts inherit
  ls/get/misses/did-you-mean/bounded-print from the plain resolver for
  free. Version skew, name collisions, broken files: skipped loudly,
  host survives. The exported interface IS the contract surface.
- Graph/CLI/server wired; module ratcheted at birth; 54 tests.

## Invariants in scope (answered)

- The host-complete-without-plugins + one-authority-per-boundary pair
  (the app's records, transferred): upheld by construction.
- A wrapped script keeps its logic in one place: binds contributors
  by doctrine (documented in the module header).
- The harness graph never imports from the app: upheld.

## Verification

- 5 contributor tests (mount+resolve, skew-loud, collision-refused,
  broken-never-breaks-host, absent-directory-silent) + merge
  re-verification with feature enumeration (the #561 merge-loss
  lesson applied: both features grep-verified present post-union).
- Driven cold: demo contributor mounted, resolved, missed-with-keys;
  skewed contributor refused while host answered.
- THE NO-DRIFT CHECK FIRED CROSS-BRANCH: 558's shapes catalog went
  stale the moment 562's fields merged in — caught by the
  regenerate-and-diff test at first contact, regenerated (26
  interfaces, 11 classes). The mechanism works.
- Gate red: bracket-match grid-wait timeout — solo-green same
  worktree, first sighting, filed #563; diff touches no app/smoke
  code. Landing under the narrow pre-existing-class rule.

## Bycatch

- #563 filed (bracket-match contention flake, first sighting).
