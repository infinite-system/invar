#!/usr/bin/env bun

// Report-only structural candidates for the harness rule that every wait must
// observe the state its following assertion reads. These patterns are evidence
// for review, not proof of a defect: only the full action/wait/assertion path can
// establish whether a predicate is vacuous or observes adjacent state.

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as typescript from 'typescript';

const repositoryRoot = resolve(import.meta.dir, '..');

const assertionCallNames: ReadonlySet<string> = new Set([
  'assertContentInvariantAcrossAction',
  'expect',
  'pass',
  'requireCondition',
]);

const conditionWaitCallNames: ReadonlySet<string> = new Set([
  'awaitGridCondition',
  'awaitSnapshot',
]);

const externalDependencyCallNames: ReadonlySet<string> = new Set([
  'runGit',
  'spawn',
  'spawnSync',
]);

const diskObservationCallNames: ReadonlySet<string> = new Set([
  'exists',
  'existsSync',
  'readFile',
  'readFileSync',
  'text',
]);

interface CallSite {
  callExpression: typescript.CallExpression;
  calleeName: string | null;
  functionScope: typescript.Node;
  lineNumber: number;
}

interface Candidate {
  filePath: string;
  lineNumber: number;
  category:
    | 'bare-sleep'
    | 'repeated-wait-predicate'
    | 'save-external-dependency'
    | 'vacuous-save-predicate';
  description: string;
}

