import { describe, expect, test } from 'bun:test';
import { calculateRank, type RankInput } from './Rank';
import type { InvariantRecord } from './types';

function record(
  overrides: Partial<InvariantRecord> = {},
  fieldOverrides: Record<string, string> = {},
): InvariantRecord {
  return {
    stableIdentifier: 'fixture.invariants.md#fixture',
    versionIdentifier: 'version',
    contractPath: 'fixture.invariants.md',
    domain: 'fixture',
    name: 'Fixture',
    slug: 'fixture',
    kind: 'reality-absolute',
    line: 1,
    fields: {
      Invariant:
        'One compact governing rule produces every stable fixture result.',
      Scope: 'The fixture.',
      Mechanism:
        'One shared generator accepts the input and produces all outputs.',
      Generates:
        'Stable output; shared behavior; one downstream representation.',
      Evidence: '`fixture.ts`',
      'Impossible if true':
        'The same fixed input produces two different observable results.',
      Verification: '`bun test fixture.test.ts`',
      Status: 'established',
      'Last refined': '2026-07-30',
      ...fieldOverrides,
    },
    ...overrides,
  };
}

function input(
  recordValue = record(),
  overrides: Partial<RankInput> = {},
): RankInput {
  return {
    record: recordValue,
    annotationCount: 8,
    maximumAnnotationCount: 10,
    orphanPressure: 0,
    incomingConnections: 5,
    outgoingConnections: 3,
    maximumConnectionCount: 10,
    latticeMemberships: ['fixture.lattice.md#composition'],
    verificationMode: 'executed-pass',
    evidenceResolution: {
      referenced: 1,
      resolved: 1,
      unresolved: [],
    },
    ageInDays: 90,
    maximumAgeInDays: 100,
    semanticChangeCount: 0,
    observedSnapshotCount: 20,
    ...overrides,
  };
}

describe('invariant rank', () => {
  test('puts a deep connected reality record inward of a thin provisional record', () => {
    const deep = calculateRank(input());
    const thinRecord = record(
      { kind: 'chosen' },
      {
        Mechanism: 'Unknown.',
        Generates: '',
        Evidence: '',
        'Impossible if true': 'Something goes wrong.',
        Verification: '',
        Status: 'provisional',
      },
    );
    const thin = calculateRank(
      input(thinRecord, {
        annotationCount: 0,
        incomingConnections: 0,
        outgoingConnections: 0,
        latticeMemberships: [],
        verificationMode: 'missing',
        evidenceResolution: {
          referenced: 0,
          resolved: 0,
          unresolved: [],
        },
        ageInDays: 0,
      }),
    );
    expect(deep.rank).toBeGreaterThan(thin.rank);
    expect(deep.radius).toBeLessThan(thin.radius);
    expect(deep.radius).toBeGreaterThan(0.1);
  });

  test('moves a record outward when evidence and verification rot', () => {
    const baseline = calculateRank(input());
    const plantedRot = calculateRank(
      input(record(), {
        verificationMode: 'missing',
        evidenceResolution: {
          referenced: 1,
          resolved: 0,
          unresolved: ['missing.ts'],
        },
      }),
    );
    expect(plantedRot.radius).toBeGreaterThan(baseline.radius);
  });

  test('moves inward as enforcement annotations grow', () => {
    const paperOnly = calculateRank(input(record(), { annotationCount: 0 }));
    const enforced = calculateRank(input(record(), { annotationCount: 10 }));
    expect(enforced.radius).toBeLessThan(paperOnly.radius);
  });

  test('makes connection density literal curvature', () => {
    const isolated = calculateRank(
      input(record(), {
        incomingConnections: 0,
        outgoingConnections: 0,
        latticeMemberships: [],
      }),
    );
    const connected = calculateRank(
      input(record(), {
        incomingConnections: 6,
        outgoingConnections: 4,
      }),
    );
    expect(connected.rankComponents.curvature).toBe(1);
    expect(connected.radius).toBeLessThan(isolated.radius);
  });

  test('does not award simplicity to a vacuous boundary', () => {
    const vacuousRecord = record(
      {},
      { 'Impossible if true': 'The invariant is violated.' },
    );
    const ranked = calculateRank(input(vacuousRecord));
    expect(ranked.rankComponents.falsifiability).toBe(0);
    expect(ranked.rankComponents.simplicity).toBe(0);
  });
});
