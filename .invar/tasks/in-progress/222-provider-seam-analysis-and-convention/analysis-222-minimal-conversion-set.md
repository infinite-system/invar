# 222 — the minimal conversion set for #223, and the deferred rest

The user judged a 51-file sweep excessive. The measurement agrees. This document proves what the
smallest honest first step is.

## The fact that shrinks the whole problem

**New code pays one getter. It does not pay the migration.**

A file written today that needs `Files` declares `protected get Files() { return Files.Class; }`
and reads `this.Files`. That is one accessor, written once, at the moment the file is written.
The 254 bare sites are a cost that belongs entirely to EXISTING files.

#223 is a greenfield plugin. Its whole `src/modules/datastore/` tree is new. So the question is
not "how much of the tree must convert". It is "which existing files does #223's own work force it
to touch, and what is the smallest conversion that proves the convention rather than merely
obeying it".

## What #223 actually consumes

Read against the plan in `.invar/tasks/active/223-database-plugin-proves-provider-seam`:

| capability | does #223 need it? | evidence |
| --- | --- | --- |
| `Files` | YES | the sqlite provider opens a FILE. It needs `exists`, `extname`, and `confineToRoot` for the path-traversal boundary. |
| `Clock` | YES | a query's elapsed time and a connection's last-refresh time. Same shape as `src/modules/git/GitRepository.ts:132`. |
| `Processes` | **NO** | `bun:sqlite` runs in process. `Bun.sql` opens a socket. Neither provider spawns a tool. |
| `Environment` | MAYBE | only if the pg provider reads a connection variable rather than a setting. Prefer a setting. |
| `StatusChannel` | NO | a plugin publishes through `context.statusProjectionContributions.register`. `StatusSnapshot` ends with `[key: string]: unknown` (`src/modules/system/StatusChannel.ts:97`), so no host edit and no direct use. |
| `Logging`, `Clipboard`, `FrameProbe` | NO | nothing in the plan touches them. |
| `Momentum` | INDIRECTLY | the panes scroll, but through `ScrollableTextViewport` or `PaneScrollPort`, which own the momentum already. |

**This corrects the brief's guess.** The brief expected "likely Files + Processes + Clock".
`Processes` is not consumed. Both engines are reached in process or over a socket. If a provider
ever does shell out, to `pg_dump` for example, then `Processes` joins the set on that day and the
gate rule catches it, because `src/modules/datastore/` has no baseline row.

### A note on the providers themselves

The sqlite provider imports `bun:sqlite`, and the pg provider reads `Bun.sql`. Both are ambient
capability reads by the criterion in `analysis-222-classification.md`. That is correct and it is
allowed. **A provider IS the seam's leaf.** Its whole job is to touch the engine. The convention
governs CONSUMERS reaching PAST a seam, not the implementation behind one. The gate rule scopes
itself to the capability roots for exactly this reason, and the same logic already exempts
`src/modules/terminal/OpenPtyBackend.ts` from the *External tools share one launch policy*
invariant.

## The minimal set, ranked

### Tier 0 — the new code, mandatory, zero migration cost

Every new file under `src/modules/datastore/` that reaches `Files` or `Clock` declares its own
getter. About four accessors in total. This is not a conversion. It is writing the file correctly
the first time.

Done-test: `bun scripts/check-effect-seams.ts` prints no row for `src/modules/datastore/`.
Because that directory has no baseline row, ONE bare site fails the gate. The rule protects the
new module from day one.

### Tier 1 — convert `Clock` completely. 2 files, 2 getters, 2 sites.

- `src/modules/editor/Editor.ts:507` — `Clock.Class.now()` in `captureBefore`.
- `src/modules/git/GitRepository.ts:132` — `Clock.Class.now()` for `lastRefreshAt`.

Four reasons it goes first, in order of weight:

1. **It is the only namespace that can reach ZERO in one sitting.** After it, `Clock` has no bare
   site anywhere and its two baseline rows are deleted. A shrinking baseline that has never
   removed a namespace is a baseline nobody has proved can shrink. This is the ratchet's first
   real tooth.
2. **It deletes production code.** `src/modules/system/Clock.ts:14` publishes `freeze`, a test
   hook whose only caller is `src/modules/system/Clock.test.ts:6` and `:9`. A capability with its
   own private test hook is a capability with no seam. Once each consumer can override its own
   clock, `freeze` and the `timeSourceOverride` field both go. The conversion is a net removal.
