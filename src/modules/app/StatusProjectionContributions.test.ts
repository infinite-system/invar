import { expect, test } from 'bun:test';
import { StatusProjectionContributions } from './StatusProjectionContributions';

test('status snapshot contributions are read live at the host boundary', () => {
  const contributions = new StatusProjectionContributions.Class();
  let changesScrollTop = 3;
  contributions.register({ snapshot: () => ({ changesScrollTop }) });
  contributions.register({ snapshot: () => ({ currentLineBlameAuthor: 'A' }) });
  expect(contributions.snapshot()).toEqual({
    changesScrollTop: 3,
    currentLineBlameAuthor: 'A',
  });

  changesScrollTop = 19;
  expect(contributions.snapshot()).toEqual({
    changesScrollTop: 19,
    currentLineBlameAuthor: 'A',
  });
});
