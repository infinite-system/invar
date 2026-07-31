import { describe, expect, test } from 'bun:test';
import { RecordList } from './RecordList';

describe('RecordList', () => {
  test('reports an empty focus without inventing rows', () => {
    const recordList = new RecordList.Class(
      {
        records: [],
        totalRecordCount: 0,
        contractPaths: [],
        selectedRecordIdentifier: null,
        searchQuery: '',
        selectedKind: '',
        selectedDomain: '',
        sortOrder: 'rank-descending',
        activeFocusChips: [],
        instrumentFocusLabel: 'Measure the instrument',
        isInstrumentFocused: false,
        instrumentRecordCount: 0,
      },
      () => undefined,
    );
    expect(recordList.recordRows).toEqual([]);
    expect(recordList.resultCount).toBe('0 of 0 records');
    expect(recordList.instrumentRecordSummary).toBe(
      'The instrument carries no record in this snapshot.',
    );
  });
});
