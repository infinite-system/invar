# READY — database navigator real connection (#275)

## Result

The Database pane now opens a SQLite file that the user selects inside Invar. The user runs
`Database: Connect`, enters a path in the shared one-line field, and presses Enter. The pane states
the selected path and connection state. It shows tables and views. Enter expands a table or view to
show its columns and indexes. The same action opens a bounded row preview.

The preview fetches 20 rows at a time. Page Up and Page Down move between pages. The provider reads
one extra row only to calculate whether another page exists. It never loads the full result before
applying the bound.

`Database: Disconnect` closes the connection and clears the selected path.
`Database: Reconnect` closes and opens the same path. Hiding or suspending the observed pane also
releases its connection. A missing file, a locked database, and corrupt bytes each produce a stated
connection error in the pane.

The path stays in session state. It does not enter settings or persistent storage. This avoids stale
path and secret-storage policy. The path field uses `TextInputModel`, `TextFieldPainter`, and the
shared input action vocabulary.

The consumer still resolves the type-blind `DatabaseProvider` capability through the host registry.
The provider rendezvous census remains exactly one. PostgreSQL and MySQL remain outside this task.
They can implement `DatabaseProvider` without a new host rendezvous.

## Driven evidence

The baseline gesture opened the old `:memory:` proof, created `provider_seam_probe`, and painted the
fixed value `42`. That confirmed the task gap before code changed.

The completed PTY gesture used the real app:

1. Open the Command Palette.
2. Run `Database: Connect`.
3. Type the absolute `catalog.sqlite` path into the Database pane.
4. Press Enter.
5. Walk from `orders` to `products` with Down and Enter.
6. Walk all product pages with Page Down.
7. Run `Database: Reconnect`, then `Database: Disconnect`.
8. Repeat the connect gesture with a missing path, an exclusively locked database, and corrupt
   bytes.

The small fixture was `orders` with one row. The large fixture was `products` with 45 rows, two
columns, and `products_name_index`. Both tables used the same preview path. The large table produced
pages of 20, 20, and 5 rows. The first rows on pages two and three had identifiers 21 and 41.

The final database smoke reported:

- The Command Palette and shared path field connected the real file.
- Tables, columns, and the index were walkable.
- The 45-row table never published more than 20 rows.
- Reconnect reopened the selected path.
- Disconnect released and cleared the connection.
- Missing, locked, and corrupt files each stated their failure.

## Positive controls

I changed the preview page size from 20 to 45. The database smoke went red while it waited for the
first bounded `products` page. I restored 20.

I changed the visible `Connection error` label to `Connection unavailable`. The corrupt-file screen
check went red and printed the altered label with the SQLite `file is not a database` reason. I
restored `Connection error`.

The permanent smoke also proves its page bound with a 45-row source count and a 20-row published
count. Its corrupt-byte fixture proves that the error path is live.

## Verification

- `bun test`: 1,886 pass, 0 fail, 68,416 expectations across 292 files.
- `bun scripts/harness/smoke-database-harness.ts`: pass for the real gesture, small and large data,
  schema, paging, lifecycle, and all three file errors.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts`: pass, including independent Database
  provider and consumer uninstall and reinstall.
- Provider rendezvous census: positive control found 4 shapes; repository total was exactly 1 at
  `src/modules/plugins/ProviderRegistry.ts`.
- `bun scripts/ast-query.ts text-input-census --require-zero`: 0 matches.
- `bunx tsc --noEmit`: pass.
- `bash scripts/conventions-gate.sh`: pass; 557 TypeScript files checked with 0 file-grammar
  violations.
- Invariant checker: 1,094 annotations resolved, 217 lattice links resolved, 0 problems.
- Coverage ratchet: 322 files inspected with no undeclared decrease against `831e5cf`.
- `bunx prettier --check .`: pass.
- The enforced pre-commit merge gate passed. It included the full unit set, 62 parallel PTY jobs,
  the new database smoke, behavioral contracts, serial smokes, and the input timing probe.
- Round 2 merge commit `1c73e01351a21535a97ef95cf1b979b526a6c80d` absorbed main through
  `38a753a273c13bcff632105499d1791ce1a9ee23`.
- Post-merge `bun scripts/harness/smoke-database-harness.ts` exited 0.
- Post-merge `bun scripts/harness/smoke-plugin-manifest-harness.ts` exited 0. It covered both the
  landed structure navigator behaviors and database uninstall symmetry.
- The non-skipped merge-commit gate passed in 3 minutes 26 seconds. All 62 parallel PTY jobs,
  behavioral contracts, serial smokes, and the input timing probe passed with no retry.

## Commit

`cec0e37488c029a174fdb79476156b8a71b78d08` — `Connect the database navigator to user-selected
SQLite files`

`1c73e01351a21535a97ef95cf1b979b526a6c80d` — `Merge main and preserve both dock text-input
paths`

The worktree is clean. I did not push, tag, or land the branch.

## Bycatch

- `scripts/harness/Drive.test.ts` captured `Parsing Markdown…` once even though the published state
  said `markdownParsing=false`. Its isolated rerun passed 10 tests, and the next full run passed
  1,886 tests. It did not reproduce a second time. I did not change it.
- The enforced merge gate timed out once in `smoke: panel-chrome harness`. Its built-in quiet retry
  passed and recorded the first attempt as a starvation-class flake. I did not change it.
- Round 2: None observed. The merge gate passed without a retry.

## Checkpoint

Round 2 checkpoint commit: `1c73e01351a21535a97ef95cf1b979b526a6c80d`. The implementation, main
absorption, three conflict resolutions, post-merge smokes, invariant records, and full merge gate
are complete. The worktree is clean. Nothing remains for this builder. The conductor can land this
commit.
