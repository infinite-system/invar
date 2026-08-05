#!/usr/bin/env bun

// This script counts constructor positions in the production TypeScript classes guarded by
// check-file-grammar. Run it from the repository root with:
// bun .invar/tasks/in-progress/506-constructor-first-and-the-constants-role-table/506-constructor-order-census.ts
// The first count is every class with a constructor. The next two counts distinguish constructors
// below any member from constructors below an instance member. The listed files explain any gap.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import * as typescript from 'typescript';

const projectRoot = resolve(import.meta.dir, '../../../..');
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
const convertedModules = new Set([
  'agent',
  'app',
  'commands',
  'diff',
  'editor',
  'git',
  'image',
  'invariant-field-v2',
  'kernel',
  'keybindings',
  'layout',
  'lsp',
  'markdown',
  'narration',
  'navigation',
  'search',
  'settings',
  'storage',
  'system',
  'syntax',
  'tasks-dashboard',
  'terminal',
  'theme',
  'ui',
  'workspace',
]);

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

const fileNames = [
  ...sourceRoots.flatMap((sourceRoot) => collectTypeScriptFiles(sourceRoot)),
  ...sourceFiles,
].sort();
let constructorCount = 0;
let belowAnyMemberCount = 0;
let belowInstanceMemberCount = 0;
let belowRuntimeInstanceMemberCount = 0;
const staticOnlyPredecessors: string[] = [];
const instancePredecessors: string[] = [];
const predecessorKindCounts = new Map<string, number>();
let eponymousConstructorCount = 0;
let eponymousBelowAnyMemberCount = 0;
let eponymousBelowInstanceMemberCount = 0;
let convertedEponymousConstructorCount = 0;
let convertedEponymousBelowAnyMemberCount = 0;
let convertedEponymousBelowInstanceMemberCount = 0;
let convertedConstructorCount = 0;
let convertedBelowAnyMemberCount = 0;
let convertedBelowInstanceMemberCount = 0;
let staticMembersAfterConstructorCount = 0;

for (const fileName of fileNames) {
  const sourceFile = typescript.createSourceFile(
    fileName,
    readFileSync(fileName, 'utf8'),
    typescript.ScriptTarget.Latest,
    true,
  );

  function visit(node: typescript.Node): void {
    if (typescript.isClassDeclaration(node)) {
      const constructorIndex = node.members.findIndex((member) =>
        typescript.isConstructorDeclaration(member),
      );
      if (constructorIndex >= 0) {
        constructorCount++;
        staticMembersAfterConstructorCount += node.members
          .slice(constructorIndex + 1)
          .filter((member) =>
            typescript
              .getModifiers(member)
              ?.some(
                (modifier) =>
                  modifier.kind === typescript.SyntaxKind.StaticKeyword,
              ),
          ).length;
        if (constructorIndex > 0) belowAnyMemberCount++;
        const hasInstancePredecessor = node.members
          .slice(0, constructorIndex)
          .some(
            (member) =>
              !typescript
                .getModifiers(member)
                ?.some(
                  (modifier) =>
                    modifier.kind === typescript.SyntaxKind.StaticKeyword,
                ),
          );
        const hasRuntimeInstancePredecessor = node.members
          .slice(0, constructorIndex)
          .some((member) => {
            const modifiers = typescript.getModifiers(member);
            const isStatic = modifiers?.some(
              (modifier) =>
                modifier.kind === typescript.SyntaxKind.StaticKeyword,
            );
            const isDeclared = modifiers?.some(
              (modifier) =>
                modifier.kind === typescript.SyntaxKind.DeclareKeyword,
            );
            return !isStatic && !isDeclared;
          });
        if (hasRuntimeInstancePredecessor) belowRuntimeInstanceMemberCount++;
        if (hasInstancePredecessor) {
          belowInstanceMemberCount++;
          const position = sourceFile.getLineAndCharacterOfPosition(
            node.members[constructorIndex]!.getStart(sourceFile),
          );
          instancePredecessors.push(
            `${relative(projectRoot, fileName)}:${position.line + 1}`,
          );
          for (const member of node.members.slice(0, constructorIndex)) {
            const modifiers = typescript.getModifiers(member);
            if (
              modifiers?.some(
                (modifier) =>
                  modifier.kind === typescript.SyntaxKind.StaticKeyword,
              )
            ) {
              continue;
            }
            const kindName =
              typescript.SyntaxKind[member.kind] ?? String(member.kind);
            predecessorKindCounts.set(
              kindName,
              (predecessorKindCounts.get(kindName) ?? 0) + 1,
            );
          }
        } else if (constructorIndex > 0) {
          const position = sourceFile.getLineAndCharacterOfPosition(
            node.members[constructorIndex]!.getStart(sourceFile),
          );
          staticOnlyPredecessors.push(
            `${relative(projectRoot, fileName)}:${position.line + 1}`,
          );
        }

        const projectRelativeFileName = relative(projectRoot, fileName);
        const pathParts = projectRelativeFileName.split('/');
        const moduleName =
          pathParts[0] === 'src' && pathParts[1] === 'modules'
            ? pathParts[2]
            : 'invariant-field-v2';
        const expectedClassName = `$${basename(fileName, '.ts')}`;
        if (node.name?.text === expectedClassName) {
          eponymousConstructorCount++;
          if (constructorIndex > 0) eponymousBelowAnyMemberCount++;
          if (hasInstancePredecessor) eponymousBelowInstanceMemberCount++;
        }
        if (convertedModules.has(moduleName ?? '')) {
          convertedConstructorCount++;
          if (constructorIndex > 0) convertedBelowAnyMemberCount++;
          if (hasInstancePredecessor) convertedBelowInstanceMemberCount++;
        }
        if (
          convertedModules.has(moduleName ?? '') &&
          node.name?.text === expectedClassName
        ) {
          convertedEponymousConstructorCount++;
          if (constructorIndex > 0) convertedEponymousBelowAnyMemberCount++;
          if (hasInstancePredecessor) {
            convertedEponymousBelowInstanceMemberCount++;
          }
        }
      }
    }
    typescript.forEachChild(node, visit);
  }

  visit(sourceFile);
}

