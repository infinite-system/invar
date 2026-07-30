# READY — keybinding chord prefix single arm (#301)

Commit: `d8fafb9de38a181abf751236960c9a470c3116b2`

## Result

The keybinding resolver now arms every continuation that shares a prefix.
Each later step narrows the candidate set until one binding completes.

Later layers still shadow exact earlier bindings. Distinct continuations from
earlier layers remain reachable.

Go to Line now keeps `Alt+G` as its advertised primary binding. It also has
the `Ctrl+K Ctrl+G` alias that shares the fold prefix.

## Main changes

- [KeybindingRegistry.ts](../../../../src/modules/keybindings/KeybindingRegistry.ts)
  stores pending chord candidates instead of one binding.
- [KeybindingDefaults.ts](../../../../src/modules/keybindings/KeybindingDefaults.ts)
  restores the shared-prefix Go to Line alias.
- [KeybindingDefaults.test.ts](../../../../src/modules/keybindings/KeybindingDefaults.test.ts)
  locks both continuations and unmatched cancellation.
- [KeybindingRegistry.test.ts](../../../../src/modules/keybindings/KeybindingRegistry.test.ts)
  locks cross-layer continuation retention and exact-binding precedence.
- [keybindings.invariants.md](../../../../src/modules/keybindings/keybindings.invariants.md)
  now records shared-prefix candidate narrowing and unmatched type-through.

## Red then green

The restored `Ctrl+K Ctrl+G` binding made the permanent defaults test fail
against the old resolver:

```text
Expected: "editor.fold"
Received: null
18 pass
1 fail
```

After the resolver fix, the focused run reported:

```text
42 pass
0 fail
183 expect() calls
```

The final enforcing hook passed the expanded unit suite.

The existing cancellation contract lives in
[KeybindingRegistry.test.ts](../../../../src/modules/keybindings/KeybindingRegistry.test.ts).
Its wrong continuation clears pending state and resolves that same key normally.

[Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) then applies the
context default. An unmatched printable key therefore types through.

## Driven evidence

The real PTY path covered both continuations at both scales.

- The 479-line source folded at line index 11 with `Ctrl+K [`.
- The same source opened Go to Line with `Ctrl+K Ctrl+G`.
- The 138,625-line nested fixture folded at line index 0 with `Ctrl+K [`.
- The same large fixture opened Go to Line with `Ctrl+K Ctrl+G`.
- After `Ctrl+K z`, the 10-line fixture started with `zDRIVE-LINE-000001`.
- The 100,000-line fixture produced the same typed-through result.

The large fold case used
[make-nested-fold-fixture.ts](../../../../scripts/make-nested-fold-fixture.ts),
the repository's existing nested scale generator.

## Contracts

The change strengthens `Bindings are intent addressed`.
The layered, focus, canonical-floor, advertised-binding, and reserved-chord
records remain upheld.

The reserved resolver stayed stateless. The reserved-chord smoke passed in
both enforcing-hook attempts.

## Verification

- The focused keybinding tests passed before the final gate.
- Small and large real PTY drives passed.
- The invariant checker passed structure and reference checks.
- The enforcing hook passed conventions, type checks, unit tests, build,
  all 63 parallel PTY jobs, behavioral contracts, and the serial tail.
- Final result: `GATE_EXIT=0`.
- The worktree is clean.

## Bycatch

- The first hook attempt failed in the Tasks Dashboard behavioral contract.
  It could not reach the `[x] Tasks Dashboard` Extensions row.
  The unchanged second attempt passed the full behavioral contract.
- The failed hook left three test app instances live.
  The next hook reported `starting with 3 test app instance(s) live`.
  I did not inspect this out-of-scope cleanup failure.
- The panel-chrome smoke had one starvation-class timeout.
  Its built-in quiet retry passed, and the gate classified the result as a flake.
- The final input-byte check warned at p50 `9.045 ms`.
  Its report-only threshold was `6.406 ms`; ordering still passed.
