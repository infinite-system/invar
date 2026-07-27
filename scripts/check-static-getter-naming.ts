#!/usr/bin/env bun

import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as typescript from 'typescript';

export interface StaticGetterNamingInput {
  fileName: string;
  sourceText: string;
}

export interface StaticGetterNamingViolation {
  fileName: string;
  line: number;
  column: number;
  message: string;
}

function hasModifier(
  node: typescript.Node,
  modifierKind: typescript.SyntaxKind,
): boolean {
  return (
    typescript.canHaveModifiers(node) &&
    (typescript
      .getModifiers(node)
      ?.some((modifier) => modifier.kind === modifierKind) ??
      false)
  );
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

function isPrimitiveLiteral(expression: typescript.Expression): boolean {
  return (
    typescript.isStringLiteral(expression) ||
    typescript.isNumericLiteral(expression) ||
    typescript.isBigIntLiteral(expression) ||
    typescript.isNoSubstitutionTemplateLiteral(expression) ||
    typescript.isRegularExpressionLiteral(expression) ||
    expression.kind === typescript.SyntaxKind.TrueKeyword ||
    expression.kind === typescript.SyntaxKind.FalseKeyword ||
    expression.kind === typescript.SyntaxKind.NullKeyword
  );
}

function isLiteralProperty(
  property: typescript.ObjectLiteralElementLike,
): boolean {
  if (typescript.isPropertyAssignment(property))
    return isLiteralComposition(property.initializer);
  if (typescript.isSpreadAssignment(property))
    return isLiteralComposition(property.expression);
  return false;
}

function isObjectFreezeCall(expression: typescript.Expression): boolean {
  if (!typescript.isCallExpression(expression)) return false;
  const [argument] = expression.arguments;
  if (argument === undefined || expression.arguments.length !== 1) return false;
  if (!typescript.isPropertyAccessExpression(expression.expression))
    return false;
  return (
    typescript.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'Object' &&
    expression.expression.name.text === 'freeze' &&
    isLiteralComposition(argument)
  );
}

function isLiteralComposition(expression: typescript.Expression): boolean {
  const unwrappedExpression = unwrapExpression(expression);
  if (isPrimitiveLiteral(unwrappedExpression)) return true;
  if (
    typescript.isPrefixUnaryExpression(unwrappedExpression) &&
    (unwrappedExpression.operator === typescript.SyntaxKind.PlusToken ||
      unwrappedExpression.operator === typescript.SyntaxKind.MinusToken)
  ) {
    return isLiteralComposition(unwrappedExpression.operand);
  }
  if (typescript.isArrayLiteralExpression(unwrappedExpression)) {
    return unwrappedExpression.elements.every((element) => {
      if (typescript.isSpreadElement(element))
        return isLiteralComposition(element.expression);
      return isLiteralComposition(element);
    });
  }
  if (typescript.isObjectLiteralExpression(unwrappedExpression))
    return unwrappedExpression.properties.every(isLiteralProperty);
  return isObjectFreezeCall(unwrappedExpression);
}

function getterName(getter: typescript.GetAccessorDeclaration): string | null {
  if (
    typescript.isIdentifier(getter.name) ||
    typescript.isStringLiteral(getter.name) ||
    typescript.isNumericLiteral(getter.name)
  ) {
    return getter.name.text;
  }
  return null;
}

function isScreamingSnakeCase(name: string): boolean {
  return /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(name);
}

function returnsOneLiteral(getter: typescript.GetAccessorDeclaration): boolean {
  if (getter.body === undefined || getter.body.statements.length !== 1)
    return false;
  const [statement] = getter.body.statements;
  return (
    statement !== undefined &&
    typescript.isReturnStatement(statement) &&
    statement.expression !== undefined &&
    isLiteralComposition(statement.expression)
  );
}

export function inspectStaticGetterNaming(
  input: StaticGetterNamingInput,
): StaticGetterNamingViolation[] {
  const sourceFile = typescript.createSourceFile(
    input.fileName,
    input.sourceText,
    typescript.ScriptTarget.Latest,
    true,
  );
  const violations: StaticGetterNamingViolation[] = [];

  function report(
    getter: typescript.GetAccessorDeclaration,
    message: string,
  ): void {
    const position = sourceFile.getLineAndCharacterOfPosition(
      getter.name.getStart(sourceFile),
    );
    violations.push({
      fileName: input.fileName.replaceAll('\\', '/'),
      line: position.line + 1,
      column: position.character + 1,
      message,
    });
  }

  function visit(node: typescript.Node): void {
    if (
      typescript.isGetAccessorDeclaration(node) &&
      hasModifier(node, typescript.SyntaxKind.StaticKeyword)
    ) {
      const name = getterName(node);
      if (name !== null) {
        const literalValued = returnsOneLiteral(node);
        const screamingName = isScreamingSnakeCase(name);
        if (name.startsWith('$')) {
          if (/^\$[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(name)) {
            report(
              node,
              `cached static getter '${name}' must not use SCREAMING_SNAKE_CASE`,
            );
          } else if (literalValued) {
            report(
              node,
              `literal-valued cached static getter '${name}' must drop '$' ` +
                'and use SCREAMING_SNAKE_CASE',
            );
          }
        } else if (literalValued && !screamingName) {
          report(
            node,
            `literal-valued static getter '${name}' must use SCREAMING_SNAKE_CASE`,
          );
        } else if (!literalValued && screamingName) {
          report(
            node,
            `derived static getter '${name}' must not use SCREAMING_SNAKE_CASE`,
          );
        }
      }
    }
    typescript.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(entryPath));
    else if (entryPath.endsWith('.ts')) files.push(entryPath);
  }
  return files;
}

if (import.meta.main) {
  const repositoryRoot = process.cwd();
  const inspectedFiles = ['src', 'scripts'].flatMap((directory) =>
    sourceFiles(resolve(repositoryRoot, directory)),
  );
  if (inspectedFiles.length === 0) {
    console.error('static-getter-naming: FAIL (inspected zero files)');
    process.exit(1);
  }
  const violations = inspectedFiles.flatMap((fileName) =>
    inspectStaticGetterNaming({
      fileName: relative(repositoryRoot, fileName),
      sourceText: readFileSync(fileName, 'utf8'),
    }),
  );
  for (const violation of violations) {
    console.error(
      `${violation.fileName}:${violation.line}:${violation.column} ` +
        violation.message,
    );
  }
  if (violations.length > 0) {
    console.error(
      `static-getter-naming: FAIL (${violations.length} violation(s))`,
    );
    process.exit(1);
  }
  console.log(
    `static-getter-naming: PASS (${inspectedFiles.length} file(s) inspected)`,
  );
}
