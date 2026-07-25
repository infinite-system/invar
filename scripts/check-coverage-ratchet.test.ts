// The ratchet's own counting is what the gate trusts, so it is tested directly:
// miscounting in either direction defeats the point. Undercounting lets a deletion
// through; overcounting blocks honest refactors and trains people to edit the
// declaration file reflexively, which is the same as having no ratchet.
import { describe, expect, it } from 'bun:test';
import {
  classifyCoverageCall,
  countCoverageCalls,
  isCoverageBearingPath,
} from './check-coverage-ratchet';

describe('classifyCoverageCall', () => {
  it('separates calls that prove something from calls that wait', () => {
    expect(classifyCoverageCall('requireCondition')).toBe('assertion');
    expect(classifyCoverageCall('expect')).toBe('assertion');
    expect(classifyCoverageCall('assertNoCompleteFrameEmittedFor')).toBe(
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
