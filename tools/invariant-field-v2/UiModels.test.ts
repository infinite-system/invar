import { describe, expect, test } from 'bun:test';
import { FieldView } from './ui/FieldView';
import { HistoryTimeline } from './ui/HistoryTimeline';
import { RankDisplay } from './ui/RankDisplay';
import { RecordList } from './ui/RecordList';
import type {
  InvariantFieldMetadata,
  InvariantSnapshot,
  RankedRecord,
} from './types';

function rankedRecord(
  stableIdentifier: string,
  name: string,
  rank: number,
): RankedRecord {
  return {
    stableIdentifier,
    versionIdentifier: `${stableIdentifier}-version`,
    contractPath: 'fixture.invariants.md',
    domain: 'fixture',
    name,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    kind: 'reality-absolute',
    fields: {
      Invariant: `${name} remains true.`,
      Scope: 'The fixture.',
      Mechanism: 'One fixture generator owns the behavior.',
      Generates: 'One stable result.',
      Evidence: '`fixture.ts`',
      'Impossible if true': 'The fixed fixture produces a different result.',
      Verification: '`grep fixture fixture.ts`',
      Status: 'established',
      'Last refined': '2026-07-31',
    },
    rank,
    radius: 0.1 + 0.9 * Math.exp(-2.5 * rank),
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
    annotationCount: 2,
    orphanPressure: 0,
    incomingConnections: 1,
    outgoingConnections: 0,
    latticeMemberships: ['fixture.lattice.md#stable'],
    incomingRecordIdentifiers: [],
    outgoingRecordIdentifiers: [],
    siblingRecordIdentifiers: [],
    codeReferences: [],
    verificationMode: 'executed-pass',
    evidenceResolution: {
      referenced: 1,
      resolved: 1,
      unresolved: [],
    },
    ageInDays: 10,
    semanticChangeCount: 0,
  };
}

const firstRecord = rankedRecord('first', 'First record', 0.8);
const secondRecord = rankedRecord('second', 'Second record', 0.4);
const snapshot: InvariantSnapshot = {
  commit: 'commit',
  shortCommit: 'commit',
  committedAt: '2026-07-31T00:00:00Z',
  subject: 'Fixture snapshot',
  records: [firstRecord, secondRecord],
  compositions: [
    {
      identifier: 'fixture.lattice.md#stable',
      latticePath: 'fixture.lattice.md',
      name: 'Stable fixture',
      guarantee: 'The fixture remains stable.',
      memberIdentifiers: ['first'],
    },
  ],
  annotationCount: 4,
  orphanCount: 0,
  parseIssues: [],
};
const metadata: InvariantFieldMetadata = {
  schemaVersion: 1,
  checkerVersion: '2.2.2',
  generatedAt: '2026-07-31T00:00:00Z',
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
    radius: 'fixture radius',
    rotPenalty: 'fixture rot',
  },
  snapshots: [
    {
      commit: snapshot.commit,
      shortCommit: snapshot.shortCommit,
      committedAt: snapshot.committedAt,
      subject: snapshot.subject,
      recordCount: snapshot.records.length,
      annotationCount: snapshot.annotationCount,
      orphanCount: snapshot.orphanCount,
      parseIssueCount: 0,
    },
  ],
};

describe('ivue field models', () => {
  test('RecordList state drives search and ordering', () => {
    const records = new RecordList.Class(
      {
        snapshot,
        selectedRecordIdentifier: null,
        selectedCompositionIdentifier: '',
      },
      () => undefined,
    );
    expect(records.recordCards[0]?.identifier).toBe('first');
    records.searchQuery.value = 'second';
    expect(records.recordCards.map((card) => card.identifier)).toEqual([
      'second',
    ]);
  });

  test('FieldView lights every selected composition member', () => {
    const field = new FieldView.Class(
      {
        snapshot,
        selectedRecordIdentifier: null,
        selectedCompositionIdentifier: 'fixture.lattice.md#stable',
      },
      () => undefined,
    );
    const highlightedDots = field.fieldDots.filter((dot) =>
      dot.className.includes('record-mark-composition'),
    );
    expect(highlightedDots.map((dot) => dot.identifier)).toEqual(['first']);
  });

  test('HistoryTimeline emits bounded navigation', () => {
    const selectedSnapshots: number[] = [];
    const timeline = new HistoryTimeline.Class(
      { metadata, snapshotIndex: 0 },
      (eventName, snapshotIndex) => {
        void eventName;
        selectedSnapshots.push(snapshotIndex);
      },
    );
    expect(timeline.title).toContain('Fixture snapshot');
    timeline.selectPrevious();
    timeline.selectNext();
    expect(selectedSnapshots).toEqual([0, 0]);
  });

  test('RankDisplay exposes the complete selected calculation', () => {
    const rank = new RankDisplay.Class({
      metadata,
      selectedRecord: firstRecord,
    });
    expect(rank.hasSelectedRecord).toBe(true);
    expect(rank.calculationRows).toHaveLength(10);
    expect(rank.selectedRadius).toBe(firstRecord.radius.toFixed(3));
  });
});
