#!/usr/bin/env bun

// Coverage is a ratchet: it may fall, but never quietly. An agent under pressure to
// turn a gate green has one cheap move available — delete the assertion that is
// failing — and nothing else in this repo detects it. The invariant checker catches a
// deleted smoke only when some invariant's Verify line cites it, so an uncited
// assertion inside a kept file can be removed with every check still passing. That
// happened on 2026-07-25: a frame-silence assertion was removed from the git-blame
// smoke for good reasons, and the only thing distinguishing that from cheating was a
// sentence in a commit message.
//
// So this checker does not forbid removal. It compares assertion and wait counts
// against the merge base and requires every DECREASE to be declared in
// project.coverage-deltas.md by file path and exact before/after counts. Growth needs no
// bookkeeping. Shrinkage becomes a diff to a file named for exactly that purpose,
// which a reviewer sees at a glance and an agent cannot perform silently.
//
// Counting walks the TypeScript AST rather than matching text, so an assertion
// mentioned in a comment or a string never inflates a floor. Assertion-text
// replacement reporting is informational: it makes count-neutral padding visible
// without pretending that every legitimate assertion rewrite should block a merge.
//
// invariant: Coverage may fall but never silently (project.invariants.md)
// invariant: Public classes use the namespace pattern (project.invariants.md)

import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as typescript from 'typescript';

export type CoverageCallKind = 'assertion' | 'wait';

export interface CoverageCounts {
  assertions: number;
  waits: number;
}

export interface CoverageChange {
  filePath: string;
  baseCounts: CoverageCounts;
  headCounts: CoverageCounts;
  fileRemoved: boolean;
}

export interface CoverageDeclaration {
  filePath: string;
  baseCounts: CoverageCounts;
  headCounts: CoverageCounts;
  lineNumber: number;
}

export interface CoverageDeclarationFailure {
  filePath: string;
  message: string;
}

export interface AssertionTextReplacement {
  filePath: string;
  disappearedAssertionTexts: string[];
  appearedAssertionTexts: string[];
}

export interface CoverageRatchetResult {
  changes: CoverageChange[];
  undeclaredDecreases: CoverageChange[];
  declarationFailures: CoverageDeclarationFailure[];
  assertionTextReplacements: AssertionTextReplacement[];
  declarationFilePath: string;
  inspectedFileCount: number;
}

export interface CoverageDeclarationEvaluation {
  undeclaredDecreases: CoverageChange[];
  declarationFailures: CoverageDeclarationFailure[];
}

// Calls that ASSERT: they can fail and thereby prove something. Removing one removes
// a proof.
const ASSERTION_CALL_NAMES: ReadonlySet<string> = new Set([
  'assertContentInvariantAcrossAction',
  'expect',
  'pass',
  'requireCondition',
]);

// Calls that WAIT for an observable condition. A removed wait does not fail loudly,
// it makes everything after it race — so it is counted too, separately, because the
// two kinds of loss deserve different reading.
const WAIT_CALL_NAMES: ReadonlySet<string> = new Set([
  'awaitCondition',
  'awaitGridCondition',
  'awaitSnapshot',
  'awaitStatus',
  'awaitStatusWithoutFrame',
  'it',
  'test',
]);

const DECLARATION_FILE_NAME = 'project.coverage-deltas.md';
const DECLARATION_GRAMMAR = 'assertions A → B, waits C → D';
const POSITIVE_CONTROL_FILE_PATH =
  'fixtures/coverage-ratchet-positive-control.ts.fixture';
const POSITIVE_CONTROL_EXPECTED_COUNTS: CoverageCounts = {
  assertions: 2,
  waits: 2,
};

export function classifyCoverageCall(
  calleeName: string,
): CoverageCallKind | null {
  if (ASSERTION_CALL_NAMES.has(calleeName)) {
    return 'assertion';
  }
  if (WAIT_CALL_NAMES.has(calleeName)) {
    return 'wait';
  }
  return null;
}

