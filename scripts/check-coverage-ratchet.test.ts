// The ratchet's own counting is what the gate trusts, so it is tested directly:
// miscounting in either direction defeats the point. Undercounting lets a deletion
// through; overcounting blocks honest refactors and trains people to edit the
// declaration file reflexively, which is the same as having no ratchet.
import { describe, expect, it } from 'bun:test';
import {
  classifyCoverageCall,
  compareAssertionTextReplacements,
  countCoverageCalls,
  evaluateCoverageDeclarations,
  formatAssertionTextReplacementCensus,
  isCoverageBearingPath,
  runCoverageCounterPositiveControl,
  type CoverageChange,
} from './check-coverage-ratchet';

describe('classifyCoverageCall', () => {
  it('separates calls that prove something from calls that wait', () => {
    expect(classifyCoverageCall('requireCondition')).toBe('assertion');
    expect(classifyCoverageCall('expect')).toBe('assertion');
    expect(classifyCoverageCall('assertContentInvariantAcrossAction')).toBe(
      'assertion',
    );
    expect(classifyCoverageCall('awaitStatus')).toBe('wait');
    expect(classifyCoverageCall('it')).toBe('wait');
  });

  it('ignores calls that carry no coverage', () => {
    expect(classifyCoverageCall('readFileSync')).toBeNull();
    expect(classifyCoverageCall('sendKeys')).toBeNull();
  });
});

describe('countCoverageCalls', () => {
  it('counts assertions and waits through a namespace seam', () => {
    const counts = countCoverageCalls(
      'smoke-example.ts',
      [
        "await HarnessSmoke.Class.awaitStatus(driver, path, 'ready', check);",
        "HarnessSmoke.Class.requireCondition(value === 1, 'value is one');",
        "HarnessSmoke.Class.pass('done');",
      ].join('\n'),
    );
    expect(counts).toEqual({ assertions: 2, waits: 1 });
  });

  // The whole reason for walking the AST instead of grepping: a floor inflated by a
  // mention in prose can never be met again, and a reviewer cannot tell an inflated
  // floor from a real one.
  it('does not count assertions named in comments or strings', () => {
    const counts = countCoverageCalls(
      'smoke-example.ts',
      [
        '// requireCondition(true) used to live here',
        "const note = 'call expect(value) later';",
        '/* expect(1) inside a block comment */',
      ].join('\n'),
    );
    expect(counts).toEqual({ assertions: 0, waits: 0 });
  });

  it('counts every occurrence, not every distinct name', () => {
    const counts = countCoverageCalls(
      'example.test.ts',
      [
        "it('a', () => { expect(1).toBe(1); expect(2).toBe(2); });",
        "it('b', () => { expect(3).toBe(3); });",
      ].join('\n'),
    );
    expect(counts).toEqual({ assertions: 3, waits: 2 });
  });
});

describe('coverage declarations', () => {
  const coverageDecrease: CoverageChange = {
    filePath: 'src/example.test.ts',
    baseCounts: { assertions: 5, waits: 2 },
    headCounts: { assertions: 4, waits: 2 },
    fileRemoved: false,
  };

  it('accepts a declaration whose before and after counts match', () => {
    const evaluation = evaluateCoverageDeclarations(
      [coverageDecrease],
      '| `src/example.test.ts` | assertions 5 → 4, waits 2 → 2. ' +
        'Removed a superseded assertion. |',
    );

    expect(evaluation.undeclaredDecreases).toEqual([]);
    expect(evaluation.declarationFailures).toEqual([]);
  });

  it('rejects wrong declared counts and names declared and actual figures', () => {
    const evaluation = evaluateCoverageDeclarations(
      [coverageDecrease],
      '| `src/example.test.ts` | assertions 5 → 3, waits 2 → 2. ' +
        'Removed a superseded assertion. |',
    );

    expect(evaluation.undeclaredDecreases).toEqual([]);
    expect(evaluation.declarationFailures).toHaveLength(1);
    const declarationFailure = evaluation.declarationFailures[0];
    if (declarationFailure === undefined) {
      throw new Error('expected one declaration failure');
    }
    expect(declarationFailure.message).toContain(
      'declares assertions 5 → 3, waits 2 → 2',
    );
    expect(declarationFailure.message).toContain(
      'actual counts are assertions 5 → 4, waits 2 → 2',
    );
  });
});

describe('assertion-text replacement census', () => {
  it('names the real assertion that disappeared and the padding that appeared', () => {
    const replacement = compareAssertionTextReplacements(
      'src/example.test.ts',
      "it('claim', () => { expect(measuredValue).toBe(expectedValue); });",
      "it('claim', () => { expect(true).toBe(true); });",
    );
    expect(replacement).not.toBeNull();

    const census = formatAssertionTextReplacementCensus([replacement!]);
    expect(census).toContain('informational only');
    expect(census).toContain(
      'disappeared: expect ( measuredValue ) . toBe ( expectedValue )',
    );
    expect(census).toContain('appeared: expect ( true ) . toBe ( true )');
  });

  it('prints no census noise for a whitespace-only reformat', () => {
    const replacement = compareAssertionTextReplacements(
      'src/example.test.ts',
      [
        "it('claim', () => {",
        '  expect(',
        '    measuredValue,',
        '  ).toBe(expectedValue);',
        '});',
      ].join('\n'),
      "it('claim', () => { expect(measuredValue).toBe(expectedValue); });",
    );

    expect(replacement).toBeNull();
    expect(formatAssertionTextReplacementCensus([])).toBe('');
  });
});

describe('coverage counter positive control', () => {
  it('counts the known fixture before repository inspection', () => {
    expect(runCoverageCounterPositiveControl()).toEqual({
      assertions: 2,
      waits: 2,
    });
  });
});

describe('isCoverageBearingPath', () => {
  it('covers colocated tests and harness smokes', () => {
    expect(isCoverageBearingPath('src/modules/git/GitBlame.test.ts')).toBe(
      true,
    );
    expect(
      isCoverageBearingPath('scripts/harness/smoke-git-blame-harness.ts'),
    ).toBe(true);
  });

  it('leaves production sources and harness plumbing out', () => {
    expect(isCoverageBearingPath('src/modules/git/GitBlame.ts')).toBe(false);
    expect(isCoverageBearingPath('scripts/harness/PtyTestDriver.ts')).toBe(
      false,
    );
  });
});
