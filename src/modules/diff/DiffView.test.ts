import { describe, expect, test } from 'bun:test';
import { DiffView } from './DiffView';
import type { DiffAlignmentResult } from './DiffAlignment';

describe('DiffView overview ruler projection', () => {
  test('separated change blocks land at the matching top middle and bottom track rows', () => {
    const alignedRows: DiffAlignmentResult['alignedRows'] = Array.from(
      { length: 100 },
      (_unused, alignedRowIndex) => ({
        kind:
          alignedRowIndex === 4
            ? 'modified'
            : alignedRowIndex === 50
              ? 'added'
              : alignedRowIndex === 95
                ? 'deleted'
                : 'equal',
        leftLineNumber: alignedRowIndex + 1,
        rightLineNumber: alignedRowIndex + 1,
      }),
    );
    const alignment: DiffAlignmentResult = {
      alignedRows,
      changeBlocks: [
        { startAlignedRowIndex: 4, endAlignedRowIndexExclusive: 5 },
        { startAlignedRowIndex: 50, endAlignedRowIndexExclusive: 51 },
        { startAlignedRowIndex: 95, endAlignedRowIndexExclusive: 96 },
      ],
    };

    const overviewKinds = DiffView.$Class.overviewKinds(alignment, 10);
    expect(overviewKinds).toEqual([
      'modified',
      null,
      null,
      null,
      null,
      'added',
      null,
      null,
      null,
      'deleted',
    ]);
  });

  test('unchanged bands stay unmarked and an empty track projects no cells', () => {
    const alignment: DiffAlignmentResult = {
      alignedRows: Array.from({ length: 20 }, (_unused, alignedRowIndex) => ({
        kind: 'equal',
        leftLineNumber: alignedRowIndex + 1,
        rightLineNumber: alignedRowIndex + 1,
      })),
      changeBlocks: [],
    };
    expect(DiffView.$Class.overviewKinds(alignment, 4)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(DiffView.$Class.overviewKinds(alignment, 0)).toEqual([]);
  });

  test('large overview projection is linear once and cached across frames', () => {
    const alignedRows: DiffAlignmentResult['alignedRows'] = Array.from(
      { length: 100_000 },
      (_unusedValue, alignedRowIndex) => ({
        kind: alignedRowIndex % 100 === 0 ? 'modified' : 'equal',
        leftLineNumber: alignedRowIndex + 1,
        rightLineNumber: alignedRowIndex + 1,
      }),
    );
    const rawChangeBlocks: DiffAlignmentResult['changeBlocks'] = Array.from(
      { length: 1_000 },
      (_unusedValue, changeBlockIndex) => ({
        startAlignedRowIndex: changeBlockIndex * 100,
        endAlignedRowIndexExclusive: changeBlockIndex * 100 + 1,
      }),
    );
    let indexedChangeBlockReads = 0;
    const changeBlocks = new Proxy(rawChangeBlocks, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) {
          indexedChangeBlockReads++;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const alignment: DiffAlignmentResult = {
      alignedRows,
      changeBlocks,
    };

    const firstProjection = DiffView.$Class.overviewKinds(alignment, 40);
    const readsAfterFirstProjection = indexedChangeBlockReads;
    const secondProjection = DiffView.$Class.overviewKinds(alignment, 40);

    expect(firstProjection).toEqual(secondProjection);
    expect(readsAfterFirstProjection).toBeLessThanOrEqual(
      rawChangeBlocks.length + 80,
    );
    expect(indexedChangeBlockReads).toBe(readsAfterFirstProjection);
  });
});
