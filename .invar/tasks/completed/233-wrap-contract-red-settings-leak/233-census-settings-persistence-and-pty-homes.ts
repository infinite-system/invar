#!/usr/bin/env bun
/**
 * This census finds PTY harness launches that inherit the caller's home and settings persistence calls.
 * Run it from the repository root:
 *   bun .invar/tasks/active/233-wrap-contract-red-settings-leak/233-census-settings-persistence-and-pty-homes.ts
 * Each PTY line says whether its options object supplies HOME isolation. Each save line names a
 * receiver method call. An inherited PTY launch can read or write the real user settings. An unknown
 * launch passes a computed options value that this syntax-only census cannot classify.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as ts from 'typescript';

const repositoryRoot = process.cwd();
const sourceRoots = [
  resolve(repositoryRoot, 'scripts', 'harness'),
  resolve(repositoryRoot, 'src', 'modules'),
];

const sourcePaths = sourceRoots.flatMap((sourceRoot) =>
  collectTypeScriptPaths(sourceRoot),
);

let launchCount = 0;
let isolatedLaunchCount = 0;
let inheritedHomeLaunchCount = 0;
let unknownHomeLaunchCount = 0;
let saveCallCount = 0;

for (const sourcePath of sourcePaths) {
  const sourceText = readFileSync(sourcePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && isPtyTestDriverClass(node.expression)) {
      launchCount += 1;
      const options = node.arguments?.[0];
      const homeClassification = classifyHome(options, sourceFile);
      if (homeClassification === 'isolated') isolatedLaunchCount += 1;
      else if (homeClassification === 'inherits') {
        inheritedHomeLaunchCount += 1;
      } else {
        unknownHomeLaunchCount += 1;
      }
      printFinding(sourceFile, node, `PTY ${homeClassification.toUpperCase()}`);
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'save'
    ) {
      saveCallCount += 1;
      printFinding(
        sourceFile,
        node,
        `SAVE ${node.expression.expression.getText(sourceFile)}.save`,
      );
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

console.log(
  `SUMMARY PTY launches=${launchCount} isolated=${isolatedLaunchCount} ` +
    `inherits_home=${inheritedHomeLaunchCount} unknown=${unknownHomeLaunchCount} ` +
    `save_calls=${saveCallCount}`,
);

function collectTypeScriptPaths(directoryPath: string): string[] {
  const collectedPaths: string[] = [];
  for (const entryName of readdirSync(directoryPath)) {
    const entryPath = resolve(directoryPath, entryName);
    if (statSync(entryPath).isDirectory()) {
      collectedPaths.push(...collectTypeScriptPaths(entryPath));
    } else if (entryName.endsWith('.ts')) {
      collectedPaths.push(entryPath);
    }
  }
  return collectedPaths.sort();
}

function isPtyTestDriverClass(expression: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'Class' &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'PtyTestDriver'
  );
}

function classifyHome(
  options: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
): 'isolated' | 'inherits' | 'unknown' {
  if (!options || !ts.isObjectLiteralExpression(options)) return 'unknown';
  for (const property of options.properties) {
    if (
      ts.isShorthandPropertyAssignment(property) &&
      property.name.text === 'homeDirectory'
    ) {
      return 'isolated';
    }
    if (
      ts.isPropertyAssignment(property) &&
      property.name.getText(sourceFile) === 'homeDirectory'
    ) {
      return 'isolated';
    }
    if (
      ts.isPropertyAssignment(property) &&
      property.name.getText(sourceFile) === 'environment' &&
      ts.isObjectLiteralExpression(property.initializer) &&
      property.initializer.properties.some(
        (environmentProperty) =>
          (ts.isPropertyAssignment(environmentProperty) ||
            ts.isShorthandPropertyAssignment(environmentProperty)) &&
          environmentProperty.name.getText(sourceFile) === 'HOME',
      )
    ) {
      return 'isolated';
    }
  }
  return 'inherits';
}

function printFinding(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  label: string,
): void {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  console.log(
    `${relative(repositoryRoot, sourceFile.fileName)}:${position.line + 1} ${label}`,
  );
}