export function countCoverageCalls(
  fileName: string,
  sourceText: string,
): CoverageCounts {
  const counts: CoverageCounts = { assertions: 0, waits: 0 };
  const sourceFile = typescript.createSourceFile(
    fileName,
    sourceText,
    typescript.ScriptTarget.Latest,
    true,
  );
  const visitNode = (node: typescript.Node): void => {
    if (typescript.isCallExpression(node)) {
      const calleeName = readCalleeName(node.expression);
      const callKind =
        calleeName === null ? null : classifyCoverageCall(calleeName);
      if (callKind === 'assertion') {
        counts.assertions += 1;
      } else if (callKind === 'wait') {
        counts.waits += 1;
      }
    }
    typescript.forEachChild(node, visitNode);
  };
  typescript.forEachChild(sourceFile, visitNode);
  return counts;
}

export function collectAssertionTexts(
  fileName: string,
  sourceText: string,
): string[] {
  const assertionTexts = new Set<string>();
  const sourceFile = typescript.createSourceFile(
    fileName,
    sourceText,
    typescript.ScriptTarget.Latest,
    true,
  );
  const visitNode = (node: typescript.Node): void => {
    if (typescript.isCallExpression(node)) {
      const calleeName = readCalleeName(node.expression);
      if (
        calleeName !== null &&
        classifyCoverageCall(calleeName) === 'assertion'
      ) {
        assertionTexts.add(
          normalizeAssertionText(
            readOutermostAssertionExpression(node),
            sourceFile,
          ),
        );
      }
    }
    typescript.forEachChild(node, visitNode);
  };
  typescript.forEachChild(sourceFile, visitNode);
  return [...assertionTexts].sort();
}

function readOutermostAssertionExpression(
  callExpression: typescript.CallExpression,
): typescript.Expression {
  let assertionExpression: typescript.Expression = callExpression;
  while (true) {
    const parent = assertionExpression.parent;
    if (
      typescript.isPropertyAccessExpression(parent) &&
      parent.expression === assertionExpression
    ) {
      assertionExpression = parent;
      continue;
    }
    if (
      typescript.isElementAccessExpression(parent) &&
      parent.expression === assertionExpression
    ) {
      assertionExpression = parent;
      continue;
    }
    if (
      typescript.isCallExpression(parent) &&
      parent.expression === assertionExpression
    ) {
      assertionExpression = parent;
      continue;
    }
    return assertionExpression;
  }
}

function normalizeAssertionText(
  assertionExpression: typescript.Expression,
  sourceFile: typescript.SourceFile,
): string {
  const assertionSourceText = assertionExpression.getText(sourceFile);
  const scanner = typescript.createScanner(
    typescript.ScriptTarget.Latest,
    true,
    typescript.LanguageVariant.Standard,
    assertionSourceText,
  );
  const tokens: Array<{ kind: typescript.SyntaxKind; text: string }> = [];
  let tokenKind = scanner.scan();
  while (tokenKind !== typescript.SyntaxKind.EndOfFileToken) {
    tokens.push({ kind: tokenKind, text: scanner.getTokenText() });
    tokenKind = scanner.scan();
  }
  return tokens
    .filter((token, tokenIndex) => {
      if (token.kind !== typescript.SyntaxKind.CommaToken) {
        return true;
      }
      const nextTokenKind = tokens[tokenIndex + 1]?.kind;
      return (
        nextTokenKind !== typescript.SyntaxKind.CloseParenToken &&
        nextTokenKind !== typescript.SyntaxKind.CloseBracketToken &&
        nextTokenKind !== typescript.SyntaxKind.CloseBraceToken
      );
    })
    .map((token) => token.text)
    .join(' ');
}

function readCalleeName(expression: typescript.Expression): string | null {
  if (typescript.isIdentifier(expression)) {
    return expression.text;
  }
  if (typescript.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return null;
}

export function isCoverageBearingPath(filePath: string): boolean {
  if (filePath.endsWith('.test.ts')) {
    return true;
  }
  return (
    filePath.startsWith('scripts/harness/smoke-') && filePath.endsWith('.ts')
  );
}

function runGit(argumentList: string[]): string {
  const result = Bun.spawnSync(['git', ...argumentList], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    return '';
  }
  return result.stdout.toString();
}

function resolveComparisonBase(): string {
  const mergeBase = runGit(['merge-base', 'origin/main', 'HEAD']).trim();
  if (mergeBase.length > 0) {
    return mergeBase;
  }
  // A worktree without origin/main compares against its own parent commit, which is
  // still a ratchet — it just spans one commit instead of a branch.
  return runGit(['rev-parse', 'HEAD^']).trim();
}

function listCoverageBearingPaths(revision: string): string[] {
  const listing = runGit(['ls-tree', '-r', '--name-only', revision]);
  return listing
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && isCoverageBearingPath(line));
}

