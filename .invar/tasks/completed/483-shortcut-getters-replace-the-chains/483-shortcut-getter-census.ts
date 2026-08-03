/**
 * Count old WorkspaceSet access chains and their shortcut replacements.
 * Run: bun .invar/tasks/in-progress/483-shortcut-getters-replace-the-chains/483-shortcut-getter-census.ts
 * The chain total combines parsed code sites with harness graph-path strings. A lower chain
 * total means more callers use the stable WorkspaceSet shortcuts. The file list shows every
 * remaining site, so a zero can be checked instead of trusted as an unexplained number.
 */

import * as ts from 'typescript';
import { relative } from 'node:path';

const repositoryRoot = process.cwd();
const sourceRoots = ['src/modules', 'scripts/harness'];
const shortcutNames = new Set([
  'activeEditor',
  'activeDocument',
  'activeLanguageProviderNotice',
]);

type CensusSite = {
  path: string;
  line: number;
  kind: string;
};

const chainSites: CensusSite[] = [];
const shortcutSites: CensusSite[] = [];
const graphPathSites: CensusSite[] = [];

runPositiveControl();

for (const sourceRoot of sourceRoots) {
  const sourceGlob = new Bun.Glob('**/*.ts');
  for await (const absolutePath of sourceGlob.scan({
    cwd: sourceRoot,
    absolute: true,
    onlyFiles: true,
  })) {
    const sourceText = await Bun.file(absolutePath).text();
    const sourceFile = ts.createSourceFile(
      absolutePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const sourceSites = collectSourceSites(sourceFile, absolutePath);
    chainSites.push(...sourceSites.chainSites);
    shortcutSites.push(...sourceSites.shortcutSites);
    graphPathSites.push(...sourceSites.graphPathSites);
  }
}

const codeChainSites = chainSites.length;
const chainSiteTotal = codeChainSites + graphPathSites.length;
const testChainSites = [...chainSites, ...graphPathSites].filter((site) =>
  site.path.endsWith('.test.ts'),
).length;
const nonTestChainSites = chainSiteTotal - testChainSites;

console.log(
  JSON.stringify(
    {
      chainSites: chainSiteTotal,
      codeChainSites,
      graphPathStrings: graphPathSites.length,
      nonTestChainSites,
      testChainSites,
      shortcutUsers: shortcutSites.length,
    },
    null,
    2,
  ),
);

for (const site of [...chainSites, ...graphPathSites].sort(compareSites)) {
  console.log(`${site.path}:${site.line}  ${site.kind}`);
}

function runPositiveControl(): void {
  const positiveControlPath = '/positive-control/scripts/harness/control.ts';
  const positiveControlSource = ts.createSourceFile(
    positiveControlPath,
    `
      context.workspaceSet.active.editor.document;
      context.workspaceSet.active.activeDocumentHandle?.document;
      context.workspaceSet.active.languageProviderNotice();
      context.workspaceSet.activeEditor;
      'workspaceSet.active.editor.viewport.scrollTop';
      'workspaceSet.activeDocument.path';
    `,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const positiveControlSites = collectSourceSites(
    positiveControlSource,
    positiveControlPath,
  );
  if (
    positiveControlSites.chainSites.length !== 3 ||
    positiveControlSites.graphPathSites.length !== 1 ||
    positiveControlSites.shortcutSites.length !== 2
  ) {
    throw new Error(
      'Shortcut census positive control failed. Fix the census before trusting its counts.',
    );
  }
}

function collectSourceSites(
  sourceFile: ts.SourceFile,
  absolutePath: string,
): {
  chainSites: CensusSite[];
  shortcutSites: CensusSite[];
  graphPathSites: CensusSite[];
} {
  const sourceChainSites: CensusSite[] = [];
  const sourceShortcutSites: CensusSite[] = [];
  const sourceGraphPathSites: CensusSite[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      if (
        node.name.text === 'editor' &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'active' &&
        expressionEndsAtWorkspaceSet(node.expression.expression)
      ) {
        sourceChainSites.push(siteFor(sourceFile, node, 'code chain'));
      }

      if (
        node.name.text === 'document' &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'activeDocumentHandle' &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        node.expression.expression.name.text === 'active' &&
        expressionEndsAtWorkspaceSet(node.expression.expression.expression)
      ) {
        sourceChainSites.push(siteFor(sourceFile, node, 'document code chain'));
      }

      if (
        shortcutNames.has(node.name.text) &&
        expressionEndsAtWorkspaceSet(node.expression)
      ) {
        sourceShortcutSites.push(siteFor(sourceFile, node, 'shortcut'));
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'languageProviderNotice' &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.name.text === 'active' &&
      expressionEndsAtWorkspaceSet(node.expression.expression.expression)
    ) {
      sourceChainSites.push(siteFor(sourceFile, node, 'notice code chain'));
    }

    if (
      ts.isStringLiteralLike(node) &&
      absolutePath.includes('/scripts/harness/')
    ) {
      for (const match of node.text.matchAll(/workspaceSet\.active\.editor/g)) {
        const matchOffset = match.index ?? 0;
        sourceGraphPathSites.push(
          siteFor(
            sourceFile,
            node,
            'graph path',
            node.getStart() + 1 + matchOffset,
          ),
        );
      }
      for (const match of node.text.matchAll(
        /workspaceSet\.active(?:Editor|Document|LanguageProviderNotice)/g,
      )) {
        const matchOffset = match.index ?? 0;
        sourceShortcutSites.push(
          siteFor(
            sourceFile,
            node,
            'shortcut graph path',
            node.getStart() + 1 + matchOffset,
          ),
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return {
    chainSites: sourceChainSites,
    shortcutSites: sourceShortcutSites,
    graphPathSites: sourceGraphPathSites,
  };
}

function expressionEndsAtWorkspaceSet(expression: ts.Expression): boolean {
  const unwrappedExpression = unwrapExpression(expression);
  return (
    (ts.isIdentifier(unwrappedExpression) &&
      unwrappedExpression.text === 'workspaceSet') ||
    (ts.isPropertyAccessExpression(unwrappedExpression) &&
      unwrappedExpression.name.text === 'workspaceSet')
  );
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let unwrappedExpression = expression;
  while (
    ts.isParenthesizedExpression(unwrappedExpression) ||
    ts.isNonNullExpression(unwrappedExpression) ||
    ts.isAsExpression(unwrappedExpression) ||
    ts.isTypeAssertionExpression(unwrappedExpression)
  ) {
    unwrappedExpression = unwrappedExpression.expression;
  }
  return unwrappedExpression;
}

function siteFor(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  kind: string,
  position = node.getStart(sourceFile),
): CensusSite {
  return {
    path: relative(repositoryRoot, sourceFile.fileName),
    line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
    kind,
  };
}

function compareSites(left: CensusSite, right: CensusSite): number {
  return left.path.localeCompare(right.path) || left.line - right.line;
}
