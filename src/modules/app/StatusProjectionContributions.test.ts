import { expect, test } from 'bun:test';
import { StatusProjectionContributions } from './StatusProjectionContributions';

test('status snapshot contributions merge at the host boundary', () => {
  const contributions = new StatusProjectionContributions.Class();
  contributions.register({ snapshot: () => ({ gitChangedCount: 3 }) });
  contributions.register({ snapshot: () => ({ currentLineBlameAuthor: 'A' }) });
  expect(contributions.snapshot()).toEqual({
    gitChangedCount: 3,
    currentLineBlameAuthor: 'A',
  });
});
