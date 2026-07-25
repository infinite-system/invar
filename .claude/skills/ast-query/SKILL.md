---
name: ast-query
description: Structural code search for this repo — parse-don't-grep. Use for ANY question about code structure (call sites, construction sites, member kinds, pattern censuses); grep stays for text, docs, and logs.
---

# ast-query — parse, don't grep

## The rule
When the question is about **code structure** — "where is X *called*", "who *constructs* Y",
"how many Z exist", "does anything still use the old pattern" — use the AST tool, not grep.
Grep answers "which lines contain these letters" and is routinely WRONG about code: it matches
comments and strings, misses multiline constructs (a `return computed<Map…>(` split across lines
hides from `grep "computed("`), and cannot tell a declaration from a use. A parse-based query has
none of these failure modes and costs ~0.2s for all of `src/modules` — parsing is cheap; only
type-checking is slow, and this never type-checks. Grep remains correct and preferred for
prose/docs/logs/TODO text and for quick "does this string exist anywhere" checks.

Origin: a live grep-vs-AST confusion (2026-07-25) — a `computed()` census by string matched
comment mentions and missed continuation-line calls, inverting the conclusion twice; the AST
census settled it in 0.22s. Make that class of confusion extinct: parse.

## The ready tool
```
bun scripts/ast-query.ts calls <name>         # genuine call sites of a bare identifier
bun scripts/ast-query.ts news <ClassName>     # `new X(...)` construction sites (seam-bypass hunting)
bun scripts/ast-query.ts identifiers <name>   # every occurrence, declarations + uses
bun scripts/ast-query.ts classes              # all class declarations
bun scripts/ast-query.ts module-functions     # module-level function declarations (grammar debt)
bun scripts/ast-query.ts private-members      # `private` + #private (grammar debt)
```
Flags: `--tests` include test files; `--path <root>` search another tree (default `src/modules`).
Output is `file:line  label` plus a count — pipe-friendly.

## Custom one-off questions — the three-move pattern
When the ready modes don't cover the question, a bespoke census is ~25 lines:
1. **Parse**: `ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)` — text becomes a
   typed tree; comments/strings/code become different KINDS, never confusable again.
2. **Walk**: `const visit = (node) => { …; ts.forEachChild(node, visit); }; visit(sourceFile);`
3. **Ask structurally**: combine `ts.is*` guards — e.g. a genuine computed call is
   `ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'computed'`.
Use `sourceFile.getLineAndCharacterOfPosition(node.getStart())` for locations. Add new REUSABLE
questions as modes in `scripts/ast-query.ts` (one predicate entry) rather than as loose scripts.
NOTE: import the compiler as `import * as ts from 'typescript'`, and run scripts from inside the
repo so `typescript` resolves.

## Relation to the enforcement layer
`scripts/check-file-grammar.ts` is this same technique with a sequence grammar on top — ast-query
is the INVESTIGATIVE sibling of that ENFORCEMENT tool. Pattern for maturing a rule: ast-query
census (explore) → checker rule with a failure fixture (enforce). The `module-functions` and
`private-members` modes are live grammar-debt trackers — their counts shrink as big-bang waves
land and must read 0 in converted modules.
