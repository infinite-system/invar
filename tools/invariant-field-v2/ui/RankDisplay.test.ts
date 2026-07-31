import { describe, expect, test } from 'bun:test';
import { RankDisplay } from './RankDisplay';
import type { InvariantFieldMetadata } from '../types';

describe('RankDisplay', () => {
  test('shows every formula weight without a selection', () => {
    const rankDisplay = new RankDisplay.Class({
      metadata: {
        formula: {
          summary: 'fixture formula',
          weights: {
            kind: 0.14,
            falsifiability: 0.1,
            evidence: 0.12,
            verification: 0.09,
            status: 0.07,
            generativity: 0.11,
            simplicity: 0.08,
            curvature: 0.1,
            annotations: 0.09,
            survival: 0.1,
          },
        },
      } as InvariantFieldMetadata,
      selectedRecord: null,
    });
    expect(rankDisplay.formulaSummary).toBe('fixture formula');
    expect(rankDisplay.componentWeights).toHaveLength(10);
    expect(rankDisplay.hasSelectedRecord).toBe(false);
  });
});