process.stdout.write(`classes with constructors: ${constructorCount}\n`);
process.stdout.write(
  `static members after constructors: ${staticMembersAfterConstructorCount}\n`,
);
process.stdout.write(`constructors below any member: ${belowAnyMemberCount}\n`);
process.stdout.write(
  `constructors below an instance member: ${belowInstanceMemberCount}\n`,
);
process.stdout.write(
  `constructors below a runtime instance member: ${belowRuntimeInstanceMemberCount}\n`,
);
process.stdout.write(
  `constructors preceded only by statics: ${staticOnlyPredecessors.length}\n`,
);
process.stdout.write(
  `eponymous classes with constructors: ${eponymousConstructorCount}\n`,
);
process.stdout.write(
  `eponymous constructors below any member: ${eponymousBelowAnyMemberCount}\n`,
);
process.stdout.write(
  `eponymous constructors below an instance member: ${eponymousBelowInstanceMemberCount}\n`,
);
process.stdout.write(
  `converted eponymous classes with constructors: ${convertedEponymousConstructorCount}\n`,
);
process.stdout.write(
  `converted eponymous constructors below any member: ${convertedEponymousBelowAnyMemberCount}\n`,
);
process.stdout.write(
  `converted eponymous constructors below an instance member: ${convertedEponymousBelowInstanceMemberCount}\n`,
);
process.stdout.write(
  `converted classes with constructors: ${convertedConstructorCount}\n`,
);
process.stdout.write(
  `converted constructors below any member: ${convertedBelowAnyMemberCount}\n`,
);
process.stdout.write(
  `converted constructors below an instance member: ${convertedBelowInstanceMemberCount}\n`,
);
for (const location of staticOnlyPredecessors)
  process.stdout.write(`${location}\n`);
process.stdout.write('instance predecessor member kinds:\n');
for (const [kindName, count] of [...predecessorKindCounts].sort()) {
  process.stdout.write(`${kindName}: ${count}\n`);
}
process.stdout.write('constructors below instance members:\n');
for (const location of instancePredecessors)
  process.stdout.write(`${location}\n`);
