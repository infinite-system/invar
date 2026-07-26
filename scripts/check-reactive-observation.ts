#!/usr/bin/env bun

// A per-frame observation must read its source LIVE. This walks the tsc program
// (never syntax alone — in a reactive codebase a `.value` that looks captured is
// usually a plain number and a plain number is usually fine) and reports the
// three shapes that turn a live read into a value captured once:
//
//   1. construction-captured-reactive-read — a Ref read in a constructor or a
//      property initializer, stored on `this`, and read again from a method. The
//      field can never change after construction, so every later reader reports
//      the value the constructor happened to see.
//   2. module-scope-captured-reactive-read — a Ref read in a module-level
//      binding. Frozen for the life of the process (also *Imported dependencies
//      are read late*, project.invariants.md).
//   3. shallow-payload-mutation — an in-place mutation of a `shallowRef`
//      payload. `shallowRef` tracks the BINDING only, so this write notifies no
//      observer and every reader keeps reporting the collection it last saw.
//
// Report-only for repository code: a candidate is evidence for review, and only
// the observation path can establish whether a captured value is ever read after
// the moment it was captured. The POSITIVE CONTROL is not report-only — the
// checker refuses to run against repository code until it has flagged every
// category in `scripts/fixtures/reactive-observation-positive-control.ts.fixture`,
// so it can never inspect nothing and print OK.
//
// Deliberately NOT flagged: a getter exposing a mutable plain field on a
// `Reactive()` class (`ScrollableTextViewport.scrollTop`,
// `TextDocument.maximumLineWidth`, `AgentSession.activeEngine`, …). Those are the
// repo's version-signal shape — the write site bumps a `renderRevision` /
// `revision` / `paintRevision` ref, sometimes one call level up from the
// assignment, and syntax cannot tell a bumped write from an unbumped one without
// a call graph. They are counted in the census as the standing hazard inventory
// instead of flagged as defects, because a checker that cries wolf gets deleted.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';
import type * as typescriptTypes from 'typescript';

const requireFromProject = createRequire(import.meta.url);
const typescript: typeof typescriptTypes = requireFromProject('typescript');

const repositoryRoot = resolve(import.meta.dir, '..');
const inspectedSourceGlob = 'src/**/*.ts';
const positiveControlFixturePath =
  'scripts/fixtures/reactive-observation-positive-control.ts.fixture';
const positiveControlVirtualPath =
  'scripts/fixtures/reactive-observation-positive-control.ts';
const positiveControlExpectedCategories: readonly CandidateCategory[] = [
  'construction-captured-reactive-read',
  'module-scope-captured-reactive-read',
  'shallow-payload-mutation',
];

const referenceTypeNames: ReadonlySet<string> = new Set([
  'Ref',
  'ShallowRef',
  'ComputedRef',
  'WritableComputedRef',
]);
const payloadMutatingMemberNames: ReadonlySet<string> = new Set([
  'add',
  'clear',
  'copyWithin',
  'delete',
  'fill',
  'pop',
  'push',
  'reverse',
  'set',
  'shift',
  'sort',
  'splice',
  'unshift',
]);

export type CandidateCategory =
  | 'construction-captured-reactive-read'
  | 'module-scope-captured-reactive-read'
  | 'shallow-payload-mutation';

export interface Candidate {
  filePath: string;
  lineNumber: number;
  category: CandidateCategory;
  description: string;
}

export interface ObservationCensus {
  inspectedFileCount: number;
  referenceValueReadCount: number;
  shallowReferenceValueReadCount: number;
  reactiveClassCount: number;
  versionSignalledFieldCount: number;
}

export interface ObservationScan {
  candidates: Candidate[];
  census: ObservationCensus;
}

function compilerOptions(): typescriptTypes.CompilerOptions {
  const configurationRead = typescript.readConfigFile(
    resolve(repositoryRoot, 'tsconfig.json'),
    typescript.sys.readFile,
  );
  const parsedConfiguration = typescript.parseJsonConfigFileContent(
    configurationRead.config,
    typescript.sys,
    repositoryRoot,
  );
  return { ...parsedConfiguration.options, noEmit: true };
}

