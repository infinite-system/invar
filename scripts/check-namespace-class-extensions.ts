#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as typescript from 'typescript';

export interface NamespaceClassExtensionInput {
  fileName: string;
  sourceText: string;
}

export interface NamespaceClassExtensionViolation {
  fileName: string;
  line: number;
  column: number;
  className: string;
}

function unwrapExpression(
  expression: typescript.Expression,
): typescript.Expression {
  let currentExpression = expression;
  while (
    typescript.isParenthesizedExpression(currentExpression) ||
    typescript.isAsExpression(currentExpression) ||
    typescript.isTypeAssertionExpression(currentExpression) ||
    typescript.isSatisfiesExpression(currentExpression) ||
    typescript.isNonNullExpression(currentExpression)
  ) {
    currentExpression = currentExpression.expression;
  }
  return currentExpression;
}

function isSelectedNamespaceClass(expression: typescript.Expression): boolean {
  const unwrappedExpression = unwrapExpression(expression);
  if (typescript.isPropertyAccessExpression(unwrappedExpression)) {
    return unwrappedExpression.name.text === 'Class';
  }
  if (!typescript.isElementAccessExpression(unwrappedExpression)) {
    return false;
  }
  const argumentExpression = unwrappedExpression.argumentExpression;
  return (
    argumentExpression !== undefined &&
    (typescript.isStringLiteral(argumentExpression) ||
      typescript.isNoSubstitutionTemplateLiteral(argumentExpression)) &&
    argumentExpression.text === 'Class'
  );
}

// invariant: Subclasses extend raw namespace classes (project.invariants.md)
export function inspectNamespaceClassExtensions(
  input: NamespaceClassExtensionInput,
): NamespaceClassExtensionViolation[] {
  const sourceFile = typescript.createSourceFile(
    input.fileName,
    input.sourceText,
    typescript.ScriptTarget.Latest,
    true,
  );
  const violations: NamespaceClassExtensionViolation[] = [];

  function visit(node: typescript.Node): void {
    if (
      (typescript.isClassDeclaration(node) ||
        typescript.isClassExpression(node)) &&
      node.heritageClauses !== undefined
    ) {
      for (const heritageClause of node.heritageClauses) {
        if (heritageClause.token !== typescript.SyntaxKind.ExtendsKeyword) {
          continue;
        }
        for (const extendedType of heritageClause.types) {
          if (!isSelectedNamespaceClass(extendedType.expression)) continue;
          const position = sourceFile.getLineAndCharacterOfPosition(
            extendedType.expression.getStart(sourceFile),
          );
          violations.push({
            fileName: input.fileName.replaceAll('\\', '/'),
            line: position.line + 1,
            column: position.character + 1,
            className: node.name?.text ?? '<anonymous>',
          });
        }
      }
    }
    typescript.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

const sourceFileExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
]);

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(entryPath));
      continue;
    }
    if (
      [...sourceFileExtensions].some((extension) =>
        entryPath.endsWith(extension),
      )
    ) {
      files.push(entryPath);
    }
  }
  return files;
}

if (import.meta.main) {
  const repositoryRoot = process.cwd();
  const inspectedFiles = ['src', 'scripts'].flatMap((directory) =>
    sourceFiles(resolve(repositoryRoot, directory)),
  );
  if (inspectedFiles.length === 0) {
    console.error('namespace-class-extensions: FAIL (inspected zero files)');
    process.exit(1);
  }

  const violations = inspectedFiles.flatMap((fileName) =>
    inspectNamespaceClassExtensions({
      fileName: relative(repositoryRoot, fileName),
      sourceText: readFileSync(fileName, 'utf8'),
    }),
  );
  for (const violation of violations) {
    console.error(
      `${violation.fileName}:${violation.line}:${violation.column} ` +
        `class ${violation.className} extends a namespace Class entry; ` +
        'extend the raw $Class entry instead',
    );
  }
  if (violations.length > 0) {
    console.error(
      `namespace-class-extensions: FAIL ` +
        `(${violations.length} violation(s))`,
    );
    process.exit(1);
  }
  console.log(
    `namespace-class-extensions: PASS ` +
      `(${inspectedFiles.length} file(s) inspected)`,
  );
}
