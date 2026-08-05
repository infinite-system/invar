#!/usr/bin/env bun

// This script finds mutable plain scalar fields with no direct assignment after declaration. Run it:
// bun .invar/tasks/in-progress/506-constructor-first-and-the-constants-role-table/506-plain-scalar-field-census.ts
// "unary writes" exposes counters changed with ++ or --, which a direct-assignment census misses.
// "reads" separates used constants from dead fields. Each row is one item for the task triage table.

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as typescript from 'typescript';

const projectRoot = resolve(import.meta.dir, '../../../..');
const projectRelativeFileNames = [
  ...new Bun.Glob('src/modules/**/*.ts').scanSync({ cwd: projectRoot }),
]
  .filter((fileName) => !fileName.endsWith('.test.ts'))
  .sort();
const fileNames = projectRelativeFileNames.map((fileName) =>
  resolve(projectRoot, fileName),
);
const program = typescript.createProgram({
  rootNames: fileNames,
  options: {
    strict: true,
    target: typescript.ScriptTarget.ESNext,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  },
});
const typeChecker = program.getTypeChecker();

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

function isScalarType(type: typescript.Type): boolean {
  if (type.isUnion()) return type.types.every((member) => isScalarType(member));
  const scalarFlags =
    typescript.TypeFlags.StringLike |
    typescript.TypeFlags.NumberLike |
    typescript.TypeFlags.BooleanLike |
    typescript.TypeFlags.BigIntLike |
    typescript.TypeFlags.Null |
    typescript.TypeFlags.Undefined;
  return (type.flags & scalarFlags) !== 0;
}

function isAssignmentOperator(kind: typescript.SyntaxKind): boolean {
  return (
    kind >= typescript.SyntaxKind.FirstAssignment &&
    kind <= typescript.SyntaxKind.LastAssignment
  );
}

interface FieldUseCounts {
  directWrites: number;
  unaryWrites: number;
  unaryWriteLines: number[];
  reads: number;
}

function reactiveClassNames(
  sourceFile: typescript.SourceFile,
): ReadonlySet<string> {
  const classNames = new Set<string>();
  function visit(node: typescript.Node): void {
    if (
      typescript.isCallExpression(node) &&
      typescript.isIdentifier(node.expression) &&
      node.expression.text === 'Reactive'
    ) {
      const argument = node.arguments[0];
      if (argument && typescript.isIdentifier(argument)) {
        const declaration =
          typeChecker.getSymbolAtLocation(argument)?.valueDeclaration;
        const initializer =
          declaration && typescript.isVariableDeclaration(declaration)
            ? declaration.initializer
            : undefined;
        if (initializer && typescript.isIdentifier(initializer)) {
          classNames.add(initializer.text);
        } else if (
          initializer &&
          typescript.isCallExpression(initializer) &&
          initializer.arguments[0] &&
          typescript.isIdentifier(initializer.arguments[0])
        ) {
          classNames.add(initializer.arguments[0].text);
        }
      }
    }
    typescript.forEachChild(node, visit);
  }
  visit(sourceFile);
  return classNames;
}

function fieldUseCounts(
  sourceFile: typescript.SourceFile,
  classDeclaration: typescript.ClassDeclaration,
  fieldName: string,
): FieldUseCounts {
  const counts: FieldUseCounts = {
    directWrites: 0,
    unaryWrites: 0,
    unaryWriteLines: [],
    reads: 0,
  };
  function visit(node: typescript.Node): void {
    if (
      typescript.isPropertyAccessExpression(node) &&
      node.expression.kind === typescript.SyntaxKind.ThisKeyword &&
      node.name.text === fieldName
    ) {
      const parent = node.parent;
      if (
        typescript.isBinaryExpression(parent) &&
        parent.left === node &&
        isAssignmentOperator(parent.operatorToken.kind)
      ) {
        counts.directWrites++;
      } else if (
        (typescript.isPrefixUnaryExpression(parent) ||
          typescript.isPostfixUnaryExpression(parent)) &&
        parent.operand === node &&
        (parent.operator === typescript.SyntaxKind.PlusPlusToken ||
          parent.operator === typescript.SyntaxKind.MinusMinusToken)
      ) {
        counts.unaryWrites++;
        counts.unaryWriteLines.push(
          sourceFile.getLineAndCharacterOfPosition(parent.getStart(sourceFile))
            .line + 1,
        );
      } else {
        counts.reads++;
      }
    }
    typescript.forEachChild(node, visit);
  }
  typescript.forEachChild(classDeclaration, visit);
  return counts;
}

let candidateCount = 0;
let reactiveCandidateCount = 0;
for (const sourceFile of program.getSourceFiles()) {
  if (!fileNames.includes(sourceFile.fileName)) continue;
  const sourceReactiveClassNames = reactiveClassNames(sourceFile);
  function visit(node: typescript.Node): void {
    if (typescript.isClassDeclaration(node)) {
      for (const member of node.members) {
        if (
          !typescript.isPropertyDeclaration(member) ||
          !typescript.isIdentifier(member.name) ||
          member.initializer === undefined ||
          hasModifier(member, typescript.SyntaxKind.StaticKeyword) ||
          hasModifier(member, typescript.SyntaxKind.ReadonlyKeyword) ||
          hasModifier(member, typescript.SyntaxKind.DeclareKeyword) ||
          !isScalarType(typeChecker.getTypeAtLocation(member))
        ) {
          continue;
        }
        const counts = fieldUseCounts(sourceFile, node, member.name.text);
        if (counts.directWrites > 0) continue;
        const position = sourceFile.getLineAndCharacterOfPosition(
          member.getStart(sourceFile),
        );
        process.stdout.write(
          `${relative(projectRoot, sourceFile.fileName)}:${position.line + 1} ` +
            `${member.name.text} unary writes=${counts.unaryWrites} reads=${counts.reads} ` +
            `reactive=${sourceReactiveClassNames.has(node.name?.text ?? '')} ` +
            `unary lines=${counts.unaryWriteLines.join(',')}\n`,
        );
        candidateCount++;
        if (sourceReactiveClassNames.has(node.name?.text ?? '')) {
          reactiveCandidateCount++;
        }
      }
    }
    typescript.forEachChild(node, visit);
  }
  visit(sourceFile);
}

process.stdout.write(
  `plain scalar fields without direct assignments: ${candidateCount}\n`,
);
process.stdout.write(
  `reactive plain scalar fields without direct assignments: ${reactiveCandidateCount}\n`,
);
