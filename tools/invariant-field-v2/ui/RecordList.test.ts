import { describe, expect, test } from 'bun:test';
import { RecordList } from './RecordList';
import type { InvariantSnapshot } from '../types';

describe('RecordList', () => {
  test('starts with all filters clear', () => {
    const recordList = new RecordList.Class(
      {
        snapshot: {
          records: [],
          compositions: [],
        } as unknown as InvariantSnapshot,
        selectedRecordIdentifier: null,
        selectedCompositionIdentifier: '',
      },
      () => undefined,
    );
    expect(recordList.searchQuery.value).toBe('');
    expect(recordList.selectedKind.value).toBe('');
    expect(recordList.selectedDomain.value).toBe('');
    expect(recordList.resultCount).toBe('0 of 0 records');
  });
});
