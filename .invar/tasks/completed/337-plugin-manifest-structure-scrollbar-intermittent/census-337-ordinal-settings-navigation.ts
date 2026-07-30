#!/usr/bin/env bun
// What this finds out
// -------------------
// It counts one defect shape in the PTY harness smokes: a settings drive that reaches a named
// settings row by COUNTING keypresses instead of by LOOKING for the row. The shape is a bare
// `driver.sendKeys('Down')` (or 'Up') followed by a wait that requires
// `status.settingsSelectedLabel === '<a string literal>'`. The keypress count is an ordinal; the
// published settings list grows whenever any plugin contributes a row, so the ordinal silently
// starts landing on a neighbour and the wait then times out forever.
//
// This is the exact defect #337 repaired. #340 (opening a file reveals it in the file tree) added a
// second File Tree row, `Reveal open file`, below `Show hidden files`. One insertion turned
// scripts/harness/smoke-plugin-manifest-harness.ts red on every run without changing any product
// promise. Every other settings drive in the harness already walks by label or derives the step
// count from the published `settingsLabels`, so the census exists to keep it that way.
//
// How to run it
// -------------
//   bun .invar/tasks/in-progress/337-plugin-manifest-structure-scrollbar-intermittent/census-337-ordinal-settings-navigation.ts
//   bun .invar/tasks/.../census-337-ordinal-settings-navigation.ts --self-test
//
// How to read the output
// ---------------------
// Each finding is `file:line  <the awaited label>`. The count is the number of ordinal settings
// drives left in the harness. A healthy repository prints `ordinal settings drives: 0`. Any number
// above zero names a smoke that a future contributed setting can turn red for free; repair it by
// walking to the label (`selectSetting`) or by deriving the step count from `settingsLabels`, the
// way scripts/harness/smoke-code-folding-harness.ts does.
//
// The --self-test run is the POSITIVE CONTROL. It parses two inline fixtures: the pre-#337 broken
// shape, which the census MUST report, and the repaired shape, which it MUST NOT. A census that
// cannot report the defect it was written for is a decoration, so the self-test exits non-zero when
// either expectation fails.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

interface OrdinalSettingsDrive {
  readonly filePath: string;
  readonly line: number;
  readonly awaitedLabel: string;
}

const ORDINAL_KEY_NAMES = new Set(['Down', 'Up']);

// A bare `driver.sendKeys('Down')` — one ordinal step and nothing else. A call that also sends
// other keys, or that reads a count from a published list, is a different shape and not this defect.
function isBareOrdinalKeySend(statement: ts.Statement): boolean {
  if (!ts.isExpressionStatement(statement)) return false;
  const call = statement.expression;
  if (!ts.isCallExpression(call)) return false;
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  if (!call.expression.name.text.startsWith('sendKeys')) return false;
  if (call.arguments.length !== 1) return false;
  const onlyArgument = call.arguments[0];
  return (
    onlyArgument !== undefined &&
    ts.isStringLiteral(onlyArgument) &&
    ORDINAL_KEY_NAMES.has(onlyArgument.text)
  );
}

// The awaited label inside a status wait, when the predicate pins `settingsSelectedLabel` to a
// string literal. Returns null for every other wait.
function awaitedSettingsLabel(statement: ts.Statement): string | null {
  let awaitedLabel: string | null = null;
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === 'settingsSelectedLabel' &&
      ts.isStringLiteral(node.right)
    ) {
      awaitedLabel = node.right.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return awaitedLabel;
}

function findOrdinalSettingsDrives(
  filePath: string,
  sourceText: string,
): OrdinalSettingsDrive[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const drives: OrdinalSettingsDrive[] = [];
  const visitStatementList = (statements: readonly ts.Statement[]): void => {
    for (
      let statementIndex = 0;
      statementIndex + 1 < statements.length;
      statementIndex += 1
    ) {
      const ordinalStatement = statements[statementIndex];
      const followingStatement = statements[statementIndex + 1];
      if (
        ordinalStatement === undefined ||
        followingStatement === undefined ||
        !isBareOrdinalKeySend(ordinalStatement)
      ) {
        continue;
      }
      const awaitedLabel = awaitedSettingsLabel(followingStatement);
      if (awaitedLabel === null) continue;
      drives.push({
        filePath,
        line:
          sourceFile.getLineAndCharacterOfPosition(ordinalStatement.getStart())
            .line + 1,
        awaitedLabel,
      });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isBlock(node) || ts.isSourceFile(node)) {
      visitStatementList(node.statements);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return drives;
}

const BROKEN_FIXTURE = `
  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the first Git setting is selected',
    (status) => status.settingsSelectedLabel === 'Changes/log split',
  );
`;

const REPAIRED_FIXTURE = `
  await selectSetting(driver, statusPath, 'Changes/log split');
  await driver.awaitGridCondition(
    'the Git heading is painted above its contributed setting',
    (snapshot) => snapshot.findText('Changes/log split') !== null,
  );
`;

async function runSelfTest(): Promise<number> {
  const brokenFindings = findOrdinalSettingsDrives(
    'broken-fixture.ts',
    BROKEN_FIXTURE,
  );
  const repairedFindings = findOrdinalSettingsDrives(
    'repaired-fixture.ts',
    REPAIRED_FIXTURE,
  );
  let failureCount = 0;
  if (
    brokenFindings.length !== 1 ||
    brokenFindings[0]?.awaitedLabel !== 'Changes/log split'
  ) {
    console.log(
      `SELF-TEST FAIL  the pre-#337 broken shape was not reported (${brokenFindings.length} findings)`,
    );
    failureCount += 1;
  } else {
    console.log('SELF-TEST PASS  the pre-#337 broken shape is reported');
  }
  if (repairedFindings.length !== 0) {
    console.log(
      `SELF-TEST FAIL  the repaired shape was reported (${repairedFindings.length} findings)`,
    );
    failureCount += 1;
  } else {
    console.log('SELF-TEST PASS  the repaired shape is not reported');
  }
  return failureCount === 0 ? 0 : 1;
}

async function runCensus(): Promise<number> {
  const harnessDirectory = join(process.cwd(), 'scripts', 'harness');
  const smokeFileNames = readdirSync(harnessDirectory)
    .filter(
      (fileName) =>
        fileName.startsWith('smoke-') && fileName.endsWith('-harness.ts'),
    )
    .sort();
  const findings: OrdinalSettingsDrive[] = [];
  for (const smokeFileName of smokeFileNames) {
    const filePath = join(harnessDirectory, smokeFileName);
    findings.push(
      ...findOrdinalSettingsDrives(filePath, await Bun.file(filePath).text()),
    );
  }
  for (const finding of findings) {
    console.log(`${finding.filePath}:${finding.line}  ${finding.awaitedLabel}`);
  }
  console.log(
    `ordinal settings drives: ${findings.length} (over ${smokeFileNames.length} harness smokes)`,
  );
  return 0;
}

process.exit(
  process.argv.includes('--self-test')
    ? await runSelfTest()
    : await runCensus(),
);
