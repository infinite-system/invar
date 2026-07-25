// ast-query — structural code search: parses TypeScript into ASTs and answers questions grep
// cannot answer reliably (multiline constructs, comment/string mentions, aliasing). ~0.2s for the
// whole src/modules tree: parsing is cheap, only type-CHECKING is slow, and this never type-checks.
// Usage:
//   bun scripts/ast-query.ts calls <name>         # genuine call sites of a bare identifier
//   bun scripts/ast-query.ts news <ClassName>     # `new X(...)` construction sites
//   bun scripts/ast-query.ts identifiers <name>   # every identifier occurrence (declarations + uses)
//   bun scripts/ast-query.ts classes              # every class declaration
//   bun scripts/ast-query.ts module-functions     # module-level function declarations (grammar debt)
//   bun scripts/ast-query.ts private-members      # `private` modifiers + #private names (grammar debt)
// Flags: --tests (include *.test.ts)  --path <glob-root under repo, default src/modules>
import * as ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = new URL('..', import.meta.url).pathname;
const argumentList = process.argv.slice(2);
const includeTests = argumentList.includes('--tests');
const pathFlagIndex = argumentList.indexOf('--path');
const searchRoot = pathFlagIndex >= 0 ? argumentList[pathFlagIndex + 1] : 'src/modules';
const positional = argumentList.filter(
  (argument, index) =>
    !argument.startsWith('--') && (pathFlagIndex < 0 || index !== pathFlagIndex + 1),
);
const queryMode = positional[0];
const queryName = positional[1];

if (!queryMode) {
  console.error('usage: bun scripts/ast-query.ts <calls|news|identifiers|classes|module-functions|private-members> [name] [--tests] [--path <root>]');
  process.exit(2);
}

type MatchPredicate = (node: ts.Node, sourceFile: ts.SourceFile) => string | null;

const predicateByMode: Record<string, MatchPredicate> = {
  calls: (node) =>
    ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === queryName
      ? `${queryName}(…)`
      : null,
  news: (node) =>
    ts.isNewExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === queryName
      ? `new ${queryName}(…)`
      : null,
  identifiers: (node) =>
    ts.isIdentifier(node) && node.text === queryName ? queryName : null,
  classes: (node) =>
    ts.isClassDeclaration(node) ? `class ${node.name?.text ?? '<anonymous>'}` : null,
  'module-functions': (node, sourceFile) =>
    ts.isFunctionDeclaration(node) && node.parent === sourceFile
      ? `function ${node.name?.text ?? '<anonymous>'}`
      : null,
  'private-members': (node) => {
    if (ts.isPrivateIdentifier(node)) return `#${node.text}`;
    if (
      (ts.isPropertyDeclaration(node) || ts.isMethodDeclaration(node))
      && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword)
    ) {
      const memberName = ts.isIdentifier(node.name) ? node.name.text : '<computed>';
      return `private ${memberName}`;
    }
    return null;
  },
};

const predicate = predicateByMode[queryMode];
if (!predicate) {
  console.error(`unknown mode: ${queryMode}`);
  process.exit(2);
}
if (['calls', 'news', 'identifiers'].includes(queryMode) && !queryName) {
  console.error(`mode ${queryMode} needs a name argument`);
  process.exit(2);
}

let matchCount = 0;
for (const relativePath of new Bun.Glob(`${searchRoot}/**/*.ts`).scanSync({ cwd: repositoryRoot })) {
  if (!includeTests && relativePath.endsWith('.test.ts')) continue;
  const sourceText = readFileSync(join(repositoryRoot, relativePath), 'utf8');
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    const label = predicate(node, sourceFile);
    if (label !== null) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      console.log(`${relativePath}:${line + 1}  ${label}`);
      matchCount += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}
console.log(`ast-query ${queryMode}${queryName ? ' ' + queryName : ''}: ${matchCount} match(es)`);
