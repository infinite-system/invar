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
// coverage-deltas.md by file path. Growth needs no bookkeeping. Shrinkage becomes a
// diff to a file named for exactly that purpose, which a reviewer sees at a glance
// and an agent cannot perform silently.
//
// Counting walks the TypeScript AST rather than matching text, so an assertion
// mentioned in a comment or a string never inflates a floor.
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

export interface CoverageRatchetResult {
  changes: CoverageChange[];
  undeclaredDecreases: CoverageChange[];
  declarationFilePath: string;
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

const DECLARATION_FILE_NAME = 'coverage-deltas.md';

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

function readCountsAtRevision(
  revision: string,
  filePath: string,
): CoverageCounts | null {
  const sourceText = runGit(['show', `${revision}:${filePath}`]);
  if (sourceText.length === 0) {
    return null;
  }
  return countCoverageCalls(filePath, sourceText);
}

function readCountsInWorkingTree(filePath: string): CoverageCounts | null {
  const absolutePath = resolve(process.cwd(), filePath);
  if (!existsSync(absolutePath)) {
    return null;
  }
  return countCoverageCalls(filePath, readFileSync(absolutePath, 'utf8'));
}

function readDeclaredPaths(): string[] {
  const absolutePath = resolve(process.cwd(), DECLARATION_FILE_NAME);
  if (!existsSync(absolutePath)) {
    return [];
  }
  return readFileSync(absolutePath, 'utf8')
    .split('\n')
    .flatMap((line) => line.match(/[\w./-]+\.ts/g) ?? []);
}

export function compareCoverage(comparisonBase: string): CoverageRatchetResult {
  const declaredPaths = readDeclaredPaths();
  const changes: CoverageChange[] = [];
  for (const filePath of listCoverageBearingPaths(comparisonBase)) {
    const baseCounts = readCountsAtRevision(comparisonBase, filePath);
    if (baseCounts === null) {
      continue;
    }
    const headCounts = readCountsInWorkingTree(filePath);
    if (headCounts === null) {
      changes.push({
        filePath,
        baseCounts,
        headCounts: { assertions: 0, waits: 0 },
        fileRemoved: true,
      });
      continue;
    }
    if (
      headCounts.assertions !== baseCounts.assertions ||
      headCounts.waits !== baseCounts.waits
    ) {
      changes.push({ filePath, baseCounts, headCounts, fileRemoved: false });
    }
  }
  const undeclaredDecreases = changes.filter((change) => {
    const decreased =
      change.headCounts.assertions < change.baseCounts.assertions ||
      change.headCounts.waits < change.baseCounts.waits;
    if (!decreased) {
      return false;
    }
    return !declaredPaths.some((declaredPath) =>
      change.filePath.endsWith(declaredPath.replace(/^\.\//, '')),
    );
  });
  return {
    changes,
    undeclaredDecreases,
    declarationFilePath: DECLARATION_FILE_NAME,
  };
}

function formatCounts(counts: CoverageCounts): string {
  return `${counts.assertions} assertions / ${counts.waits} waits`;
}

if (import.meta.main) {
  const comparisonBase = resolveComparisonBase();
  if (comparisonBase.length === 0) {
    console.log(
      '  SKIP  coverage ratchet: no comparison base (no origin/main, no parent)',
    );
    process.exit(0);
  }
  const result = compareCoverage(comparisonBase);
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
  if (result.undeclaredDecreases.length === 0) {
    console.log(
      `  OK    coverage ratchet: no undeclared decrease against ${comparisonBase.slice(0, 7)}`,
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
  console.log('');
  console.log(
    `Removing an assertion or a wait is allowed. Doing it silently is not.`,
  );
  console.log(
    `Declare each decrease in ${result.declarationFilePath} — one entry per file,`,
  );
  console.log(
    `naming the path and WHY the claim is gone (unsound, superseded by a stronger`,
  );
  console.log(
    `assertion, feature removed) plus where it is restored if it will be.`,
  );
  process.exit(1);
}
