import { describe, expect, test } from 'bun:test';
import { TimelinePlayout } from './TimelinePlayout';
import type { InvariantSnapshot, RankedRecord } from './types';

describe('TimelinePlayout', () => {
  test('orders every distinct field event for one fixture transition', () => {
    const createRecord = (
      stableIdentifier: string,
      radius: number,
      rotPenalty = 0,
    ) =>
      ({
        stableIdentifier,
        versionIdentifier: `${stableIdentifier}-version`,
        contractPath: 'fixture.invariants.md',
        domain: 'fixture',
        name: stableIdentifier,
        slug: stableIdentifier,
        kind: 'chosen',
        fields: {},
        rank: 1 - radius,
        radius,
        rankComponents: {
          kind: 1,
          falsifiability: 1,
          evidence: 1,
          verification: 1,
          status: 1,
          generativity: 1,
          simplicity: 1,
          curvature: 1,
          annotations: 1,
          survival: 1,
          rotPenalty,
        },
        annotationCount: 1,
        orphanPressure: 0,
        incomingConnections: 0,
        outgoingConnections: 0,
        latticeMemberships: [],
        verificationMode: 'executed-pass',
        evidenceResolution: {
          referenced: 1,
          resolved: 1,
          unresolved: [],
        },
        ageInDays: 1,
        semanticChangeCount: 0,
      }) as RankedRecord;
    const beforeSnapshot = {
      records: [
        createRecord('removed', 0.5),
        createRecord('strengthened', 0.8),
        createRecord('weakened', 0.3),
        createRecord('rotted', 0.4),
      ],
    } as InvariantSnapshot;
    const afterSnapshot = {
      records: [
        createRecord('born', 0.7),
        createRecord('strengthened', 0.4),
        createRecord('weakened', 0.6),
        createRecord('rotted', 0.4, 0.2),
      ],
    } as InvariantSnapshot;

    const events = TimelinePlayout.Class.eventsBetween(
      beforeSnapshot,
      afterSnapshot,
    );

    expect(events.map((event) => event.type)).toEqual([
      'birth',
      'removed',
      'strengthen',
      'weaken',
      'rot',
    ]);
    expect(events.map((event) => event.recordIdentifier)).toEqual([
      'born',
      'removed',
      'strengthened',
      'weakened',
      'rotted',
    ]);
  });
});
