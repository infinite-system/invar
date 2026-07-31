import { describe, expect, test } from 'bun:test';
import { RecordLens, type RecordLensEmits } from './RecordLens';
import type {
  InvariantFieldMetadata,
  InvariantSnapshot,
  RankedRecord,
} from '../types';

function rankedRecord(
  stableIdentifier: string,
  name: string,
  contractPath = 'fixture.invariants.md',
): RankedRecord {
  return {
    stableIdentifier,
    versionIdentifier: `${stableIdentifier}-version`,
    contractPath,
    domain: contractPath.replace('.invariants.md', ''),
    name,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    kind: 'chosen',
    fields: {
      Invariant: `If ${name} applies, then the fixture stays stable.`,
      Scope: 'The fixture.',
      Mechanism: '`fixture.ts:2` owns the result.',
      Evidence: '`fixture.ts:3`',
      'Impossible if true': 'The fixture produces an unstable result.',
      Verification: 'Inspect the fixture.',
      Status: 'established',
      'Last refined': '2026-07-31',
    },
    rank: 0.5,
    radius: 0.3,
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
      rotPenalty: 0,
    },
    annotationCount: 1,
    orphanPressure: 0,
    incomingConnections: 1,
    outgoingConnections: 1,
    latticeMemberships: ['fixture.lattice.md#stable'],
    incomingRecordIdentifiers: ['incoming'],
    outgoingRecordIdentifiers: ['outgoing'],
    siblingRecordIdentifiers: ['sibling'],
    codeReferences: [
      {
        identifier: 'annotation:fixture.ts:2',
        source: 'annotation',
        label: 'invariant annotation',
        path: 'fixture.ts',
        line: 2,
        resolved: true,
      },
    ],
    verificationMode: 'executed-pass',
    evidenceResolution: {
      referenced: 1,
      resolved: 1,
      unresolved: [],
    },
    ageInDays: 1,
    semanticChangeCount: 0,
  };
}

const selectedRecord = rankedRecord('selected', 'Selected record');
const snapshot = {
  commit: 'commit',
  records: [
    selectedRecord,
    rankedRecord('incoming', 'Incoming record', 'other.invariants.md'),
    rankedRecord('outgoing', 'Outgoing record', 'other.invariants.md'),
    rankedRecord('sibling', 'Sibling record'),
  ],
  compositions: [
    {
      identifier: 'fixture.lattice.md#stable',
      latticePath: 'fixture.lattice.md',
      name: 'Stable composition',
      guarantee: 'Together these records keep the fixture stable.',
      memberIdentifiers: ['selected', 'sibling'],
    },
  ],
} as unknown as InvariantSnapshot;
const metadata = {
  formula: {
    weights: {},
  },
} as unknown as InvariantFieldMetadata;

describe('RecordLens', () => {
  test('exposes complete fields, relationships, and code references', () => {
    const selectedIdentifiers: string[] = [];
    const recordLens = new RecordLens.Class(
      { metadata, snapshot, selectedRecord },
      ((eventName: string, value?: string) => {
        if (eventName === 'select-record' && value) {
          selectedIdentifiers.push(value);
        }
      }) as RecordLensEmits,
    );
    expect(recordLens.essence).toContain('Selected record');
    expect(recordLens.fieldSections.map((field) => field.fieldName)).toContain(
      'Mechanism',
    );
    expect(recordLens.compositionRelationships[0]?.guarantee).toContain(
      'keep the fixture stable',
    );
    expect(recordLens.dependencyGroups).toHaveLength(2);
    expect(
      recordLens.siblingRecords.map((record) => record?.identifier),
    ).toEqual(['sibling']);
    expect(recordLens.codeReferences[0]?.locationLabel).toBe('fixture.ts:2');
    recordLens.selectRecord('sibling');
    expect(selectedIdentifiers).toEqual(['sibling']);
  });

  test('states an unresolved code reference without throwing', async () => {
    const recordLens = new RecordLens.Class(
      { metadata, snapshot, selectedRecord },
      (() => undefined) as RecordLensEmits,
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        Response.json(
          {
            resolved: false,
            reason: 'not-found',
            message: 'The cited file does not resolve in the repository.',
            path: 'missing.ts',
            line: 1,
          },
          { status: 404 },
        ),
      )) as unknown as typeof fetch;
    try {
      await recordLens.openCodeReference({
        identifier: 'evidence:missing.ts:1',
        source: 'evidence',
        label: 'missing.ts',
        path: 'missing.ts',
        line: 1,
        resolved: false,
      });
      expect(recordLens.codeLensResolved).toBe(false);
      expect(recordLens.codeLensErrorMessage).toBe(
        'The cited file does not resolve in the repository.',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
