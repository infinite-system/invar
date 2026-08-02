#!/usr/bin/env bun
// Finds blocking smoke assertions whose answer can change with machine speed.
// Run: bun scripts/check-smoke-timing-classification.ts <smoke-source> [...]
// A zero exit means every inspected source uses state, ordering, or count claims.
// A nonzero exit names each clock, frame-silence, or observed-frame absence claim.

import { readFileSync } from 'node:fs';
import * as TypeScript from 'typescript';

interface TimingFinding {
  lineNumber: number;
  reason: string;
}

class SmokeTimingClassification {
  static inspectSourceText(
    sourceText: string,
    sourcePath: string,
  ): readonly TimingFinding[] {
    const sourceFile = TypeScript.createSourceFile(
      sourcePath,
      sourceText,
      TypeScript.ScriptTarget.Latest,
      true,
      TypeScript.ScriptKind.TS,
    );
    const variableInitializers = new Map<string, TypeScript.Expression>();
    const findings: TimingFinding[] = [];

    const recordVariables = (node: TypeScript.Node): void => {
      if (
        TypeScript.isVariableDeclaration(node) &&
        TypeScript.isIdentifier(node.name) &&
        node.initializer
      ) {
        variableInitializers.set(node.name.text, node.initializer);
      }
      TypeScript.forEachChild(node, recordVariables);
    };
    recordVariables(sourceFile);

    const lineNumberFor = (node: TypeScript.Node): number =>
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1;

    const callMemberName = (
      expression: TypeScript.LeftHandSideExpression,
    ): string | null => {
      if (TypeScript.isIdentifier(expression)) return expression.text;
      if (TypeScript.isPropertyAccessExpression(expression)) {
        return expression.name.text;
      }
      return null;
    };

    const expressionContainsClockSubtraction = (
      expression: TypeScript.Expression,
      visitedIdentifiers = new Set<string>(),
    ): boolean => {
      if (TypeScript.isIdentifier(expression)) {
        if (visitedIdentifiers.has(expression.text)) return false;
        const initializer = variableInitializers.get(expression.text);
        if (!initializer) return false;
        visitedIdentifiers.add(expression.text);
        return expressionContainsClockSubtraction(
          initializer,
          visitedIdentifiers,
        );
      }
      if (
        TypeScript.isBinaryExpression(expression) &&
        expression.operatorToken.kind === TypeScript.SyntaxKind.MinusToken
      ) {
        let containsClockRead = false;
        const findClockRead = (node: TypeScript.Node): void => {
          if (
            TypeScript.isCallExpression(node) &&
            TypeScript.isPropertyAccessExpression(node.expression) &&
            (node.expression.expression.getText(sourceFile) === 'performance' ||
              node.expression.expression.getText(sourceFile) === 'Date') &&
            node.expression.name.text === 'now'
          ) {
            containsClockRead = true;
          }
          TypeScript.forEachChild(node, findClockRead);
        };
        findClockRead(expression);
        if (containsClockRead) return true;
      }
      let nestedClockSubtraction = false;
      TypeScript.forEachChild(expression, (child) => {
        if (
          TypeScript.isExpression(child) &&
          expressionContainsClockSubtraction(child, visitedIdentifiers)
        ) {
          nestedClockSubtraction = true;
        }
      });
      return nestedClockSubtraction;
    };

    const expressionOriginatesFromCompletedFrames = (
      expression: TypeScript.Expression,
      visitedIdentifiers = new Set<string>(),
    ): boolean => {
      if (TypeScript.isIdentifier(expression)) {
        if (visitedIdentifiers.has(expression.text)) return false;
        const initializer = variableInitializers.get(expression.text);
        if (!initializer) return false;
        visitedIdentifiers.add(expression.text);
        return expressionOriginatesFromCompletedFrames(
          initializer,
          visitedIdentifiers,
        );
      }
      return (
        TypeScript.isCallExpression(expression) &&
        callMemberName(expression.expression) ===
          'completedFrameObservationsSince'
      );
    };

    const isFilteredCompletedFrameAbsence = (
      expression: TypeScript.Expression,
    ): boolean => {
      if (
        !TypeScript.isBinaryExpression(expression) ||
        expression.operatorToken.kind !==
          TypeScript.SyntaxKind.EqualsEqualsEqualsToken ||
        !TypeScript.isNumericLiteral(expression.right) ||
        expression.right.text !== '0' ||
        !TypeScript.isPropertyAccessExpression(expression.left) ||
        expression.left.name.text !== 'length' ||
        !TypeScript.isIdentifier(expression.left.expression)
      ) {
        return false;
      }
      const filteredInitializer = variableInitializers.get(
        expression.left.expression.text,
      );
      return Boolean(
        filteredInitializer &&
        TypeScript.isCallExpression(filteredInitializer) &&
        TypeScript.isPropertyAccessExpression(filteredInitializer.expression) &&
        filteredInitializer.expression.name.text === 'filter' &&
        expressionOriginatesFromCompletedFrames(
          filteredInitializer.expression.expression,
        ),
      );
    };

    const visit = (node: TypeScript.Node): void => {
      if (TypeScript.isCallExpression(node)) {
        const memberName = callMemberName(node.expression);
        if (
          memberName === 'assertNoCompleteFrameEmittedFor' ||
          memberName === 'awaitFrameSilence'
        ) {
          findings.push({
            lineNumber: lineNumberFor(node),
            reason: 'a frame-silence interval determines a blocking verdict',
          });
        }
        if (memberName === 'requireCondition') {
          const condition = node.arguments[0];
          if (condition && expressionContainsClockSubtraction(condition)) {
            findings.push({
              lineNumber: lineNumberFor(node),
              reason: 'a clock-derived duration determines a blocking verdict',
            });
          }
          if (condition && isFilteredCompletedFrameAbsence(condition)) {
            findings.push({
              lineNumber: lineNumberFor(node),
              reason:
                'an absence claim over observed completed frames determines a blocking verdict',
            });
          }
        }
        if (
          memberName === 'expect' &&
          node.arguments.some((argument) =>
            expressionContainsClockSubtraction(argument),
          )
        ) {
          findings.push({
            lineNumber: lineNumberFor(node),
            reason: 'a clock-derived duration enters a blocking expectation',
          });
        }
      }
      TypeScript.forEachChild(node, visit);
    };
    visit(sourceFile);
    return findings;
  }

