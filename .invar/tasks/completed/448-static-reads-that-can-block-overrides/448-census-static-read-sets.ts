/**
 * This script groups the override-blocking candidates by the static member they read.
 * Run it with `bun .invar/tasks/in-progress/448-static-reads-that-can-block-overrides/448-census-static-read-sets.ts`.
 * Each heading gives one declaring class and static. Candidate reads count toward the task's 55-site baseline.
 * The following identifier sites expose declarations and possible outside readers that need human classification.
 */
import * as ts from 'typescript';

type SourceRecord = {
  path: string;
  sourceFile: ts.SourceFile;
};

type ClassRecord = {
  path: string;
  declaration: ts.ClassDeclaration;
  rawName: string;
  namespaceName: string;
  baseNamespaceName: string | null;
  staticMemberNames: Set<string>;
};

type CandidateRead = {
  path: string;
  line: number;
  classRecord: ClassRecord;
  memberName: string;
  text: string;
};

const sourceFileGlob = new Bun.Glob('src/**/*.ts');
const sourceRecords: SourceRecord[] = [];
const classRecords: ClassRecord[] = [];

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

function expressionNamesClass(
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

function memberIsStatic(member: ts.ClassElement): boolean {
  return Boolean(
    member.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword,
    ),
  );
}

for await (const sourceFilePath of sourceFileGlob.scan('.')) {
  const sourceText = await Bun.file(sourceFilePath).text();
  const sourceFile = ts.createSourceFile(
    sourceFilePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  sourceRecords.push({ path: sourceFilePath, sourceFile });

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !statement.name) continue;
    if (!statement.name.text.startsWith('$')) continue;
    const heritageExpression = statement.heritageClauses
      ?.flatMap((clause) => clause.types)
      .at(0)?.expression;
    const baseNamespaceName =
      heritageExpression &&
      ts.isPropertyAccessExpression(heritageExpression) &&
      ts.isIdentifier(heritageExpression.expression)
        ? heritageExpression.expression.text
        : null;
    const staticMemberNames = new Set<string>();
    for (const member of statement.members) {
      if (!memberIsStatic(member) || !member.name) continue;
      if (ts.isIdentifier(member.name)) staticMemberNames.add(member.name.text);
    }
    classRecords.push({
      path: sourceFilePath,
      declaration: statement,
      rawName: statement.name.text,
      namespaceName: statement.name.text.slice(1),
      baseNamespaceName,
      staticMemberNames,
    });
  }
}

const productionClassByNamespace = new Map(
  classRecords
    .filter((classRecord) => !classRecord.path.endsWith('.test.ts'))
    .map((classRecord) => [classRecord.namespaceName, classRecord]),
);

function declaringClassFor(
  classRecord: ClassRecord,
  memberName: string,
): ClassRecord | null {
  let currentClassRecord: ClassRecord | undefined = classRecord;
  const visitedNamespaces = new Set<string>();
  while (currentClassRecord) {
    if (currentClassRecord.staticMemberNames.has(memberName)) {
      return currentClassRecord;
    }
    if (
      !currentClassRecord.baseNamespaceName ||
      visitedNamespaces.has(currentClassRecord.baseNamespaceName)
    ) {
      return null;
    }
    visitedNamespaces.add(currentClassRecord.baseNamespaceName);
    currentClassRecord = productionClassByNamespace.get(
      currentClassRecord.baseNamespaceName,
    );
  }
  return null;
}

const candidateReads: CandidateRead[] = [];
for (const classRecord of classRecords) {
  if (classRecord.path.endsWith('.test.ts')) continue;
  const ownClassGetterNames = new Set<string>();
  for (const member of classRecord.declaration.members) {
    if (!ts.isGetAccessorDeclaration(member) || !member.body) continue;
    if (!member.name || !ts.isIdentifier(member.name)) continue;
    const returnStatement = member.body.statements.find(ts.isReturnStatement);
    if (
      returnStatement?.expression &&
      expressionNamesClass(
        returnStatement.expression,
        classRecord.rawName,
        classRecord.namespaceName,
      )
    ) {
      ownClassGetterNames.add(member.name.text);
    }
  }

  for (const member of classRecord.declaration.members) {
    if (memberIsStatic(member)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node)) {
        const receiver = unwrapExpression(node.expression);
        const readsOwnClassDirectly = expressionNamesClass(
          receiver,
          classRecord.rawName,
          classRecord.namespaceName,
        );
        const readsOwnClassThroughGetter =
          ts.isPropertyAccessExpression(receiver) &&
          receiver.expression.kind === ts.SyntaxKind.ThisKeyword &&
          ownClassGetterNames.has(receiver.name.text);
        if (readsOwnClassDirectly || readsOwnClassThroughGetter) {
          const location = node
            .getSourceFile()
            .getLineAndCharacterOfPosition(node.getStart());
          candidateReads.push({
            path: classRecord.path,
            line: location.line + 1,
            classRecord,
            memberName: node.name.text,
            text: node.getText(node.getSourceFile()),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(member, visit);
  }
}

const candidatesByDeclaration = new Map<
  string,
  { declaringClass: ClassRecord; memberName: string; reads: CandidateRead[] }
>();
for (const candidateRead of candidateReads) {
  const declaringClass = declaringClassFor(
    candidateRead.classRecord,
    candidateRead.memberName,
  );
  if (!declaringClass) {
    throw new Error(
      `No static declaration found for ${candidateRead.classRecord.namespaceName}.${candidateRead.memberName}`,
    );
  }
  const key = `${declaringClass.namespaceName}.${candidateRead.memberName}`;
  const existing = candidatesByDeclaration.get(key);
  if (existing) {
    existing.reads.push(candidateRead);
  } else {
    candidatesByDeclaration.set(key, {
      declaringClass,
      memberName: candidateRead.memberName,
      reads: [candidateRead],
    });
  }
}

for (const [key, candidate] of [...candidatesByDeclaration.entries()].sort(
  ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey),
)) {
  console.log(`\n${key} — ${candidate.reads.length} candidate read(s)`);
  for (const read of candidate.reads) {
    console.log(`  candidate ${read.path}:${read.line} ${read.text}`);
  }
  for (const sourceRecord of sourceRecords) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isIdentifier(node) &&
        node.text === candidate.memberName &&
        !candidate.reads.some(
          (read) =>
            read.path === sourceRecord.path &&
            read.line ===
              sourceRecord.sourceFile.getLineAndCharacterOfPosition(
                node.getStart(sourceRecord.sourceFile),
              ).line +
                1,
        )
      ) {
        const location = sourceRecord.sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceRecord.sourceFile),
        );
        const parentText = node.parent
          .getText(sourceRecord.sourceFile)
          .replaceAll(/\s+/g, ' ')
          .slice(0, 180);
        console.log(
          `  identifier ${sourceRecord.path}:${location.line + 1} ${parentText}`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceRecord.sourceFile);
  }
}

console.log(
  `\n${candidateReads.length} candidate reads grouped into ${candidatesByDeclaration.size} statics`,
);
console.log('\nAll statics on candidate classes:');
for (const classRecord of [
  ...new Set(candidateReads.map((read) => read.classRecord)),
].sort((leftClass, rightClass) =>
  leftClass.namespaceName.localeCompare(rightClass.namespaceName),
)) {
  console.log(
    `  ${classRecord.namespaceName}: ${[...classRecord.staticMemberNames].join(', ')}`,
  );
}