function isReferenceType(type: typescriptTypes.Type): boolean {
  const candidateTypes = type.isUnion() ? type.types : [type];
  return candidateTypes.some((candidateType) => {
    const symbolName =
      candidateType.aliasSymbol?.getName() ??
      candidateType.getSymbol()?.getName();
    return symbolName !== undefined && referenceTypeNames.has(symbolName);
  });
}

function isShallowReferenceType(type: typescriptTypes.Type): boolean {
  const candidateTypes = type.isUnion() ? type.types : [type];
  return candidateTypes.some((candidateType) => {
    const symbolName =
      candidateType.aliasSymbol?.getName() ??
      candidateType.getSymbol()?.getName();
    return symbolName === 'ShallowRef';
  });
}

/** `=`, `+=`, `??=` and the rest: TypeScript's public SyntaxKind bounds the whole
 *  assignment family, so this needs no hand-maintained token list. */
function isAssignmentOperatorKind(kind: typescriptTypes.SyntaxKind): boolean {
  return (
    kind >= typescript.SyntaxKind.FirstAssignment &&
    kind <= typescript.SyntaxKind.LastAssignment
  );
}

function isWriteTarget(node: typescriptTypes.Node): boolean {
  const parent = node.parent;
  if (
    typescript.isBinaryExpression(parent) &&
    parent.left === node &&
    isAssignmentOperatorKind(parent.operatorToken.kind)
  ) {
    return true;
  }
  return (
    typescript.isPostfixUnaryExpression(parent) ||
    (typescript.isPrefixUnaryExpression(parent) &&
      (parent.operator === typescript.SyntaxKind.PlusPlusToken ||
        parent.operator === typescript.SyntaxKind.MinusMinusToken))
  );
}

