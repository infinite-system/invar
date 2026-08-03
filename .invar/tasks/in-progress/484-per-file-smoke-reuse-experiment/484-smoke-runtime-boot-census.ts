/**
 * Find every direct Invar runtime boot in a live PTY smoke file.
 * Run: bun .invar/tasks/in-progress/484-per-file-smoke-reuse-experiment/484-smoke-runtime-boot-census.ts
 * Each row gives one smoke file, its direct `PtyTestDriver.Class` construction count, and source lines.
 * A larger count means the file has more static boot sites. Helper calls and loops still need runtime review.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';

const repositoryRoot = process.cwd();
const harnessDirectory = join(repositoryRoot, 'scripts', 'harness');

const smokeFilePaths = readdirSync(harnessDirectory, { withFileTypes: true })
  .filter(
    (directoryEntry) =>
      directoryEntry.isFile() &&
      /^smoke-.*-harness\.ts$/.test(directoryEntry.name),
  )
  .map((directoryEntry) => join(harnessDirectory, directoryEntry.name));

const directBootsByFile: Array<{
  filePath: string;
  sourceLines: number[];
  enclosingScopes: string[];
}> = [];

for (const filePath of smokeFilePaths) {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const sourceLines: number[] = [];
  const enclosingScopes: string[] = [];

  const enclosingScopeName = (node: ts.Node): string => {
    let currentNode: ts.Node | undefined = node.parent;
    while (currentNode) {
      if (
        (ts.isFunctionDeclaration(currentNode) ||
          ts.isMethodDeclaration(currentNode)) &&
        currentNode.name
      ) {
        return currentNode.name.getText(sourceFile);
      }
      currentNode = currentNode.parent;
    }
    return '<module>';
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isNewExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'Class' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'PtyTestDriver'
    ) {
      sourceLines.push(
        sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      );
      enclosingScopes.push(enclosingScopeName(node));
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  if (sourceLines.length > 0) {
    directBootsByFile.push({ filePath, sourceLines, enclosingScopes });
  }
}

directBootsByFile.sort(
  (left, right) =>
    right.sourceLines.length - left.sourceLines.length ||
    left.filePath.localeCompare(right.filePath),
);

for (const { filePath, sourceLines, enclosingScopes } of directBootsByFile) {
  console.log(
    `${sourceLines.length}\t${relative(repositoryRoot, filePath)}\t` +
      sourceLines
        .map((sourceLine, index) => `${enclosingScopes[index]}:${sourceLine}`)
        .join(','),
  );
}

console.log(
  `TOTAL ${directBootsByFile.reduce((sum, result) => sum + result.sourceLines.length, 0)} direct boot sites in ${directBootsByFile.length} smoke files`,
);
