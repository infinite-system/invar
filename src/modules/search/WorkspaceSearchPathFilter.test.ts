import { describe, expect, test } from 'bun:test';
import { WorkspaceSearchPathFilter } from './WorkspaceSearchPathFilter';

describe('WorkspaceSearchPathFilter', () => {
  test('include globs allow first and exclude globs remove second', () => {
    const filter = new WorkspaceSearchPathFilter.Class(
      ['**/*.ts'],
      ['**/generated/**', '**/drop.ts'],
    );

    expect(filter.includes('src/keep.ts')).toBe(true);
    expect(filter.includes('src/drop.ts')).toBe(false);
    expect(filter.includes('src/generated/keep.ts')).toBe(false);
    expect(filter.includes('src/keep.txt')).toBe(false);
  });

  test('an empty include set allows every path not excluded', () => {
    const filter = new WorkspaceSearchPathFilter.Class([], ['*.log']);

    expect(filter.includes('README.md')).toBe(true);
    expect(filter.includes('debug.log')).toBe(false);
  });
});
