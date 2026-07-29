// This script finds strict false checks and not-true checks on plugin-owned status keys in live smokes.
// Run `bun .invar/tasks/in-progress/265-status-projection-drops-plugin-keys/265-plugin-status-boolean-census.ts`.
// Each result names one smoke predicate. The summary counts both forms. A changed count means a smoke
// added, removed, or changed a plugin-status assertion. The positive control must find both forms first.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';

type ComparisonKind = 'equals-false' | 'not-equals-true';

type ComparisonFinding = {
  comparisonKind: ComparisonKind;
  filePath: string;
  lineNumber: number;
  statusKey: string;
  expressionText: string;
};

const repositoryRoot = join(import.meta.dir, '../../../..');
const moduleRoot = join(repositoryRoot, 'src/modules');
const smokeRoot = join(repositoryRoot, 'scripts/harness');

function collectTypeScriptFiles(
  directoryPath: string,
  includeFile: (filePath: string) => boolean,
  collectedFiles: string[] = [],
): string[] {
  for (const directoryEntry of readdirSync(directoryPath)) {
    const entryPath = join(directoryPath, directoryEntry);
    if (statSync(entryPath).isDirectory()) {
      collectTypeScriptFiles(entryPath, includeFile, collectedFiles);
    } else if (includeFile(entryPath)) {
      collectedFiles.push(entryPath);
    }
  }
  return collectedFiles;
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return null;
}

function objectLiteralKeys(
  objectLiteral: ts.ObjectLiteralExpression,
): string[] {
  return objectLiteral.properties.flatMap((property) => {
    if (
      ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property) ||
      ts.isMethodDeclaration(property) ||
      ts.isGetAccessorDeclaration(property)
    ) {
      const propertyName = propertyNameText(property.name);
      return propertyName === null ? [] : [propertyName];
    }
    return [];
  });
}

function classImplementsApplicationContributor(
  classDeclaration: ts.ClassDeclaration,
): boolean {
  return (
    classDeclaration.heritageClauses?.some((heritageClause) =>
      heritageClause.types.some(
        (heritageType) =>
          heritageType.expression.getText() === 'ApplicationContributor',
      ),
    ) ?? false
  );
}

function snapshotProperty(
  objectLiteral: ts.ObjectLiteralExpression,
): ts.PropertyAssignment | null {
  return (
    objectLiteral.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) &&
        propertyNameText(property.name) === 'snapshot',
    ) ?? null
  );
}

function collectReturnedObjectKeys(
  node: ts.Node,
  statusKeys: Set<string>,
): void {
  const visit = (childNode: ts.Node): void => {
    if (
      ts.isReturnStatement(childNode) &&
      childNode.expression &&
      ts.isObjectLiteralExpression(childNode.expression)
    ) {
      for (const statusKey of objectLiteralKeys(childNode.expression)) {
        statusKeys.add(statusKey);
      }
    }
    ts.forEachChild(childNode, visit);
  };
  visit(node);
}

function isStatusProjectionRegistration(
  node: ts.Node,
): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'register' &&
    ts.isPropertyAccessExpression(node.expression.expression) &&
    node.expression.expression.name.text === 'statusProjectionContributions'
  );
}

