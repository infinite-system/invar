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

test('disposing a contribution omits its projected fields from status JSON', () => {
  const contributions = new StatusProjectionContributions.Class();
  const dispose = contributions.register({
    snapshot: () => ({ samplePluginValue: 'active' }),
  });
  expect(contributions.snapshot().samplePluginValue).toBe('active');

  dispose();

  const withdrawnSnapshot = contributions.snapshot();
  expect(withdrawnSnapshot).toEqual({
    samplePluginValue: undefined,
  });
  expect(JSON.parse(JSON.stringify(withdrawnSnapshot))).toEqual({});
});