function lineNumberOf(node: typescriptTypes.Node): number {
  const sourceFile = node.getSourceFile();
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

/** The construction scope a node sits in — a constructor body or a property
 *  initializer — or null when a function body stands between them. */
function enclosingConstructionScope(
  node: typescriptTypes.Node,
): typescriptTypes.Node | null {
  let candidate: typescriptTypes.Node | undefined = node.parent;
  while (candidate) {
    if (
      typescript.isConstructorDeclaration(candidate) ||
      typescript.isPropertyDeclaration(candidate)
    ) {
      return candidate;
    }
    if (typescript.isFunctionLike(candidate)) return null;
    candidate = candidate.parent;
  }
  return null;
}

function enclosingClass(
  node: typescriptTypes.Node,
): typescriptTypes.ClassLikeDeclaration | null {
  let candidate: typescriptTypes.Node | undefined = node.parent;
  while (candidate) {
    if (typescript.isClassLike(candidate)) return candidate;
    candidate = candidate.parent;
  }
  return null;
}

function isInsideFunction(node: typescriptTypes.Node): boolean {
  let candidate: typescriptTypes.Node | undefined = node.parent;
  while (candidate) {
    if (
      typescript.isFunctionLike(candidate) ||
      typescript.isClassLike(candidate)
    ) {
      return true;
    }
    candidate = candidate.parent;
  }
  return false;
}

/** A construction-time read that is handed to a constructed object, a literal, or
 *  a closure is that consumer's business — the field then holds the CONSUMER, and
 *  the repo's shape pairs such a seed with a live sibling thunk
 *  (`initialSize` next to `currentSize: () => …` in `PaneSplitters`). Only a read
 *  stored DIRECTLY into the field freezes what the field reports. */
function crossesDelegationBoundary(node: typescriptTypes.Node): boolean {
  return (
    typescript.isNewExpression(node) ||
    typescript.isObjectLiteralExpression(node) ||
    typescript.isArrayLiteralExpression(node) ||
    typescript.isFunctionLike(node)
  );
}

/** The field name a construction-time read is stored into, or null when the read
 *  is consumed on the spot (an argument, a comparison, a seed for a live sibling
 *  thunk) and so captures nothing that outlives the statement. */
function capturedFieldName(
  node: typescriptTypes.Node,
  constructionScope: typescriptTypes.Node,
): string | null {
  if (typescript.isPropertyDeclaration(constructionScope)) {
    if (!typescript.isIdentifier(constructionScope.name)) return null;
    let candidate: typescriptTypes.Node = node;
    while (candidate.parent && candidate.parent !== constructionScope) {
      if (crossesDelegationBoundary(candidate.parent)) return null;
      candidate = candidate.parent;
    }
    return constructionScope.name.text;
  }
  let candidate: typescriptTypes.Node = node;
  while (candidate.parent && candidate.parent !== constructionScope) {
    const parent = candidate.parent;
    if (
      typescript.isBinaryExpression(parent) &&
      parent.right === candidate &&
      parent.operatorToken.kind === typescript.SyntaxKind.EqualsToken &&
      typescript.isPropertyAccessExpression(parent.left) &&
      parent.left.expression.kind === typescript.SyntaxKind.ThisKeyword
    ) {
      return parent.left.name.text;
    }
    if (crossesDelegationBoundary(parent)) return null;
    candidate = parent;
  }
  return null;
}

function fieldIsReadOutsideConstruction(
  classDeclaration: typescriptTypes.ClassLikeDeclaration,
  fieldName: string,
): boolean {
  let readOutside = false;
  const visit = (node: typescriptTypes.Node): void => {
    if (readOutside) return;
    if (
      typescript.isPropertyAccessExpression(node) &&
      node.expression.kind === typescript.SyntaxKind.ThisKeyword &&
      node.name.text === fieldName &&
      !isWriteTarget(node) &&
      enclosingConstructionScope(node) === null
    ) {
      readOutside = true;
      return;
    }
    typescript.forEachChild(node, visit);
  };
  typescript.forEachChild(classDeclaration, visit);
  return readOutside;
}

/** Classes handed to `Reactive()` in the same file, resolved through the
 *  namespace's `$Class` binding so `Reactive($Class)` names the real class. */
function reactiveClassNames(
  sourceFile: typescriptTypes.SourceFile,
  typeChecker: typescriptTypes.TypeChecker,
): ReadonlySet<string> {
  const names = new Set<string>();
  const visit = (node: typescriptTypes.Node): void => {
    if (
      typescript.isCallExpression(node) &&
      typescript.isIdentifier(node.expression) &&
      node.expression.text === 'Reactive'
    ) {
      const argument = node.arguments[0];
      if (argument && typescript.isIdentifier(argument)) {
        names.add(argument.text);
        const declaration =
          typeChecker.getSymbolAtLocation(argument)?.valueDeclaration;
        if (
          declaration &&
          typescript.isVariableDeclaration(declaration) &&
          declaration.initializer &&
          typescript.isIdentifier(declaration.initializer)
        ) {
          names.add(declaration.initializer.text);
        }
      }
    }
    typescript.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

/** Census only: mutable plain fields on a `Reactive()` class that a getter
 *  publishes. Each one depends on a version signal at its write sites — the
 *  standing hazard inventory this checker measures but cannot adjudicate. */
function countVersionSignalledFields(
  sourceFile: typescriptTypes.SourceFile,
  typeChecker: typescriptTypes.TypeChecker,
): { reactiveClassCount: number; versionSignalledFieldCount: number } {
  const names = reactiveClassNames(sourceFile, typeChecker);
  let reactiveClassCount = 0;
  let versionSignalledFieldCount = 0;
  const visit = (node: typescriptTypes.Node): void => {
    if (
      typescript.isClassDeclaration(node) &&
      node.name &&
      names.has(node.name.text)
    ) {
      reactiveClassCount += 1;
      const plainMutableFieldNames = new Set<string>();
      for (const member of node.members) {
        if (!typescript.isPropertyDeclaration(member)) continue;
        if (!typescript.isIdentifier(member.name)) continue;
        if (isReferenceType(typeChecker.getTypeAtLocation(member))) continue;
        if (
          member.modifiers?.some(
            (modifier) =>
              modifier.kind === typescript.SyntaxKind.ReadonlyKeyword,
          )
        ) {
          continue;
        }
        plainMutableFieldNames.add(member.name.text);
      }
      for (const member of node.members) {
        if (!typescript.isGetAccessorDeclaration(member)) continue;
        const returnStatement = member.body?.statements[0];
        if (
          member.body === undefined ||
          member.body.statements.length !== 1 ||
          returnStatement === undefined ||
          !typescript.isReturnStatement(returnStatement) ||
          returnStatement.expression === undefined
        ) {
          continue;
        }
        const returned = returnStatement.expression;
        if (
          typescript.isPropertyAccessExpression(returned) &&
          returned.expression.kind === typescript.SyntaxKind.ThisKeyword &&
          plainMutableFieldNames.has(returned.name.text)
        ) {
          versionSignalledFieldCount += 1;
        }
      }
    }
    typescript.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { reactiveClassCount, versionSignalledFieldCount };
}

export function scanForDroppedObservations(
  program: typescriptTypes.Program,
  inspectedAbsolutePaths: readonly string[],
): ObservationScan {
  const typeChecker = program.getTypeChecker();
  const candidates: Candidate[] = [];
  const census: ObservationCensus = {
    inspectedFileCount: 0,
    referenceValueReadCount: 0,
    shallowReferenceValueReadCount: 0,
    reactiveClassCount: 0,
    versionSignalledFieldCount: 0,
  };
  const inspectedPathSet = new Set(
    inspectedAbsolutePaths.map((candidate) => resolve(candidate)),
  );
  for (const sourceFile of program.getSourceFiles()) {
    if (!inspectedPathSet.has(resolve(sourceFile.fileName))) continue;
    census.inspectedFileCount += 1;
    const displayPath = relative(repositoryRoot, sourceFile.fileName);
    const visit = (node: typescriptTypes.Node): void => {
      if (
        typescript.isPropertyAccessExpression(node) &&
        node.name.text === 'value'
      ) {
        const receiverType = typeChecker.getTypeAtLocation(node.expression);
        if (isReferenceType(receiverType)) {
          const shallow = isShallowReferenceType(receiverType);
          if (shallow) census.shallowReferenceValueReadCount += 1;
          if (!isWriteTarget(node)) {
            census.referenceValueReadCount += 1;
            const constructionScope = enclosingConstructionScope(node);
            const classDeclaration = enclosingClass(node);
            if (constructionScope !== null && classDeclaration !== null) {
              const fieldName = capturedFieldName(node, constructionScope);
              if (
                fieldName !== null &&
                fieldIsReadOutsideConstruction(classDeclaration, fieldName)
              ) {
                candidates.push({
                  filePath: displayPath,
                  lineNumber: lineNumberOf(node),
                  category: 'construction-captured-reactive-read',
                  description:
                    `${fieldName} is set from ${node.getText(sourceFile)} at ` +
                    'construction and read from a method later',
                });
              }
            } else if (!isInsideFunction(node)) {
              candidates.push({
                filePath: displayPath,
                lineNumber: lineNumberOf(node),
                category: 'module-scope-captured-reactive-read',
                description: `${node.getText(sourceFile)} is read at module scope`,
              });
            }
          }
          if (shallow) {
            const parent = node.parent;
            const mutatingCall =
              typescript.isPropertyAccessExpression(parent) &&
              parent.expression === node &&
              payloadMutatingMemberNames.has(parent.name.text) &&
              typescript.isCallExpression(parent.parent) &&
              parent.parent.expression === parent;
            const elementWrite =
              (typescript.isElementAccessExpression(parent) ||
                typescript.isPropertyAccessExpression(parent)) &&
              parent.expression === node &&
              typescript.isBinaryExpression(parent.parent) &&
              parent.parent.left === parent &&
              isAssignmentOperatorKind(parent.parent.operatorToken.kind);
            if (mutatingCall || elementWrite) {
              candidates.push({
                filePath: displayPath,
                lineNumber: lineNumberOf(node),
                category: 'shallow-payload-mutation',
                description:
                  `${parent.getText(sourceFile)} mutates a shallowRef payload ` +
                  'in place, which notifies no observer',
              });
            }
          }
        }
      }
      typescript.forEachChild(node, visit);
    };
    visit(sourceFile);
    const fieldCensus = countVersionSignalledFields(sourceFile, typeChecker);
    census.reactiveClassCount += fieldCensus.reactiveClassCount;
    census.versionSignalledFieldCount += fieldCensus.versionSignalledFieldCount;
  }
  candidates.sort(
    (left, right) =>
      left.category.localeCompare(right.category) ||
      left.filePath.localeCompare(right.filePath) ||
      left.lineNumber - right.lineNumber,
  );
  return { candidates, census };
}

/** Build a program whose only root is the given source, served from memory at a
 *  repository path so `vue` and `ivue` resolve exactly as they do for real
 *  sources. This is how both the positive control and the checker's own tests
 *  reach the type checker without writing a file into the tree. */
function virtualSourceProgram(fixtureText: string): {
  program: typescriptTypes.Program;
  absolutePath: string;
} {
  const options = compilerOptions();
  const absolutePath = resolve(repositoryRoot, positiveControlVirtualPath);
  const host = typescript.createCompilerHost(options, true);
  const readSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (
    fileName,
    languageVersionOrOptions,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    resolve(fileName) === absolutePath
      ? typescript.createSourceFile(
          fileName,
          fixtureText,
          languageVersionOrOptions,
          true,
        )
      : readSourceFile(
          fileName,
          languageVersionOrOptions,
          onError,
          shouldCreateNewSourceFile,
        );
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (fileName) =>
    resolve(fileName) === absolutePath || fileExists(fileName);
  const readFile = host.readFile.bind(host);
  host.readFile = (fileName) =>
    resolve(fileName) === absolutePath ? fixtureText : readFile(fileName);
  return {
    program: typescript.createProgram({
      rootNames: [absolutePath],
      options,
      host,
    }),
    absolutePath,
  };
}

export function scanSourceText(sourceText: string): Candidate[] {
  const { program, absolutePath } = virtualSourceProgram(sourceText);
  return scanForDroppedObservations(program, [absolutePath]).candidates;
}

export function runDroppedObservationPositiveControl(): Candidate[] {
  const fixtureAbsolutePath = resolve(
    repositoryRoot,
    positiveControlFixturePath,
  );
  if (!existsSync(fixtureAbsolutePath)) {
    throw new Error(
      `positive-control fixture is missing: ${positiveControlFixturePath}`,
    );
  }
  const candidates = scanSourceText(readFileSync(fixtureAbsolutePath, 'utf8'));
  const flaggedCategories = new Set(
    candidates.map((candidate) => candidate.category),
  );
  const missingCategories = positiveControlExpectedCategories.filter(
    (category) => !flaggedCategories.has(category),
  );
  if (missingCategories.length > 0) {
    throw new Error(
      `positive control did not flag ${missingCategories.join(', ')} ` +
        `(flagged ${[...flaggedCategories].join(', ') || 'nothing'})`,
    );
  }
  return candidates;
}

export function inspectedSourcePaths(): string[] {
  return [
    ...new Bun.Glob(inspectedSourceGlob).scanSync({ cwd: repositoryRoot }),
  ]
    .filter((candidate) => !candidate.endsWith('.test.ts'))
    .map((candidate) => resolve(repositoryRoot, candidate))
    .sort();
}

export function scanRepositorySources(): ObservationScan {
  const paths = inspectedSourcePaths();
  const program = typescript.createProgram({
    rootNames: paths,
    options: compilerOptions(),
  });
  return scanForDroppedObservations(program, paths);
}

function formatCensus(census: ObservationCensus): string {
  return (
    `${census.inspectedFileCount} files, ` +
    `${census.referenceValueReadCount} live Ref reads, ` +
    `${census.shallowReferenceValueReadCount} shallowRef payload reads, ` +
    `${census.reactiveClassCount} Reactive() classes, ` +
    `${census.versionSignalledFieldCount} version-signalled plain fields`
  );
}

if (import.meta.main) {
  try {
    const positiveControlCandidates = runDroppedObservationPositiveControl();
    console.log(
      `  OK    dropped-observation positive control: ` +
        `${positiveControlCandidates.length} known-bad site(s) flagged ` +
        `(${positiveControlExpectedCategories.join(', ')})`,
    );
  } catch (error) {
    console.log(
      `  FAIL  dropped-observation positive control: ${String(error)}`,
    );
    console.log('  Refusing to proceed with an unproven observation checker.');
    process.exit(1);
  }
  const { candidates, census } = scanRepositorySources();
  console.log(`census: ${formatCensus(census)}`);
  if (census.inspectedFileCount === 0) {
    console.log('  FAIL  dropped observations: inspected zero source files');
    console.log('  Refusing to pass after inspecting nothing.');
    process.exit(1);
  }
  for (const candidate of candidates) {
    console.log(
      `candidate ${candidate.category}: ` +
        `${candidate.filePath}:${candidate.lineNumber}: ${candidate.description}`,
    );
  }
  console.log(
    `report-only: ${candidates.length} candidate(s); observation-path review required`,
  );
}
