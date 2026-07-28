# READY — #131 bare-identifier completion

Commit: `5f0f606` (`Restore bare identifier completion`)

## Outcome

Bare identifiers now start provider-neutral completion automatically. Imported
bindings and file-local declarations appear after a three-character prefix,
while member access retains its existing trigger-character path.

The request is coalesced across the current input turn and a complete result is
reused while the prefix extends. At both 20 and 100,000 lines, each
three-character prefix issued exactly one provider request and prepared popup
matches exactly once.

## Reproduction and diagnosis

Before the change, real-tsgo PTY drives showed all three reported failures:

- default import `De`: popup closed, completion requests `0 -> 0`;
- named import `na`: popup closed, completion requests `0 -> 0`;
- file-local const `lo`: popup closed, completion requests `0 -> 0`.

The closed-popup editor path requested completion only when the typed character
was in the server's trigger-character list. Bare prefixes therefore never
reached `LanguageProvider.completion`.

After adding the identifier-prefix request, the first instrumented attempt
issued one request but returned no items because the second character advanced
the document revision before the first request crossed the LSP synchronization
guard. Deferring the request to the input-turn boundary and retaining an
in-flight prefix fixed that race without adding one request per keystroke.

## Permanent contract

`scripts/harness/smoke-completion-harness.ts` now drives one TypeScript fixture
through real tsgo at 20 and 100,000 lines. From the emulator grid it verifies:

- default and named imports;
- file-local const, function, and class declarations;
- value, callable, and type-family marks;
- member field and method marks as the trigger-character regression control;
- one provider request and one match preparation per three-character prefix.

The existing 5,000-item mock-provider case still proves bounded painting and
zero provider requests/refilters during selection movement and scrolling.

Positive control: changing the bare-prefix scheduler predicate so it could
never request produced:

> Timed out waiting for status condition: bare prefix Zqx selects
> ZqxDefaultWidget

The planted run exited `1`; restoring the predicate returned the smoke to
green.

## Verification

- `bunx tsc --noEmit` — exit `0`
- `bun test` — exit `0` (`1651` pass, `0` fail)
- `bash scripts/conventions-gate.sh` — exit `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0`, `0 problem(s)`
- `bun scripts/check-coverage-ratchet.ts` — exit `0`
  (`17 assertions / 20 waits -> 20 assertions / 25 waits`)
- `bun scripts/harness/smoke-completion-harness.ts` run 1 — exit `0`
- `bun scripts/harness/smoke-completion-harness.ts` run 2 — exit `0`
- `bun scripts/harness/smoke-completion-harness.ts` run 3 — exit `0`

Invariant review scope was derived from the touched app/harness paths and the
completion vocabulary: root, app, harness, LSP, and UI contracts. All
implicated invariants were upheld.

## Bycatch

None observed.

## Follow-up

Auto-import remains out of scope. Real tsgo returns auto-import candidates, but
offering unimported symbols and applying their additional import edits is a
separate feature.
