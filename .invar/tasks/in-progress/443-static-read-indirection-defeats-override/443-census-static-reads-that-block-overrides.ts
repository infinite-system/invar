/**
 * This script finds production instance code that names its own class when it reads a static member.
 * Run it with `bun .invar/tasks/in-progress/443-static-read-indirection-defeats-override/443-census-static-reads-that-block-overrides.ts`.
 * Each result can defeat a subclass override. A total of zero means the scan found no remaining candidate reads in src.
 */
import * as ts from 'typescript';

const sourceFileGlob = new Bun.Glob('src/**/*.ts');
let blockingStaticReadCount = 0;

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function expressionNamesOwnClass(
  expression: ts.Expression,
  rawClassName: string,
  namespaceName: string,
): boolean {
  const unwrappedExpression = unwrapExpression(expression);
  if (ts.isIdentifier(unwrappedExpression)) {
    return unwrappedExpression.text === rawClassName;
  }
  return (
    ts.isPropertyAccessExpression(unwrappedExpression) &&
    ts.isIdentifier(unwrappedExpression.expression) &&
    unwrappedExpression.expression.text === namespaceName &&
    (unwrappedExpression.name.text === 'Class' ||
      unwrappedExpression.name.text === '$Class')
  );
}

for await (const sourceFilePath of sourceFileGlob.scan('.')) {
  if (sourceFilePath.endsWith('.test.ts')) continue;
  const sourceText = await Bun.file(sourceFilePath).text();
  const sourceFile = ts.createSourceFile(
    sourceFilePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !statement.name) continue;
    const rawClassName = statement.name.text;
    if (!rawClassName.startsWith('$')) continue;
    const namespaceName = rawClassName.slice(1);
    const ownClassGetterNames = new Set<string>();

    for (const member of statement.members) {
      if (!ts.isGetAccessorDeclaration(member) || !member.body) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;
      const returnStatement = member.body.statements.find(ts.isReturnStatement);
      if (
        returnStatement?.expression &&
        expressionNamesOwnClass(
          returnStatement.expression,
          rawClassName,
          namespaceName,
        )
      ) {
        ownClassGetterNames.add(member.name.text);
      }
    }

    for (const member of statement.members) {
      const memberIsStatic = member.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword,
      );
      if (memberIsStatic) continue;

      const visit = (node: ts.Node): void => {
        if (ts.isPropertyAccessExpression(node)) {
          const expression = unwrapExpression(node.expression);
          const readsOwnClassDirectly = expressionNamesOwnClass(
            expression,
            rawClassName,
            namespaceName,
          );
          const readsOwnClassThroughGetter =
            ts.isPropertyAccessExpression(expression) &&
            expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
            ownClassGetterNames.has(expression.name.text);
          if (readsOwnClassDirectly || readsOwnClassThroughGetter) {
            const location = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile),
            );
            console.log(
              `${sourceFilePath}:${location.line + 1} ${rawClassName} reads ${node.getText(sourceFile)}`,
            );
            blockingStaticReadCount++;
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(member, visit);
    }
  }
}

console.log(
  `blocking static read candidates in production instance code: ${blockingStaticReadCount}`,
);
