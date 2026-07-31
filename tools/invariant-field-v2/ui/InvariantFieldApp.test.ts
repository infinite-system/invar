import { describe, expect, test } from 'bun:test';
import { InvariantFieldApp } from './InvariantFieldApp';
import { Instrument } from '../Instrument';
import type {
  InvariantFieldMetadata,
  InvariantSnapshot,
  RankedRecord,
} from '../types';

class $StoppedInvariantFieldApp extends InvariantFieldApp.$Class {
  override async start() {}
}

function fixtureRecord(
  stableIdentifier: string,
  name: string,
  contractPath: string,
  rank: number,
): RankedRecord {
  return {
    stableIdentifier,
    versionIdentifier: `${stableIdentifier}-version`,
    contractPath,
    domain: contractPath.replace('.invariants.md', ''),
    name,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    kind: 'chosen',
    fields: { Invariant: `${name} holds.` },
    rank,
    radius: 0.1 + 0.9 * Math.exp(-2.5 * rank),
    rankComponents: {
      kind: 0,
      falsifiability: 0,
      evidence: 0,
      verification: 0,
      status: 0,
      generativity: 0,
      simplicity: 0,
      curvature: 0,
      annotations: 0,
      survival: 0,
      rotPenalty: 0,
    },
    annotationCount: 0,
    orphanPressure: 0,
    incomingConnections: 0,
    outgoingConnections: 0,
    latticeMemberships: [],
    incomingRecordIdentifiers: [],
    outgoingRecordIdentifiers: [],
    siblingRecordIdentifiers: [],
    codeReferences: [],
    verificationMode: 'citation-only',
    evidenceResolution: { referenced: 0, resolved: 0, unresolved: [] },
    ageInDays: 1,
    semanticChangeCount: 0,
  };
}

const instrumentRecord = fixtureRecord(
  'instrument',
  'Rank is a pure function of tree and history',
  Instrument.Class.CONTRACT_PATH,
  0.9,
);
const otherRecord = fixtureRecord(
  'other',
  'Scroll frame cost is document length independent',
  'src/modules/ui/scroll.invariants.md',
  0.5,
);
const snapshot: InvariantSnapshot = {
  commit: 'commit',
  shortCommit: 'commit',
  committedAt: '2026-07-31T00:00:00Z',
  subject: 'Fixture snapshot',
  records: [instrumentRecord, otherRecord],
  compositions: [],
  annotationCount: 0,
  orphanCount: 0,
  parseIssues: [],
};

function snapshotMetadata(instrumentRecordCount: number) {
  return {
    commit: 'commit',
    shortCommit: 'commit',
    committedAt: '2026-07-31T00:00:00Z',
    subject: 'Fixture snapshot',
    recordCount: 2,
    instrumentRecordCount,
    annotationCount: 0,
    orphanCount: 0,
    parseIssueCount: 0,
  };
}

const metadata = {
  schemaVersion: 2,
  checkerVersion: '2.2.2',
  generatedAt: '2026-07-31T00:00:00Z',
  formula: {
    summary: 'fixture',
    weights: {
      kind: 0,
      falsifiability: 0,
      evidence: 0,
      verification: 0,
      status: 0,
      generativity: 0,
      simplicity: 0,
      curvature: 0,
      annotations: 0,
      survival: 0,
    },
    radius: 'fixture',
    rotPenalty: 'fixture',
  },
  snapshots: [snapshotMetadata(0), snapshotMetadata(1), snapshotMetadata(1)],
} as InvariantFieldMetadata;

function readyApp() {
  const invariantFieldApp = new $StoppedInvariantFieldApp();
  invariantFieldApp.metadata.value = metadata;
  invariantFieldApp.snapshot.value = snapshot;
  invariantFieldApp.snapshotIndex.value = 2;
  return invariantFieldApp;
}

describe('InvariantFieldApp', () => {
  test('starts with one empty reactive selection state', () => {
    const invariantFieldApp = new $StoppedInvariantFieldApp();
    expect(invariantFieldApp.isReady).toBe(false);
    expect(invariantFieldApp.selectedRecordIdentifier.value).toBeNull();
    expect(invariantFieldApp.selectedCompositionIdentifier.value).toBe('');
    expect(invariantFieldApp.searchQuery.value).toBe('');
    expect(invariantFieldApp.selectedKind.value).toBe('');
    expect(invariantFieldApp.selectedDomain.value).toBe('');
  });

  test('one focus fold serves the rail and the field', () => {
    const invariantFieldApp = readyApp();
    expect(invariantFieldApp.isFocused).toBe(false);
    expect(invariantFieldApp.focusedRecords).toHaveLength(2);

    invariantFieldApp.selectSearchQuery('scroll');
    expect(invariantFieldApp.isFocused).toBe(true);
    expect(
      invariantFieldApp.focusedRecords.map((record) => record.stableIdentifier),
    ).toEqual(['other']);
    expect(invariantFieldApp.focusedRecordIdentifiers.has('instrument')).toBe(
      false,
    );
    expect(invariantFieldApp.activeFocusChips.map((chip) => chip.key)).toEqual([
      'search',
    ]);

    invariantFieldApp.clearFocusChip('search');
    expect(invariantFieldApp.isFocused).toBe(false);
  });

  test('the instrument focus selects its own contract and its own birth', async () => {
    const invariantFieldApp = readyApp();
    expect(invariantFieldApp.instrumentBirthSnapshotIndex).toBe(1);
    expect(invariantFieldApp.instrumentRecordCount).toBe(1);
    expect(invariantFieldApp.instrumentFocusLabel).toBe(
      'Measure the instrument',
    );

    // loadSnapshot needs a server, so hold the snapshot still and check the
    // focus the button applies.
    invariantFieldApp.snapshotIndex.value =
      invariantFieldApp.instrumentBirthSnapshotIndex;
    await invariantFieldApp.focusInstrument();
    expect(invariantFieldApp.isInstrumentFocused).toBe(true);
    expect(
      invariantFieldApp.focusedRecords.map((record) => record.stableIdentifier),
    ).toEqual(['instrument']);
    expect(invariantFieldApp.instrumentFocusLabel).toBe(
      'Release the instrument',
    );

    await invariantFieldApp.focusInstrument();
    expect(invariantFieldApp.isInstrumentFocused).toBe(false);
    expect(invariantFieldApp.focusedRecords).toHaveLength(2);
  });
});
