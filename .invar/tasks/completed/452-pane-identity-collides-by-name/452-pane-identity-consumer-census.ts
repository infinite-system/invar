#!/usr/bin/env bun

// This census finds code that consumes pane identity, compares an id-shaped value with a pane-kind
// string, or searches the whole terminal grid for a marker that can occur on several surfaces.
// Run it from the repository root with:
//   bun .invar/tasks/in-progress/452-pane-identity-collides-by-name/452-pane-identity-consumer-census.ts
// The first total counts uses of published pane-id fields. A change means the status identity API has
// gained or lost a consumer. The suspect totals are review queues, not failure counts: inspect every
// listed expression and classify it as exact identity, presentation, or an ambiguous visual lookup.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as typescript from 'typescript';

const repositoryRoot = process.cwd();
const skippedDirectoryNames = new Set([
  '.git',
  'node_modules',
  'retired-smokes',
]);
const paneIdentifierFieldNames = new Set([
  'panelActiveContent',
  'panelActiveSpace',
  'panelActiveSpacePaneIds',
  'panelCellIds',
  'panelContentIds',
  'panelContentOrder',
  'panelGroups',
  'panelSpaceIds',
]);
const paneKindNames = new Set(['agent', 'database', 'media', 'terminal']);
const ambiguousPaneMarkerNames = new Set([
  'Agent',
  'Claude',
  'Database',
  'Structure',
  'Terminal',
  '❯',
  '❯ ',
]);

interface Finding {
  readonly filePath: string;
  readonly line: number;
  readonly text: string;
}

function sourcePaths(directoryPath: string): string[] {
  const paths: string[] = [];
  for (const entryName of readdirSync(directoryPath)) {
    if (skippedDirectoryNames.has(entryName)) continue;
    const entryPath = join(directoryPath, entryName);
    const entryStat = statSync(entryPath);
    if (entryStat.isDirectory()) paths.push(...sourcePaths(entryPath));
    else if (/\.(?:ts|tsx)$/.test(entryName)) paths.push(entryPath);
  }
  return paths;
}

function lineOf(
  sourceFile: typescript.SourceFile,
  node: typescript.Node,
): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

function compactText(
  node: typescript.Node,
  sourceFile: typescript.SourceFile,
): string {
  return node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 220);
}

function containsIdentifierField(node: typescript.Node): boolean {
  let found = false;
  const visit = (candidate: typescript.Node): void => {
    if (
      typescript.isIdentifier(candidate) &&
      paneIdentifierFieldNames.has(candidate.text)
    ) {
      found = true;
      return;
    }
    typescript.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

function containsGenericIdentifierAccess(node: typescript.Node): boolean {
  let found = false;
  const visit = (candidate: typescript.Node): void => {
    if (
      typescript.isPropertyAccessExpression(candidate) &&
      (candidate.name.text === 'id' || candidate.name.text === 'identifier')
    ) {
      found = true;
      return;
    }
    typescript.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

const identifierFieldUses: Finding[] = [];
const kindAgainstIdentifierSuspects: Finding[] = [];
const unscopedMarkerSuspects: Finding[] = [];

for (const sourcePath of [
  ...sourcePaths(join(repositoryRoot, 'src')),
  ...sourcePaths(join(repositoryRoot, 'scripts')),
]) {
  const sourceText = readFileSync(sourcePath, 'utf8');
  const sourceFile = typescript.createSourceFile(
    sourcePath,
    sourceText,
    typescript.ScriptTarget.Latest,
    true,
  );
  const recordedSuspectStarts = new Set<number>();
  const visit = (node: typescript.Node): void => {
    if (
      typescript.isIdentifier(node) &&
      paneIdentifierFieldNames.has(node.text)
    ) {
      identifierFieldUses.push({
        filePath: relative(repositoryRoot, sourcePath),
        line: lineOf(sourceFile, node),
        text: node.text,
      });
    }

    if (
      typescript.isCallExpression(node) &&
      typescript.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'findText' &&
      node.arguments.length > 0 &&
      typescript.isStringLiteralLike(node.arguments[0]!) &&
      ambiguousPaneMarkerNames.has(node.arguments[0]!.text)
    ) {
      unscopedMarkerSuspects.push({
        filePath: relative(repositoryRoot, sourcePath),
        line: lineOf(sourceFile, node),
        text: compactText(node, sourceFile),
      });
    }

    if (typescript.isStringLiteralLike(node) && paneKindNames.has(node.text)) {
      let expression: typescript.Node | undefined = node.parent;
      while (
        expression &&
        !typescript.isBinaryExpression(expression) &&
        !typescript.isCallExpression(expression) &&
        !typescript.isConditionalExpression(expression) &&
        !typescript.isVariableStatement(expression)
      ) {
        expression = expression.parent;
      }
      if (
        expression &&
        !recordedSuspectStarts.has(expression.getStart()) &&
        (containsIdentifierField(expression) ||
          containsGenericIdentifierAccess(expression))
      ) {
        recordedSuspectStarts.add(expression.getStart());
        kindAgainstIdentifierSuspects.push({
          filePath: relative(repositoryRoot, sourcePath),
          line: lineOf(sourceFile, expression),
          text: compactText(expression, sourceFile),
        });
      }
    }
    typescript.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function printFindings(label: string, findings: readonly Finding[]): void {
  console.log(`${label}: ${findings.length}`);
  for (const finding of findings) {
    console.log(`${finding.filePath}:${finding.line}  ${finding.text}`);
  }
}

printFindings('pane id field uses', identifierFieldUses);
printFindings('kind against id suspects', kindAgainstIdentifierSuspects);
printFindings('unscoped pane marker suspects', unscopedMarkerSuspects);
