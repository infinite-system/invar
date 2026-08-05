#!/usr/bin/env bun

// This script lists static readonly fields in production modules. Run it from the repository root:
// bun .invar/tasks/in-progress/506-constructor-first-and-the-constants-role-table/506-terminal-static-readonly-census.ts
// Each row is one field that needs role review. The final counts separate the terminal protocol
// fields, the uppercase hot-path exception family, and comments that name a hot path. Equal hot-path
// and comment counts mean every exception carries its local reason.

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as typescript from 'typescript';

const projectRoot = resolve(import.meta.dir, '../../../..');
const sourceFiles = [
  ...new Bun.Glob('src/modules/**/*.ts').scanSync({ cwd: projectRoot }),
]
  .filter((fileName) => !fileName.endsWith('.test.ts'))
  .sort();
let fieldCount = 0;
let terminalFieldCount = 0;
let hotPathFieldCount = 0;
let hotPathCommentCount = 0;

for (const projectRelativeFileName of sourceFiles) {
  const fileName = resolve(projectRoot, projectRelativeFileName);
  const sourceFile = typescript.createSourceFile(
    fileName,
    readFileSync(fileName, 'utf8'),
    typescript.ScriptTarget.Latest,
    true,
  );
  function visit(node: typescript.Node): void {
    if (
      typescript.isPropertyDeclaration(node) &&
      typescript.canHaveModifiers(node)
    ) {
      const modifierKinds = new Set(
        typescript.getModifiers(node)?.map((modifier) => modifier.kind) ?? [],
      );
      if (
        modifierKinds.has(typescript.SyntaxKind.StaticKeyword) &&
        modifierKinds.has(typescript.SyntaxKind.ReadonlyKeyword)
      ) {
        const position = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        process.stdout.write(
          `${relative(projectRoot, fileName)}:${position.line + 1} ${node.name.getText(sourceFile)}\n`,
        );
        fieldCount++;
        if (projectRelativeFileName.startsWith('src/modules/terminal/')) {
          terminalFieldCount++;
        }
        if (/^[A-Z][A-Z0-9_]*$/.test(node.name.getText(sourceFile))) {
          hotPathFieldCount++;
          const leadingText = sourceFile.text.slice(
            node.getFullStart(),
            node.getStart(sourceFile),
          );
          if (/Hot [^\n]* path:/.test(leadingText)) hotPathCommentCount++;
        }
      }
    }
    typescript.forEachChild(node, visit);
  }
  visit(sourceFile);
}

process.stdout.write(
  `terminal static readonly fields: ${terminalFieldCount}\n`,
);
process.stdout.write(`hot-path static readonly fields: ${hotPathFieldCount}\n`);
process.stdout.write(`hot-path comments: ${hotPathCommentCount}\n`);
process.stdout.write(`all static readonly fields: ${fieldCount}\n`);
