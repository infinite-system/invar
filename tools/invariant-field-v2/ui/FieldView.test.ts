import { describe, expect, test } from 'bun:test';
import { FieldView } from './FieldView';
import type { InvariantSnapshot } from '../types';

describe('FieldView', () => {
  test('keeps an empty snapshot as an empty field', () => {
    const fieldView = new FieldView.Class(
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
    expect(fieldView.fieldDots).toEqual([]);
    expect(fieldView.fieldSectors).toEqual([]);
    expect(fieldView.rankRings).toHaveLength(5);
  });
});
