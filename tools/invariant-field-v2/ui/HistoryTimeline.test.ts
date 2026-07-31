import { describe, expect, test } from 'bun:test';
import { HistoryTimeline } from './HistoryTimeline';
import type { InvariantFieldMetadata } from '../types';

describe('HistoryTimeline', () => {
  test('describes the selected snapshot', () => {
    const metadata = {
      snapshots: [
        {
          shortCommit: '12345678',
          subject: 'Fixture snapshot',
          committedAt: '2026-07-31T00:00:00Z',
          recordCount: 2,
          annotationCount: 3,
          orphanCount: 0,
        },
      ],
    } as InvariantFieldMetadata;
    const historyTimeline = new HistoryTimeline.Class(
      { metadata, snapshotIndex: 0 },
      () => undefined,
    );
    expect(historyTimeline.title).toBe('12345678 · Fixture snapshot');
    expect(historyTimeline.isPreviousDisabled).toBe(true);
    expect(historyTimeline.isNextDisabled).toBe(true);
  });
});
