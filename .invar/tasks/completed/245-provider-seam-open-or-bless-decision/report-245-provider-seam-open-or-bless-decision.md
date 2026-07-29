# READY — #245 (open the provider seam and prove it with SQLite)

## Result

The work is complete. Invar now has one generic, reactive provider registry per
workspace. The registry is type-blind. Consumer modules still own their provider
interfaces.

The structure and inline-rewrite rendezvous now use this registry. The old
`StructureSources` registry and direct inline-rewrite provider construction are
gone.

The database proof has two separate plugins. One plugin provides real SQLite.
The other plugin consumes the neutral database interface. A test removes SQLite
and installs a fake plugin without changing the consumer.

## Change

- Added `src/modules/plugins/ProviderRegistry.ts`.
- Made `Workspace.providers` the one public provider seam. The protected
  `Workspace.provider` path now resolves through it.
- Moved structure source registration and resolution to the host registry.
- Added a consumer-owned `RewriteProviderFactory`. The LSP plugin publishes the
  factory. Inline Rewrite resolves it and no longer imports a concrete provider.
- Added the database provider interface, real SQLite connection, bounded query
  results, lazy schema description, provider plugin, consumer plugin, and
  database pane.
- Added provider and database invariant records. Updated the structure, LSP, and
  inline-rewrite records.
- Added
  `.invar/tasks/active/245-provider-seam-open-or-bless-decision/census-245-provider-rendezvous.ts`.
  It reports exactly one rendezvous.
- Extended the existing plugin-manifest PTY smoke. It now removes and reinstalls
  the SQLite provider and Database Explorer independently.
- Left `src/modules/ui/ui.invariants.md` and all `src/modules/ui/` files
  untouched.

## Driven evidence

I drove defaults before changing code.

- The default small TypeScript fixture opened the Structure pane. The real
  language server returned a ready outline with one request.
- The 100,000-line text fixture stated that no installed source answers for the
  file type. It issued zero structure requests.

I drove the same paths after the migration.

- The small TypeScript fixture still returned a ready structure outline with one
  request.
- The inline-rewrite typed drive passed every proposal, stale-response, and
  feature-off claim.
- The database pane resolved real SQLite on a small source file. It painted
  `Provider: sqlite`, `Query value: 42`, and
  `Schema: provider_seam_probe`.
- The database pane produced the same three values with the shared 100,000-line
  fixture. File size did not change database behavior.
- The final plugin-manifest drive passed. Language Intelligence withdrew the
  structure source. Structure Navigator removed its `structure*` status keys.
  SQLite Provider removed its registry entry and
  `databaseProviderPluginActive` key. Database Explorer removed its pane and all
  `database*` consumer keys. Each plugin reinstalled and worked again.

## Positive controls

- The census fixture contains all four known rendezvous shapes. It detected all
  four before it scanned production code.
- I removed the SQLite provider withdrawal for one run. The lifecycle smoke
  exited 1 at `the database consumer states that no provider remains`. I restored
  the withdrawal.
- I changed the fake plugin result from `84` to `42`. Its substitution test
  exited 1 with expected `"84"` and received `"42"`. I restored `84`.
- I let the SQLite query read one extra row. Its bound test exited 1 because the
  third row appeared. I restored the row bound.

## Verification

All final commands ran from the task worktree.

| Command | Exit | Result |
| --- | ---: | --- |
| `bunx tsc --noEmit` | 0 | TypeScript passed. |
| `bun test` | 0 | 1,818 tests passed; 0 failed; 68,135 expectations. |
| `bash scripts/conventions-gate.sh` | 0 | Conventions passed. |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | 0 | 1,035 annotations and 217 lattice links resolved; 0 problems. |
| `bun scripts/check-coverage-ratchet.ts` | 0 | 322 files inspected; no undeclared decrease against `831e5cf`. |
| `bun scripts/check-file-grammar.ts` | 0 | 541 TypeScript files inspected; 0 violations. |
| `bun .invar/tasks/active/245-provider-seam-open-or-bless-decision/census-245-provider-rendezvous.ts --require-one` | 0 | Positive control found four shapes; production total was one. |
| `bunx prettier --check .` | 0 | All files matched the format. |
| `bun scripts/harness/smoke-plugin-manifest-harness.ts` | 0 | All lifecycle arms passed. |
| `git diff --exit-code -- src/modules/ui/ui.invariants.md` | 0 | The UI invariant record was untouched. |

I did not run the merge gate, as required.

## Commit

Commit: `83c9aa0c1fb520ea0e6a0e8d5b0d44e117c6c27c`

Subject: `Open one host provider registry and prove it with SQLite`

The worktree is clean. I did not push, merge, tag, or delete a branch.

## Bycatch

- The Extensions list wrapped the first label, `SQLite Database Provider`, onto
  two grid rows at 150 columns. The exact row locator then could not select it.
  This reproduced once in the first database lifecycle drive. I shortened this
  task's label to `SQLite Provider`. I did not change the shared list renderer,
  and I did not run a second reproduction with the long label.
