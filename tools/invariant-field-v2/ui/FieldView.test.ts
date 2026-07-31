import { describe, expect, test } from 'bun:test';
import { FieldView } from './FieldView';
import type { InvariantSnapshot } from '../types';

describe('FieldView', () => {
  test('keeps an empty snapshot free of record marks', () => {
    const fieldView = new FieldView.Class(
      {
        snapshot: {
          records: [],
          compositions: [],
        } as unknown as InvariantSnapshot,
        selectedRecordIdentifier: null,
        selectedCompositionIdentifier: '',
        focusedRecordIdentifiers: new Set<string>(),
        isFocused: false,
      },
      () => undefined,
    );
    expect(fieldView.fieldDots).toEqual([]);
    expect(fieldView.fieldSectors).toHaveLength(8);
    expect(fieldView.rankRings).toHaveLength(5);
  });

  test('switches between exact 2D and constrained 3D', () => {
    const fieldView = new FieldView.Class(
      {
        snapshot: {
          records: [],
          compositions: [],
        } as unknown as InvariantSnapshot,
        selectedRecordIdentifier: null,
        selectedCompositionIdentifier: '',
        focusedRecordIdentifiers: new Set<string>(),
        isFocused: false,
      },
      () => undefined,
    );

    expect(fieldView.isThreeDimensional).toBe(true);
    fieldView.selectTwoDimensionalMode();
    expect(fieldView.isTwoDimensional).toBe(true);
    fieldView.selectThreeDimensionalMode();
    expect(fieldView.isThreeDimensional).toBe(true);
    expect(fieldView.cameraYawDegrees.value).toBe(0);
    expect(fieldView.cameraPitchDegrees.value).toBe(12);
  });

  test('keeps reduced motion in exact 2D', () => {
    class $ReducedMotionFieldView extends FieldView.$Class {
      protected override get systemPrefersReducedMotion() {
        return true;
      }
    }
    const fieldView = new $ReducedMotionFieldView(
      {
        snapshot: {
          records: [],
          compositions: [],
        } as unknown as InvariantSnapshot,
        selectedRecordIdentifier: null,
        selectedCompositionIdentifier: '',
        focusedRecordIdentifiers: new Set<string>(),
        isFocused: false,
      },
      () => undefined,
    );

    expect(fieldView.isTwoDimensional).toBe(true);
    expect(fieldView.reducedMotion.value).toBe(true);
    fieldView.selectThreeDimensionalMode();
    expect(fieldView.isTwoDimensional).toBe(true);
  });
});