function readCalleeName(expression: typescript.Expression): string | null {
  if (typescript.isIdentifier(expression)) return expression.text;
  if (typescript.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return null;
}

function enclosingFunctionScope(node: typescript.Node): typescript.Node {
  let candidate: typescript.Node | undefined = node.parent;
  while (candidate) {
    if (
      typescript.isFunctionLike(candidate) ||
      typescript.isSourceFile(candidate)
    ) {
      return candidate;
    }
    candidate = candidate.parent;
  }
  return node.getSourceFile();
}

function isControlSaveCall(callSite: CallSite): boolean {
  if (callSite.calleeName !== 'sendKeys') return false;
  const firstArgument = callSite.callExpression.arguments[0];
  return (
    firstArgument !== undefined &&
    typescript.isStringLiteralLike(firstArgument) &&
    firstArgument.text === 'Control+s'
  );
}

function waitPredicate(
  callSite: CallSite,
): typescript.ArrowFunction | typescript.FunctionExpression | null {
  if (
    callSite.calleeName === null ||
    !conditionWaitCallNames.has(callSite.calleeName)
  ) {
    return null;
  }
  const predicateArgumentIndex =
    callSite.calleeName === 'awaitGridCondition' ? 1 : 0;
  const predicateArgument =
    callSite.callExpression.arguments[predicateArgumentIndex];
  return predicateArgument &&
    (typescript.isArrowFunction(predicateArgument) ||
      typescript.isFunctionExpression(predicateArgument))
    ? predicateArgument
    : null;
}

function canonicalPredicateText(
  predicate: typescript.ArrowFunction | typescript.FunctionExpression,
  sourceFile: typescript.SourceFile,
): string {
  let predicateText = predicate.body.getText(sourceFile);
  const firstParameter = predicate.parameters[0]?.name;
  if (firstParameter && typescript.isIdentifier(firstParameter)) {
    const escapedParameterName = firstParameter.text.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
    predicateText = predicateText.replace(
      new RegExp(`\\b${escapedParameterName}\\b`, 'g'),
      '$value',
    );
  }
  return predicateText.replace(/\s+/g, '');
}

function containsDiskObservation(callSites: readonly CallSite[]): boolean {
  return callSites.some(
    (callSite) =>
      callSite.calleeName !== null &&
      (diskObservationCallNames.has(callSite.calleeName) ||
        /(?:disk|file).*(?:content|bytes|saved)|awaitFile/i.test(
          callSite.calleeName,
        )),
  );
}

function containsGitDependency(callSite: CallSite): boolean {
  if (
    callSite.calleeName === null ||
    !externalDependencyCallNames.has(callSite.calleeName)
  ) {
    return false;
  }
  if (callSite.calleeName === 'runGit') return true;
  const firstArgument = callSite.callExpression.arguments[0];
  if (firstArgument && typescript.isArrayLiteralExpression(firstArgument)) {
    const command = firstArgument.elements[0];
    return (
      command !== undefined &&
      typescript.isStringLiteralLike(command) &&
      command.text === 'git'
    );
  }
  return false;
}

function standaloneSleepCandidate(callSite: CallSite): Candidate | null {
  if (callSite.calleeName !== 'sleep') return null;
  let statement: typescript.Node = callSite.callExpression;
  while (statement.parent && !typescript.isStatement(statement)) {
    statement = statement.parent;
  }
  if (!typescript.isExpressionStatement(statement)) return null;
  let ancestor: typescript.Node | undefined = statement.parent;
  while (ancestor && ancestor !== callSite.functionScope) {
    if (
      typescript.isForStatement(ancestor) ||
      typescript.isForInStatement(ancestor) ||
      typescript.isForOfStatement(ancestor) ||
      typescript.isWhileStatement(ancestor) ||
      typescript.isDoStatement(ancestor)
    ) {
      return null;
    }
    ancestor = ancestor.parent;
  }
  const statementContainer = statement.parent;
  if (
    !typescript.isBlock(statementContainer) &&
    !typescript.isSourceFile(statementContainer)
  ) {
    return null;
  }
  const statementIndex = statementContainer.statements.indexOf(statement);
  const followingStatement = statementContainer.statements[statementIndex + 1];
  if (
    followingStatement === undefined ||
    !directStatementCallNames(followingStatement).some((callName) =>
      assertionCallNames.has(callName),
    )
  ) {
    return null;
  }
  const driveCallNames: ReadonlySet<string> = new Set([
    'clickText',
    'resize',
    'sendKeys',
    'sendMouse',
    'sendMouseWithoutFrameExpectation',
    'sendPaste',
    'sendRawInput',
    'sendRawInputBytesWithoutFrameExpectation',
    'sendRawInputWithoutFrameExpectation',
    'sendText',
  ]);
  let precedingStatementIndex = statementIndex - 1;
  let hasPrecedingDrive = false;
  while (precedingStatementIndex >= 0) {
    const precedingStatement =
      statementContainer.statements[precedingStatementIndex];
    if (precedingStatement === undefined) break;
    const precedingCallNames = directStatementCallNames(precedingStatement);
    if (
      precedingCallNames.some((callName) => assertionCallNames.has(callName))
    ) {
      break;
    }
    if (precedingCallNames.some((callName) => driveCallNames.has(callName))) {
      hasPrecedingDrive = true;
      break;
    }
    precedingStatementIndex -= 1;
  }
  if (!hasPrecedingDrive) return null;
  return {
    filePath: callSite.callExpression.getSourceFile().fileName,
    lineNumber: callSite.lineNumber,
    category: 'bare-sleep',
    description:
      'standalone sleep is the last wait between a drive and the following assertion',
  };
}

function callNamesWithin(node: typescript.Node): string[] {
  const callNames: string[] = [];
  const visitNode = (candidate: typescript.Node): void => {
    if (typescript.isCallExpression(candidate)) {
      const calleeName = readCalleeName(candidate.expression);
      if (calleeName !== null) callNames.push(calleeName);
    }
    typescript.forEachChild(candidate, visitNode);
  };
  visitNode(node);
  return callNames;
}

function directStatementCallNames(statement: typescript.Statement): string[] {
  if (
    typescript.isExpressionStatement(statement) ||
    typescript.isVariableStatement(statement) ||
    typescript.isReturnStatement(statement) ||
    typescript.isThrowStatement(statement)
  ) {
    return callNamesWithin(statement);
  }
  return [];
}

function inspectTypeScriptFile(filePath: string): {
  assertionCount: number;
  waitCount: number;
  candidates: Candidate[];
} {
  const sourceText = readFileSync(resolve(repositoryRoot, filePath), 'utf8');
  const sourceFile = typescript.createSourceFile(
    filePath,
    sourceText,
    typescript.ScriptTarget.Latest,
    true,
  );
  const callSites: CallSite[] = [];
  let assertionCount = 0;
  let waitCount = 0;
  const visitNode = (node: typescript.Node): void => {
    if (typescript.isCallExpression(node)) {
      const calleeName = readCalleeName(node.expression);
      const lineNumber =
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1;
      callSites.push({
        callExpression: node,
        calleeName,
        functionScope: enclosingFunctionScope(node),
        lineNumber,
      });
      if (calleeName !== null && assertionCallNames.has(calleeName)) {
        assertionCount += 1;
      }
      if (
        calleeName !== null &&
        (conditionWaitCallNames.has(calleeName) ||
          calleeName === 'awaitStatus' ||
          calleeName === 'awaitStatusWithoutFrame' ||
          calleeName === 'awaitStatusPublication' ||
          calleeName === 'awaitOutputCondition')
      ) {
        waitCount += 1;
      }
    }
    typescript.forEachChild(node, visitNode);
  };
  visitNode(sourceFile);
  callSites.sort(
    (left, right) =>
      left.callExpression.getStart(sourceFile) -
      right.callExpression.getStart(sourceFile),
  );

  const candidates: Candidate[] = callSites
    .map((callSite) => standaloneSleepCandidate(callSite))
    .filter((candidate): candidate is Candidate => candidate !== null);

  const earlierWaitByPredicate = new Map<
    typescript.Node,
    Map<string, CallSite>
  >();
  for (const callSite of callSites) {
    const predicate = waitPredicate(callSite);
    if (!predicate) continue;
    const canonicalPredicate = canonicalPredicateText(predicate, sourceFile);
    const scopedWaits =
      earlierWaitByPredicate.get(callSite.functionScope) ??
      new Map<string, CallSite>();
    const earlierWait = scopedWaits.get(canonicalPredicate);
    if (earlierWait) {
      candidates.push({
        filePath,
        lineNumber: callSite.lineNumber,
        category: 'repeated-wait-predicate',
        description: `predicate repeats the wait at line ${earlierWait.lineNumber}; confirm the intervening action made it false`,
      });
    }
    scopedWaits.set(canonicalPredicate, callSite);
    earlierWaitByPredicate.set(callSite.functionScope, scopedWaits);
  }

  for (let saveIndex = 0; saveIndex < callSites.length; saveIndex += 1) {
    const saveCallSite = callSites[saveIndex];
    if (!saveCallSite) continue;
    if (!isControlSaveCall(saveCallSite)) continue;
    const scopedFollowingCalls = callSites
      .slice(saveIndex + 1)
      .filter(
        (callSite) => callSite.functionScope === saveCallSite.functionScope,
      );
    const dependencyIndex = scopedFollowingCalls.findIndex((callSite) =>
      containsGitDependency(callSite),
    );
    if (dependencyIndex >= 0) {
      const callsBeforeDependency = scopedFollowingCalls.slice(
        0,
        dependencyIndex,
      );
      if (!containsDiskObservation(callsBeforeDependency)) {
        candidates.push({
          filePath,
          lineNumber:
            scopedFollowingCalls[dependencyIndex]?.lineNumber ??
            saveCallSite.lineNumber,
          category: 'save-external-dependency',
          description:
            'git depends on a Control+s result with no intervening disk observation',
        });
      }
    }

    const nextWait = scopedFollowingCalls.find(
      (callSite) => waitPredicate(callSite) !== null,
    );
    if (!nextWait) continue;
    const nextPredicate = waitPredicate(nextWait);
    if (!nextPredicate) continue;
    const canonicalNextPredicate = canonicalPredicateText(
      nextPredicate,
      sourceFile,
    );
    const earlierMatchingWait = callSites
      .slice(0, saveIndex)
      .filter(
        (callSite) => callSite.functionScope === saveCallSite.functionScope,
      )
      .find((callSite) => {
        const predicate = waitPredicate(callSite);
        return (
          predicate !== null &&
          canonicalPredicateText(predicate, sourceFile) ===
            canonicalNextPredicate
        );
      });
    if (earlierMatchingWait) {
      candidates.push({
        filePath,
        lineNumber: nextWait.lineNumber,
        category: 'vacuous-save-predicate',
        description: `post-save wait repeats the predicate already awaited at line ${earlierMatchingWait.lineNumber}`,
      });
    }
  }

  return { assertionCount, waitCount, candidates };
}

function shellAssertionCount(filePath: string): number {
  return readFileSync(resolve(repositoryRoot, filePath), 'utf8')
    .split('\n')
    .filter(
      (line) =>
        /\bPASS\b/.test(line) && !/ALL-PASS/.test(line) && !/^\s*#/.test(line),
    ).length;
}

const typeScriptPaths = [
  ...new Bun.Glob('scripts/harness/**/*.ts').scanSync({
    cwd: repositoryRoot,
  }),
].sort();

const shellSmokePaths = [
  ...new Bun.Glob('scripts/smoke-*.sh').scanSync({
    cwd: repositoryRoot,
  }),
].sort();

let typeScriptAssertionCount = 0;

let typeScriptWaitCount = 0;

const candidates: Candidate[] = [];

for (const filePath of typeScriptPaths) {
  const result = inspectTypeScriptFile(filePath);
  typeScriptAssertionCount += result.assertionCount;
  typeScriptWaitCount += result.waitCount;
  candidates.push(...result.candidates);
}

const shellVerdictCount = shellSmokePaths.reduce(
  (count, filePath) => count + shellAssertionCount(filePath),
  0,
);

console.log(
  `census: ${typeScriptPaths.length} TypeScript files, ` +
    `${typeScriptAssertionCount} assertion calls, ` +
    `${typeScriptWaitCount} condition waits`,
);

console.log(
  `census: ${shellSmokePaths.length} shell smokes, ` +
    `${shellVerdictCount} PASS verdict branches`,
);

for (const candidate of candidates.sort(
  (left, right) =>
    left.filePath.localeCompare(right.filePath) ||
    left.lineNumber - right.lineNumber,
)) {
  console.log(
    `candidate ${candidate.category}: ` +
      `${relative(repositoryRoot, resolve(repositoryRoot, candidate.filePath))}:` +
      `${candidate.lineNumber}: ${candidate.description}`,
  );
}

console.log(
  `report-only: ${candidates.length} candidate(s); semantic review required`,
);
