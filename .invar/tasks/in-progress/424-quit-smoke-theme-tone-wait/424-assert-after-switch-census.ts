#!/usr/bin/env bun

// Find switch-like actions and visual assertions in every scripts/harness/smoke-*.ts file.
// Run: bun .invar/tasks/in-progress/424-quit-smoke-theme-tone-wait/424-assert-after-switch-census.ts
// The first count is the complete smoke population. The second count is how many files contain
// review leads. The final count is every matching AST call site, not a defect count. Inspect each
// action, condition wait, and assertion together. A zero-file count means the census failed.

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as typescript from 'typescript';

const repositoryRoot = resolve(import.meta.dir, '../../../..');
const smokePaths = [
  ...new Bun.Glob('scripts/harness/smoke-*.ts').scanSync({
    cwd: repositoryRoot,
  }),
].sort();

if (smokePaths.length === 0) {
  throw new Error(
    'The switch census found zero harness smoke files. Run it from this checkout.',
  );
}

const switchActionName =
  /(?:(?:switch|toggle|cycle|open|close|resize|drive).*?(?:theme|preview|mode)|(?:theme|preview|mode).*?(?:switch|toggle|cycle|open|close|resize))/i;
const visualVocabulary = /(?:theme|preview|mode|tone|background|colour|color)/i;
const assertionCallNames = new Set([
  'requireCondition',
  'requireCodeFenceAppearance',
  'requireUniformHeadingColor',
]);
const conditionWaitCallNames = new Set(['awaitGridCondition', 'awaitSnapshot']);

interface Candidate {
  filePath: string;
  lineNumber: number;
  kind: 'assertion' | 'condition-wait' | 'switch-action';
  text: string;
}

function calleeName(expression: typescript.Expression): string | null {
  if (typescript.isIdentifier(expression)) return expression.text;
  if (typescript.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return null;
}

function stringValues(node: typescript.Node): string[] {
  const values: string[] = [];
  const visitNode = (candidate: typescript.Node): void => {
    if (
      typescript.isStringLiteralLike(candidate) ||
      typescript.isNoSubstitutionTemplateLiteral(candidate)
    ) {
      values.push(candidate.text);
    }
    typescript.forEachChild(candidate, visitNode);
  };
  visitNode(node);
  return values;
}

const candidates: Candidate[] = [];
const filesWithCandidates = new Set<string>();

for (const smokePath of smokePaths) {
  const absolutePath = resolve(repositoryRoot, smokePath);
  const sourceFile = typescript.createSourceFile(
    smokePath,
    readFileSync(absolutePath, 'utf8'),
    typescript.ScriptTarget.Latest,
    true,
  );
  const visitNode = (node: typescript.Node): void => {
    if (typescript.isCallExpression(node)) {
      const name = calleeName(node.expression);
      const strings = node.arguments.flatMap((argument) =>
        stringValues(argument),
      );
      const joinedStrings = `${strings.join(' ')} ${node.arguments
        .map((argument) => argument.getText(sourceFile))
        .join(' ')}`;
      const lineNumber =
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1;
      let kind: Candidate['kind'] | null = null;
      if (
        name !== null &&
        assertionCallNames.has(name) &&
        visualVocabulary.test(joinedStrings)
      ) {
        kind = 'assertion';
      } else if (
        name !== null &&
        conditionWaitCallNames.has(name) &&
        visualVocabulary.test(joinedStrings)
      ) {
        kind = 'condition-wait';
      } else if (name !== null && switchActionName.test(name)) {
        kind = 'switch-action';
      }
      if (kind !== null) {
        filesWithCandidates.add(smokePath);
        candidates.push({
          filePath: smokePath,
          lineNumber,
          kind,
          text: node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 220),
        });
      }
    }
    typescript.forEachChild(node, visitNode);
  };
  visitNode(sourceFile);
}

console.log(
  `census: ${smokePaths.length} smoke files scanned; ${filesWithCandidates.size} contain switch or visual candidates`,
);
for (const candidate of candidates) {
  console.log(
    `${candidate.kind} ${relative(repositoryRoot, resolve(repositoryRoot, candidate.filePath))}:${candidate.lineNumber} ${candidate.text}`,
  );
}
console.log(
  `candidates: ${candidates.length} AST call sites require semantic review`,
);