function pluginStatusKeysFromSource(
  filePath: string,
  sourceText: string,
): Set<string> {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const statusKeys = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isClassDeclaration(statement) ||
      !classImplementsApplicationContributor(statement)
    ) {
      continue;
    }
    const visit = (node: ts.Node): void => {
      if (isStatusProjectionRegistration(node)) {
        const registration = node.arguments[0];
        if (registration && ts.isObjectLiteralExpression(registration)) {
          const snapshot = snapshotProperty(registration)?.initializer;
          if (snapshot && ts.isArrowFunction(snapshot)) {
            if (ts.isParenthesizedExpression(snapshot.body)) {
              if (ts.isObjectLiteralExpression(snapshot.body.expression)) {
                for (const statusKey of objectLiteralKeys(
                  snapshot.body.expression,
                )) {
                  statusKeys.add(statusKey);
                }
              }
            } else if (ts.isObjectLiteralExpression(snapshot.body)) {
              for (const statusKey of objectLiteralKeys(snapshot.body)) {
                statusKeys.add(statusKey);
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(statement);
    for (const member of statement.members) {
      if (
        ts.isMethodDeclaration(member) &&
        ts.isIdentifier(member.name) &&
        member.name.text === 'statusSnapshot' &&
        member.body
      ) {
        collectReturnedObjectKeys(member.body, statusKeys);
      }
    }
  }
  return statusKeys;
}

function pluginStatusProjectionRegistrationCountFromSource(
  filePath: string,
  sourceText: string,
): number {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  let registrationCount = 0;
  for (const statement of sourceFile.statements) {
    if (
      !ts.isClassDeclaration(statement) ||
      !classImplementsApplicationContributor(statement)
    ) {
      continue;
    }
    const visit = (node: ts.Node): void => {
      if (isStatusProjectionRegistration(node)) registrationCount++;
      ts.forEachChild(node, visit);
    };
    visit(statement);
  }
  return registrationCount;
}

function independentPluginStatusProjectionRegistrationCount(
  sourceText: string,
): number {
  if (!/\bimplements[\s\S]*?\bApplicationContributor\b/.test(sourceText)) {
    return 0;
  }
  return (
    sourceText.match(/\bstatusProjectionContributions\s*[.]\s*register\s*[(]/g)
      ?.length ?? 0
  );
}

function booleanComparison(binaryExpression: ts.BinaryExpression): {
  comparisonKind: ComparisonKind;
  propertyAccess: ts.PropertyAccessExpression;
} | null {
  const operatorKind = binaryExpression.operatorToken.kind;
  const isEqualsFalse =
    operatorKind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    ((binaryExpression.right.kind === ts.SyntaxKind.FalseKeyword &&
      ts.isPropertyAccessExpression(binaryExpression.left)) ||
      (binaryExpression.left.kind === ts.SyntaxKind.FalseKeyword &&
        ts.isPropertyAccessExpression(binaryExpression.right)));
  const isNotEqualsTrue =
    operatorKind === ts.SyntaxKind.ExclamationEqualsEqualsToken &&
    ((binaryExpression.right.kind === ts.SyntaxKind.TrueKeyword &&
      ts.isPropertyAccessExpression(binaryExpression.left)) ||
      (binaryExpression.left.kind === ts.SyntaxKind.TrueKeyword &&
        ts.isPropertyAccessExpression(binaryExpression.right)));
  if (!isEqualsFalse && !isNotEqualsTrue) return null;
  const propertyAccess = ts.isPropertyAccessExpression(binaryExpression.left)
    ? binaryExpression.left
    : (binaryExpression.right as ts.PropertyAccessExpression);
  return {
    comparisonKind: isEqualsFalse ? 'equals-false' : 'not-equals-true',
    propertyAccess,
  };
}

function comparisonFindingsFromSource(
  filePath: string,
  sourceText: string,
  pluginStatusKeys: ReadonlySet<string>,
): ComparisonFinding[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const findings: ComparisonFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)) {
      const comparison = booleanComparison(node);
      const statusKey = comparison?.propertyAccess.name.text;
      if (comparison && statusKey && pluginStatusKeys.has(statusKey)) {
        findings.push({
          comparisonKind: comparison.comparisonKind,
          filePath,
          lineNumber:
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
              .line + 1,
          statusKey,
          expressionText: node.getText(sourceFile),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function provePositiveControl(): void {
  const pluginSource = [
    'class DirectPlugin implements ApplicationContributor {',
    'activateApplication(context) {',
    'context.statusProjectionContributions.register({',
    'snapshot: () => ({ directPluginOpen: true }),',
    '});',
    '}',
    'unrelated() { return { unrelatedKey: false }; }',
    '}',
    'class DelegatedPlugin implements ApplicationContributor {',
    'activateApplication(context) {',
    'context.statusProjectionContributions.register({ snapshot: () => this.statusSnapshot() });',
    '}',
    'statusSnapshot() { return { delegatedPluginOpen: false }; }',
    '}',
  ].join('\n');
  const pluginStatusKeys = pluginStatusKeysFromSource(
    'plugin-positive-control.ts',
    pluginSource,
  );
  if (
    pluginStatusKeys.size !== 2 ||
    !pluginStatusKeys.has('directPluginOpen') ||
    !pluginStatusKeys.has('delegatedPluginOpen') ||
    pluginStatusKeys.has('unrelatedKey')
  ) {
    throw new Error(
      'Positive control failed: plugin status discovery did not isolate both registration forms',
    );
  }
  const findings = comparisonFindingsFromSource(
    'positive-control.ts',
    [
      'status.directPluginOpen === false;',
      'status.delegatedPluginOpen !== true;',
      'status.hostOpen === false;',
    ].join('\n'),
    pluginStatusKeys,
  );
  const foundComparisonKinds = new Set(
    findings.map((finding) => finding.comparisonKind),
  );
  if (
    findings.length !== 2 ||
    !foundComparisonKinds.has('equals-false') ||
    !foundComparisonKinds.has('not-equals-true')
  ) {
    throw new Error(
      'Positive control failed: the census did not isolate both plugin-status comparison forms',
    );
  }
  console.log('positive control: both plugin-status comparison forms detected');
}

provePositiveControl();

const moduleFiles = collectTypeScriptFiles(
  moduleRoot,
  (filePath) => filePath.endsWith('.ts') && !filePath.endsWith('.test.ts'),
);
const pluginStatusKeys = new Set(
  moduleFiles.flatMap((filePath) => [
    ...pluginStatusKeysFromSource(filePath, readFileSync(filePath, 'utf8')),
  ]),
);
const structuralRegistrationCount = moduleFiles.reduce(
  (registrationCount, filePath) =>
    registrationCount +
    pluginStatusProjectionRegistrationCountFromSource(
      filePath,
      readFileSync(filePath, 'utf8'),
    ),
  0,
);
const independentRegistrationCount = moduleFiles.reduce(
  (registrationCount, filePath) =>
    registrationCount +
    independentPluginStatusProjectionRegistrationCount(
      readFileSync(filePath, 'utf8'),
    ),
  0,
);
if (structuralRegistrationCount !== independentRegistrationCount) {
  throw new Error(
    `Plugin status discovery found ${structuralRegistrationCount} registrations, but the independent source count found ${independentRegistrationCount}`,
  );
}
const comparisonFindings = collectTypeScriptFiles(
  smokeRoot,
  (filePath) =>
    filePath.endsWith('.ts') &&
    filePath.split('/').at(-1)?.startsWith('smoke-') === true,
)
  .sort()
  .flatMap((filePath) =>
    comparisonFindingsFromSource(
      filePath,
      readFileSync(filePath, 'utf8'),
      pluginStatusKeys,
    ),
  );

for (const finding of comparisonFindings) {
  console.log(
    `${finding.comparisonKind}  ${relative(repositoryRoot, finding.filePath)}:${finding.lineNumber}  ${finding.statusKey}  ${finding.expressionText}`,
  );
}

const equalsFalseCount = comparisonFindings.filter(
  (finding) => finding.comparisonKind === 'equals-false',
).length;
const notEqualsTrueCount = comparisonFindings.filter(
  (finding) => finding.comparisonKind === 'not-equals-true',
).length;
console.log(`plugin status keys discovered: ${pluginStatusKeys.size}`);
console.log(
  `plugin status registrations discovered: ${structuralRegistrationCount}`,
);
console.log(
  `plugin status boolean comparisons: ${comparisonFindings.length} total, ${equalsFalseCount} equals-false, ${notEqualsTrueCount} not-equals-true`,
);