  static verifyMatcherControls(): void {
    const preConvergenceSource = `
      const tasksWatchObservations = driver.completedFrameObservationsSince(0);
      const unsafeTasksWatchFrames = tasksWatchObservations.filter(
        (observation) => !observation.snapshot.findText('painted'),
      );
      HarnessSmoke.Class.requireCondition(
        unsafeTasksWatchFrames.length === 0,
        'no blank observed frame',
      );
    `;
    const convergenceSource = `
      const tasksWatchObservations = driver.completedFrameObservationsSince(0);
      let trailingBlankFrameCount = 0;
      for (let observationIndex = tasksWatchObservations.length - 1; observationIndex >= 0; observationIndex -= 1) {
        if (tasksWatchObservations[observationIndex].snapshot.findText('painted')) break;
        trailingBlankFrameCount += 1;
      }
      HarnessSmoke.Class.requireCondition(
        trailingBlankFrameCount === 0,
        'observed frames converge to painted content',
      );
    `;
    const reportOnlyDurationSource = `
      const elapsedMilliseconds = performance.now() - startedMilliseconds;
      console.log(elapsedMilliseconds);
    `;
    const preConvergenceFindings = this.inspectSourceText(
      preConvergenceSource,
      'pre-convergence-positive-control.ts',
    );
    if (preConvergenceFindings.length !== 1) {
      throw new Error(
        'Smoke timing classification failed its positive control: the pre-convergence observed-frame absence claim was not flagged exactly once.',
      );
    }
    if (
      this.inspectSourceText(
        convergenceSource,
        'convergence-negative-control.ts',
      ).length !== 0
    ) {
      throw new Error(
        'Smoke timing classification failed its negative control: the current convergence claim was flagged.',
      );
    }
    if (
      this.inspectSourceText(
        reportOnlyDurationSource,
        'report-only-duration-negative-control.ts',
      ).length !== 0
    ) {
      throw new Error(
        'Smoke timing classification failed its report-only control: a nonblocking duration report was flagged.',
      );
    }
  }

  static run(sourcePaths: readonly string[]): void {
    this.verifyMatcherControls();
    if (sourcePaths.length === 0) {
      throw new Error(
        'Smoke timing classification inspected no sources. Pass the registered blocking smoke source paths.',
      );
    }
    let findingCount = 0;
    for (const sourcePath of sourcePaths) {
      const findings = this.inspectSourceText(
        readFileSync(sourcePath, 'utf8'),
        sourcePath,
      );
      for (const finding of findings) {
        console.error(`${sourcePath}:${finding.lineNumber}: ${finding.reason}`);
        findingCount += 1;
      }
    }
    if (findingCount > 0) {
      throw new Error(
        `Smoke timing classification found ${findingCount} timing-sensitive blocking claim(s).`,
      );
    }
    console.log(
      `Smoke timing classification inspected ${sourcePaths.length} source(s). ` +
        'The pre-convergence control was red, and the current convergence control stayed silent.',
    );
  }
}

SmokeTimingClassification.run(process.argv.slice(2));