function readSourceAtRevision(
  revision: string,
  filePath: string,
): string | null {
  const result = Bun.spawnSync(['git', 'show', `${revision}:${filePath}`], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    return null;
  }
  return result.stdout.toString();
}

function readSourceInWorkingTree(filePath: string): string | null {
  const absolutePath = resolve(process.cwd(), filePath);
  if (!existsSync(absolutePath)) {
    return null;
  }
  return readFileSync(absolutePath, 'utf8');
}

function readDeclarationText(): string {
  const absolutePath = resolve(process.cwd(), DECLARATION_FILE_NAME);
  if (!existsSync(absolutePath)) {
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

export function parseCoverageDeclarations(
  declarationText: string,
): Map<string, CoverageDeclaration | CoverageDeclarationFailure> {
  const declarationsByPath = new Map<
    string,
    CoverageDeclaration | CoverageDeclarationFailure
  >();
  for (const [lineIndex, declarationLine] of declarationText
    .split('\n')
    .entries()) {
    const declarationRowMatch = declarationLine.match(
      /^\|\s*`([^`]+\.ts)`\s*\|\s*(.*?)\s*\|\s*$/,
    );
    if (declarationRowMatch === null) {
      continue;
    }
    const [, declaredFilePath = '', declarationBody = ''] = declarationRowMatch;
    const filePath = declaredFilePath.replace(/^\.\//, '');
    const countsMatch = declarationBody.match(
      /\bassertions (\d+) → (\d+), waits (\d+) → (\d+)(?:[.;]|$)/,
    );
    if (countsMatch === null) {
      declarationsByPath.set(filePath, {
        filePath,
        message:
          `${DECLARATION_FILE_NAME}:${lineIndex + 1} does not state ` +
          `counts using the required grammar.`,
      });
      continue;
    }
    const [
      ,
      baseAssertionCountText = '0',
      headAssertionCountText = '0',
      baseWaitCountText = '0',
      headWaitCountText = '0',
    ] = countsMatch;
    declarationsByPath.set(filePath, {
      filePath,
      baseCounts: {
        assertions: Number(baseAssertionCountText),
        waits: Number(baseWaitCountText),
      },
      headCounts: {
        assertions: Number(headAssertionCountText),
        waits: Number(headWaitCountText),
      },
      lineNumber: lineIndex + 1,
    });
  }
  return declarationsByPath;
}

export function evaluateCoverageDeclarations(
  changes: CoverageChange[],
  declarationText: string,
): CoverageDeclarationEvaluation {
  const declarationsByPath = parseCoverageDeclarations(declarationText);
  const undeclaredDecreases: CoverageChange[] = [];
  const declarationFailures: CoverageDeclarationFailure[] = [];
  for (const change of changes) {
    const decreased =
      change.headCounts.assertions < change.baseCounts.assertions ||
      change.headCounts.waits < change.baseCounts.waits;
    if (!decreased) {
      continue;
    }
    const declaration = declarationsByPath.get(change.filePath);
    if (declaration === undefined) {
      undeclaredDecreases.push(change);
      continue;
    }
    if (!('baseCounts' in declaration)) {
      declarationFailures.push(declaration);
      continue;
    }
    if (
      declaration.baseCounts.assertions !== change.baseCounts.assertions ||
      declaration.baseCounts.waits !== change.baseCounts.waits ||
      declaration.headCounts.assertions !== change.headCounts.assertions ||
      declaration.headCounts.waits !== change.headCounts.waits
    ) {
      declarationFailures.push({
        filePath: change.filePath,
        message:
          `${DECLARATION_FILE_NAME}:${declaration.lineNumber} declares ` +
          `${formatDeclarationCounts(declaration.baseCounts, declaration.headCounts)}, ` +
          `but actual counts are ` +
          `${formatDeclarationCounts(change.baseCounts, change.headCounts)}.`,
      });
    }
  }
  return { undeclaredDecreases, declarationFailures };
}

export function compareAssertionTextReplacements(
  filePath: string,
  baseSourceText: string,
  headSourceText: string,
): AssertionTextReplacement | null {
  const baseAssertionTexts = new Set(
    collectAssertionTexts(filePath, baseSourceText),
  );
  const headAssertionTexts = new Set(
    collectAssertionTexts(filePath, headSourceText),
  );
  const disappearedAssertionTexts = [...baseAssertionTexts]
    .filter((assertionText) => !headAssertionTexts.has(assertionText))
    .sort();
  const appearedAssertionTexts = [...headAssertionTexts]
    .filter((assertionText) => !baseAssertionTexts.has(assertionText))
    .sort();
  if (
    disappearedAssertionTexts.length === 0 ||
    appearedAssertionTexts.length === 0
  ) {
    return null;
  }
  return {
    filePath,
    disappearedAssertionTexts,
    appearedAssertionTexts,
  };
}

export function formatAssertionTextReplacementCensus(
  replacements: AssertionTextReplacement[],
): string {
  if (replacements.length === 0) {
    return '';
  }
  const outputLines = [
    '  ASSERTION-TEXT REPLACEMENT CENSUS (informational only; does not fail)',
    '  Normalization: TypeScript lexical tokens, with comments and formatting',
    '  whitespace/line breaks and trailing commas removed; one token separator.',
  ];
  for (const replacement of replacements) {
    outputLines.push(`  CENSUS ${replacement.filePath}`);
    for (const assertionText of replacement.disappearedAssertionTexts) {
      outputLines.push(
        `    disappeared: ${formatAssertionTextForOutput(assertionText)}`,
      );
    }
    for (const assertionText of replacement.appearedAssertionTexts) {
      outputLines.push(
        `    appeared: ${formatAssertionTextForOutput(assertionText)}`,
      );
    }
  }
  return outputLines.join('\n');
}

function formatAssertionTextForOutput(assertionText: string): string {
  return assertionText.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

export function runCoverageCounterPositiveControl(): CoverageCounts {
  const positiveControlAbsolutePath = resolve(
    import.meta.dir,
    POSITIVE_CONTROL_FILE_PATH,
  );
  if (!existsSync(positiveControlAbsolutePath)) {
    throw new Error(
      `positive-control fixture is missing: ${positiveControlAbsolutePath}`,
    );
  }
  const counts = countCoverageCalls(
    POSITIVE_CONTROL_FILE_PATH,
    readFileSync(positiveControlAbsolutePath, 'utf8'),
  );
  if (
    counts.assertions !== POSITIVE_CONTROL_EXPECTED_COUNTS.assertions ||
    counts.waits !== POSITIVE_CONTROL_EXPECTED_COUNTS.waits
  ) {
    throw new Error(
      `positive control expected ${formatCounts(POSITIVE_CONTROL_EXPECTED_COUNTS)}` +
        ` but counted ${formatCounts(counts)}`,
    );
  }
  return counts;
}

export function compareCoverage(comparisonBase: string): CoverageRatchetResult {
  const changes: CoverageChange[] = [];
  const assertionTextReplacements: AssertionTextReplacement[] = [];
  const coverageBearingPaths = listCoverageBearingPaths(comparisonBase);
  let inspectedFileCount = 0;
  for (const filePath of coverageBearingPaths) {
    const baseSourceText = readSourceAtRevision(comparisonBase, filePath);
    if (baseSourceText === null) {
      continue;
    }
    inspectedFileCount += 1;
    const baseCounts = countCoverageCalls(filePath, baseSourceText);
    const headSourceText = readSourceInWorkingTree(filePath);
    if (headSourceText === null) {
      changes.push({
        filePath,
        baseCounts,
        headCounts: { assertions: 0, waits: 0 },
        fileRemoved: true,
      });
      continue;
    }
    const headCounts = countCoverageCalls(filePath, headSourceText);
    const assertionTextReplacement = compareAssertionTextReplacements(
      filePath,
      baseSourceText,
      headSourceText,
    );
    if (assertionTextReplacement !== null) {
      assertionTextReplacements.push(assertionTextReplacement);
    }
    if (
      headCounts.assertions !== baseCounts.assertions ||
      headCounts.waits !== baseCounts.waits
    ) {
      changes.push({ filePath, baseCounts, headCounts, fileRemoved: false });
    }
  }
  const declarationEvaluation = evaluateCoverageDeclarations(
    changes,
    readDeclarationText(),
  );
  return {
    changes,
    undeclaredDecreases: declarationEvaluation.undeclaredDecreases,
    declarationFailures: declarationEvaluation.declarationFailures,
    assertionTextReplacements,
    declarationFilePath: DECLARATION_FILE_NAME,
    inspectedFileCount,
  };
}

function formatCounts(counts: CoverageCounts): string {
  return `${counts.assertions} assertions / ${counts.waits} waits`;
}

function formatDeclarationCounts(
  baseCounts: CoverageCounts,
  headCounts: CoverageCounts,
): string {
  return (
    `assertions ${baseCounts.assertions} → ${headCounts.assertions}, ` +
    `waits ${baseCounts.waits} → ${headCounts.waits}`
  );
}

if (import.meta.main) {
  try {
    const positiveControlCounts = runCoverageCounterPositiveControl();
    console.log(
      `  OK    coverage counter positive control: ` +
        `${formatCounts(positiveControlCounts)}`,
    );
  } catch (error) {
    console.log(`  FAIL  coverage counter positive control: ${String(error)}`);
    console.log('  Refusing to proceed with an unproven coverage counter.');
    process.exit(1);
  }
  const comparisonBase = resolveComparisonBase();
  if (comparisonBase.length === 0) {
    console.log(
      '  FAIL  coverage ratchet: no comparison base (no origin/main, no parent)',
    );
    console.log('  Refusing to pass after inspecting zero coverage files.');
    process.exit(1);
  }
  const result = compareCoverage(comparisonBase);
  if (result.inspectedFileCount === 0) {
    console.log(
      `  FAIL  coverage ratchet: inspected zero coverage files at ` +
        comparisonBase.slice(0, 7),
    );
    console.log('  Refusing to pass after inspecting zero coverage files.');
    process.exit(1);
  }
  const assertionTextReplacementCensus = formatAssertionTextReplacementCensus(
    result.assertionTextReplacements,
  );
  if (assertionTextReplacementCensus.length > 0) {
    console.log(assertionTextReplacementCensus);
  }
  const grew = result.changes.filter(
    (change) =>
      change.headCounts.assertions > change.baseCounts.assertions ||
      change.headCounts.waits > change.baseCounts.waits,
  );
  for (const change of grew) {
    console.log(
      `  OK    ${change.filePath}: ${formatCounts(change.baseCounts)}` +
        ` -> ${formatCounts(change.headCounts)}`,
    );
  }
  if (
    result.undeclaredDecreases.length === 0 &&
    result.declarationFailures.length === 0
  ) {
    console.log(
      `  OK    coverage ratchet: inspected ${result.inspectedFileCount} files; ` +
        `no undeclared decrease against ${comparisonBase.slice(0, 7)}`,
    );
    process.exit(0);
  }
  for (const change of result.undeclaredDecreases) {
    const removalNote = change.fileRemoved ? ' (FILE REMOVED)' : '';
    console.log(
      `  FAIL  coverage ratchet: ${change.filePath}${removalNote}: ` +
        `${formatCounts(change.baseCounts)} -> ${formatCounts(change.headCounts)}`,
    );
  }
  for (const failure of result.declarationFailures) {
    console.log(
      `  FAIL  coverage declaration: ${failure.filePath}: ` + failure.message,
    );
  }
  console.log('');
  console.log(
    `Removing an assertion or a wait is allowed. Doing it silently is not.`,
  );
  console.log(
    `Declare each decrease in ${result.declarationFilePath} — one entry per file.`,
  );
  console.log(`Required count grammar: ${DECLARATION_GRAMMAR}`);
  console.log(
    `Example: | \`src/example.test.ts\` | assertions 4 → 3, waits 2 → 2. ` +
      `Removed an unsound claim. |`,
  );
  console.log(
    `Also name WHY the claim is gone (unsound, superseded by a stronger`,
  );
  console.log(
    `assertion, feature removed) plus where it is restored if it will be.`,
  );
  process.exit(1);
}
