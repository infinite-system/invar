/**
 * Prove that planted contract rot moves one dot away from R.
 *
 * Run: bun tools/invariant-field-v2/calibrate.ts
 *
 * The script copies the current deepest record's contract to a private
 * temporary directory. It breaks only that copy's Evidence and Verification
 * fields, parses it again, and prints both radii. A larger planted radius
 * means the rank detects rot. The script removes its own scratch directory.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseContract } from './ContractParser';
import { calculateRank } from './Rank';
import {
  repositoryRootFromCurrentDirectory,
  resolveEvidence,
} from './RepositoryHistory';
import type {
  InvariantFieldStore,
  InvariantRecord,
  RankedRecord,
} from './types';

function replaceRecordField(
  source: string,
  recordName: string,
  fieldName: string,
  replacement: string,
): string {
  const escapedRecordName = recordName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const recordPattern = new RegExp(
    `(^### ${escapedRecordName}\\n[\\s\\S]*?)(?=^### |^## |(?![\\s\\S]))`,
    'm',
  );
  const recordMatch = recordPattern.exec(source);
  if (!recordMatch) throw new Error(`Cannot find ${recordName}.`);
  const changedRecord = recordMatch[1]!.replace(
    new RegExp(
      `(^-?\\s*\\*\\*?${escapedFieldName}:\\*\\*?\\s*)[\\s\\S]*?(?=\\n(?:-\\s+)?\\*\\*?[^*:]+:\\*\\*?)`,
      'm',
    ),
    `$1${replacement}`,
  );
  return (
    source.slice(0, recordMatch.index) +
    changedRecord +
    source.slice(recordMatch.index + recordMatch[1]!.length)
  );
}

function rankInput(
  record: InvariantRecord,
  rankedRecord: RankedRecord,
  records: RankedRecord[],
  evidenceTree: ReadonlyMap<string, string>,
) {
  return {
    record,
    annotationCount: rankedRecord.annotationCount,
    maximumAnnotationCount: Math.max(
      1,
      ...records.map((candidate) => candidate.annotationCount),
    ),
    orphanPressure: rankedRecord.orphanPressure,
    incomingConnections: rankedRecord.incomingConnections,
    outgoingConnections: rankedRecord.outgoingConnections,
    maximumConnectionCount: Math.max(
      1,
      ...records.map(
        (candidate) =>
          candidate.incomingConnections + candidate.outgoingConnections,
      ),
    ),
    latticeMemberships: rankedRecord.latticeMemberships,
    verificationMode: record.fields.Verification
      ? ('citation-only' as const)
      : ('missing' as const),
    evidenceResolution: resolveEvidence(record, evidenceTree),
    ageInDays: rankedRecord.ageInDays,
    maximumAgeInDays: Math.max(
      1,
      ...records.map((candidate) => candidate.ageInDays),
    ),
    semanticChangeCount: rankedRecord.semanticChangeCount,
    observedSnapshotCount: 1,
  };
}

const repositoryRoot = repositoryRootFromCurrentDirectory(process.cwd());
const storePath = join(
  repositoryRoot,
  'tools/invariant-field-v2/generated/invariant-field.json',
);
const store = JSON.parse(
  readFileSync(storePath, 'utf8'),
) as InvariantFieldStore;
const currentSnapshot = store.snapshots.at(-1)!;
const currentRecords = currentSnapshot.records.map((record) => ({
  ...record,
  ...store.recordVersions[record.versionIdentifier],
})) as RankedRecord[];
const deepestRecord = currentRecords.toSorted(
  (left, right) => right.rank - left.rank,
)[0]!;
const contractPath = join(repositoryRoot, deepestRecord.contractPath);
const originalSource = readFileSync(contractPath, 'utf8');
let plantedSource = replaceRecordField(
  originalSource,
  deepestRecord.name,
  'Evidence',
  '`missing/planted-rot-evidence.ts`',
);
plantedSource = replaceRecordField(
  plantedSource,
  deepestRecord.name,
  'Verification',
  '',
);

const scratchDirectory = mkdtempSync(
  join(tmpdir(), 'invariant-field-413-planted-rot-'),
);
const scratchPath = join(scratchDirectory, basename(contractPath));
try {
  writeFileSync(scratchPath, plantedSource);
  const parsed = parseContract(deepestRecord.contractPath, plantedSource);
  const plantedRecord = parsed.records.find(
    (record) => record.name === deepestRecord.name,
  );
  if (!plantedRecord) throw new Error('The scratch parser lost the record.');
  const trackedPaths = Bun.spawnSync({
    cmd: ['git', 'ls-files'],
    cwd: repositoryRoot,
  })
    .stdout.toString()
    .trim()
    .split('\n');
  const evidenceTree = new Map(
    trackedPaths.map((trackedPath) => [trackedPath, trackedPath]),
  );
  const baselineRank = calculateRank(
    rankInput(
      { ...deepestRecord, line: 0 },
      deepestRecord,
      currentRecords,
      evidenceTree,
    ),
  );
  const plantedRank = calculateRank(
    rankInput(plantedRecord, deepestRecord, currentRecords, evidenceTree),
  );
  console.log(`Record: ${deepestRecord.name}`);
  console.log(`Baseline radius: ${baselineRank.radius.toFixed(6)}`);
  console.log(`Planted-rot radius: ${plantedRank.radius.toFixed(6)}`);
  console.log(
    `Outward movement: ${(plantedRank.radius - baselineRank.radius).toFixed(6)}`,
  );
  if (plantedRank.radius <= baselineRank.radius) {
    throw new Error('Planted rot did not move the record outward.');
  }
} finally {
  rmSync(scratchDirectory, { recursive: true });
}
