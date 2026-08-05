#!/usr/bin/env bun

// This script orders each production class as static members, constructor, then instance members.
// Run a dry census from the repository root with:
// bun .invar/tasks/in-progress/506-constructor-first-and-the-constants-role-table/506-move-constructors-first.ts
// Add --write to apply the mechanical sweep. Optional path prefixes limit a module batch, for example
// --write src/modules/terminal src/modules/ui. Each line names one moved constructor. The final count
// is the number of files that changed, so zero after the sweep means the grammar is satisfied.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as typescript from 'typescript';

const projectRoot = resolve(import.meta.dir, '../../../..');
const shouldWrite = process.argv.includes('--write');
const requestedPathPrefixes = process.argv
  .slice(2)
  .filter((argument) => argument !== '--write')
  .map((argument) => argument.replace(/^\.\//, '').replace(/\/$/, ''));
const sourceRoots = [
  resolve(projectRoot, 'src/modules'),
  resolve(projectRoot, 'tools/invariant-field-v2/ui'),
];
const sourceFiles = [
  resolve(projectRoot, 'tools/invariant-field-v2/DesignTokens.ts'),
  resolve(
    projectRoot,
    'tools/invariant-field-v2/VueSingleFileComponentPlugin.ts',
  ),
];

function collectTypeScriptFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const fileNames: string[] = [];
  for (const directoryEntry of readdirSync(directory, {
    withFileTypes: true,
  })) {
    const entryPath = resolve(directory, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      fileNames.push(...collectTypeScriptFiles(entryPath));
    } else if (
      directoryEntry.isFile() &&
      directoryEntry.name.endsWith('.ts') &&
      !directoryEntry.name.endsWith('.test.ts') &&
      !directoryEntry.name.endsWith('.d.ts')
    ) {
      fileNames.push(entryPath);
    }
  }
  return fileNames;
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

function lineStart(sourceText: string, position: number): number {
  const precedingNewline = sourceText.lastIndexOf('\n', position - 1);
  return precedingNewline < 0 ? 0 : precedingNewline + 1;
}

function lineEnd(sourceText: string, position: number): number {
  const followingNewline = sourceText.indexOf('\n', position);
  return followingNewline < 0 ? sourceText.length : followingNewline + 1;
}

function memberMoveStart(
  sourceFile: typescript.SourceFile,
  member: typescript.ClassElement,
): number {
  const memberStart = member.getStart(sourceFile);
  const commentRanges =
    typescript.getLeadingCommentRanges(
      sourceFile.text,
      member.getFullStart(),
    ) ?? [];
  let attachedStart = memberStart;
  let followingStart = memberStart;
  for (
    let commentIndex = commentRanges.length - 1;
    commentIndex >= 0;
    commentIndex--
  ) {
    const commentRange = commentRanges[commentIndex]!;
    const separator = sourceFile.text.slice(commentRange.end, followingStart);
    if ((separator.match(/\n/g) ?? []).length > 1) break;
    attachedStart = commentRange.pos;
    followingStart = commentRange.pos;
  }
  return lineStart(sourceFile.text, attachedStart);
}

function moveMember(
  sourceText: string,
  sourceFile: typescript.SourceFile,
  member: typescript.ClassElement,
  insertionPosition: number,
  insertAfterLine: boolean,
): string {
  const moveStart = memberMoveStart(sourceFile, member);
  const moveEnd = lineEnd(sourceText, member.end);
  const movedText = sourceText.slice(moveStart, moveEnd).trimEnd();

  return (
    sourceText.slice(0, insertionPosition) +
    `${insertAfterLine ? '' : '\n'}${movedText}\n` +
    sourceText.slice(insertionPosition, moveStart) +
    sourceText.slice(moveEnd)
  );
}

function orderClassMembers(
  sourceText: string,
  fileName: string,
  className: string | undefined,
): string {
  let updatedSourceText = sourceText;
  while (true) {
    const sourceFile = typescript.createSourceFile(
      fileName,
      updatedSourceText,
      typescript.ScriptTarget.Latest,
      true,
    );
    let classDeclaration: typescript.ClassDeclaration | undefined;
    function findClass(node: typescript.Node): void {
      if (
        classDeclaration === undefined &&
        typescript.isClassDeclaration(node) &&
        node.name?.text === className
      ) {
        classDeclaration = node;
        return;
      }
      typescript.forEachChild(node, findClass);
    }
    findClass(sourceFile);
    if (classDeclaration === undefined) return updatedSourceText;

    let leadingStaticMemberCount = 0;
    while (
      leadingStaticMemberCount < classDeclaration.members.length &&
      hasModifier(
        classDeclaration.members[leadingStaticMemberCount]!,
        typescript.SyntaxKind.StaticKeyword,
      )
    ) {
      leadingStaticMemberCount++;
    }
    const lateStaticMember = classDeclaration.members
      .slice(leadingStaticMemberCount)
      .find((member) =>
        hasModifier(member, typescript.SyntaxKind.StaticKeyword),
      );
    if (lateStaticMember !== undefined) {
      const insertionPosition =
        leadingStaticMemberCount === 0
          ? classDeclaration.members.pos
          : lineEnd(
              updatedSourceText,
              classDeclaration.members[leadingStaticMemberCount - 1]!.end,
            );
      updatedSourceText = moveMember(
        updatedSourceText,
        sourceFile,
        lateStaticMember,
        insertionPosition,
        leadingStaticMemberCount > 0,
      );
      continue;
    }

    const constructorIndex = classDeclaration.members.findIndex((member) =>
      typescript.isConstructorDeclaration(member),
    );
    if (constructorIndex < 0 || constructorIndex === leadingStaticMemberCount) {
      return updatedSourceText;
    }
    const insertionPosition =
      leadingStaticMemberCount === 0
        ? classDeclaration.members.pos
        : lineEnd(
            updatedSourceText,
            classDeclaration.members[leadingStaticMemberCount - 1]!.end,
          );
    updatedSourceText = moveMember(
      updatedSourceText,
      sourceFile,
      classDeclaration.members[constructorIndex]!,
      insertionPosition,
      leadingStaticMemberCount > 0,
    );
  }
}

const fileNames = [
  ...sourceRoots.flatMap((sourceRoot) => collectTypeScriptFiles(sourceRoot)),
  ...sourceFiles,
]
  .filter((fileName) => {
    if (requestedPathPrefixes.length === 0) return true;
    const projectRelativeFileName = relative(projectRoot, fileName);
    return requestedPathPrefixes.some(
      (pathPrefix) =>
        projectRelativeFileName === pathPrefix ||
        projectRelativeFileName.startsWith(`${pathPrefix}/`),
    );
  })
  .sort();
let changedFileCount = 0;

for (const fileName of fileNames) {
  const sourceText = readFileSync(fileName, 'utf8');
  const sourceFile = typescript.createSourceFile(
    fileName,
    sourceText,
    typescript.ScriptTarget.Latest,
    true,
  );
  const classDeclarations: typescript.ClassDeclaration[] = [];
  function visit(node: typescript.Node): void {
    if (typescript.isClassDeclaration(node)) classDeclarations.push(node);
    typescript.forEachChild(node, visit);
  }
  visit(sourceFile);

  let updatedSourceText = sourceText;
  for (const classDeclaration of classDeclarations) {
    updatedSourceText = orderClassMembers(
      updatedSourceText,
      fileName,
      classDeclaration.name?.text,
    );
  }
  if (updatedSourceText === sourceText) continue;

  changedFileCount++;
  process.stdout.write(`${relative(projectRoot, fileName)}\n`);
  if (shouldWrite) writeFileSync(fileName, updatedSourceText);
}

process.stdout.write(
  `${shouldWrite ? 'changed' : 'would change'} ${changedFileCount} file(s)\n`,
);