3. **#223 consumes the same capability.** The trial exercises the seam it converted, in the same
   task, rather than converting one thing and proving another.
4. **The two sites are two lines.** If a two-line conversion is hard, the convention is wrong and
   everyone finds out cheaply.

Done-test: `bun census-222.ts uses Clock` prints zero external files with `bare` above 0, and
`grep -rn "freeze" src/modules/system/Clock.ts` returns nothing.

### Tier 2 — convert `Files` ONLY in the files #223 touches.

The plan promises sqlite "openable from the file tree, a real feature on day one". That reaches
`src/modules/filetree/FileTree.ts`, which holds 3 bare `Files` sites and needs 1 getter.

Convert that file. Convert no other. If #223's work opens a second existing file that already
touches `Files`, convert that one too, on the same rule: **you convert what you edit, and nothing
else.** That is the rule `project.conventions.md` already states for the file-grammar sweep, so it
is not a new policy.

Done-test: the baseline rows for the touched files are gone, and
`bun scripts/check-effect-seams.ts` reports a lower total with no failure.

### Tier 3 — `Environment`, only if the pg provider reads a variable.

Then the cost is ONE getter in the new pg provider file. The four existing `Environment`
consumers are not touched. Prefer a registered setting over an environment variable, which is
what `src/modules/lsp/LspPlugin.ts:29` does for its own server choice, and then this tier
disappears.

## The deferred rest, each with its reason

| namespace | files | sites | why it waits |
| --- | ---: | ---: | --- |
| `Files` (the rest) | 21 | 95 | The largest single cost in the tree and unrelated to the trial. The baseline blocks new coupling while it waits, so waiting is safe rather than merely tolerated. Convert by attrition: whoever edits one of the 21 converts that one. |
| `Processes` | 6 | 6 | #223 does not consume it. Converting it would prove the convention against a capability the trial never exercises, which is a decorated green. Three of its ten consumers already wrap it, so the pattern is already demonstrated there. |
| `StatusChannel` | 7 | 26 | The contribution seam avoids it entirely. A plugin that must not touch it is evidence the boundary is already right. |
| `Logging` | 11 | 18 | Untouched by the trial. Its 11 files are the widest spread for the least benefit: a logger substitution is rarely what a test needs, because the assertion is about behaviour, not about the log. |
| `Clipboard` | 8 | 12 | Untouched by the trial. Note it is already substitutable a different way: `Clipboard.setOsc52Emitter` (`src/modules/system/Clipboard.ts:23`) is an injection point, so the pressure that produced the getter elsewhere was relieved here by a different seam. |
| `Environment` | 4 | 19 | 10 of the 19 sites are in `src/modules/theme/TerminalCapabilities.ts`, which reads terminal geometry and capability variables. That file wants ONE getter and a careful read, not a sweep pass. |
| `FrameProbe` | 1 | 1 | One site, in `src/modules/app/Bootstrap.ts:1236`. It is debug-only and env-gated. Convert it whenever Bootstrap is next edited. |
| `Momentum` | 10 | 72 | **Do not convert this one.** A getter would wrap a pure physics engine and hide the real defect. The defect is the ambient `performance.now()` default at `src/modules/system/Momentum.ts:69` and `:121`, live at all 14 production call sites. The fix is to pass the frame timestamp the callers already hold, which makes Momentum fully pure and removes a second clock from the app. Filed as bycatch. |
| `TextSegmentation` | 4 | 10 | PURE. A getter here would be a convention VIOLATION, not a delay. |
| `UndoStore` | 1 | 1 | PURE. Same. It already takes `now` as a parameter (`src/modules/storage/UndoStore.ts:45`), which is the shape `Momentum` should have. |

## Summary

- #223 converts **2 existing files for `Clock`**, plus **1 existing file for `Files`** if it wires
  the file-tree open. Three files, three getters, five sites.
- Its own new module pays about four getters and no migration.
- `Processes` leaves the minimal set. The brief's guess was reasonable and the evidence does not
  support it.
- The other 48 files convert by attrition, held by a gate rule that blocks every new bare site
  today.

The smallest honest first step is three files. It converts one namespace to zero, deletes a
production test hook, and exercises the same capability the trial itself uses.
