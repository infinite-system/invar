import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import {
  collectContractLinks,
  parseContract,
  parseLatticeCompositions,
  parseLatticeDependencies,
  recordKey,
  recordSemanticFingerprint,
} from './ContractParser';
import { RANK_FORMULA_SUMMARY, RANK_WEIGHTS, calculateRank } from './Rank';
import type {
  AnnotationReference,
  CitationResolution,
  CodeReference,
  CodeReferenceSource,
  ContractParseIssue,
  InvariantFieldStore,
  InvariantRecord,
  InvariantSnapshot,
  LatticeComposition,
  VerificationMode,
} from './types';

const CONTRACT_SUFFIX = '.invariants.md';
const LATTICE_SUFFIX = '.lattice.md';
const ANNOTATION_PATTERN =
  /invariant:\s*([^(\n]+?)\s*\(([^)\n]*\.invariants\.md)\)/g;

interface HistoryCommit {
  commit: string;
  committedAt: string;
  subject: string;
  changes: HistoryChange[];
}

interface HistoryChange {
  status: string;
  previousPath?: string;
  path: string;
}

interface RecordHistory {
  firstSeenAt: string;
  semanticChangeCount: number;
  observedSnapshotCount: number;
  lastFingerprint: string;
}

interface SnapshotSource {
  commit: HistoryCommit;
  files: Map<string, string>;
  isCurrentTree: boolean;
}

interface AnnotationScan {
  annotations: AnnotationReference[];
  annotationsByRecord: Map<string, AnnotationReference[]>;
  countsByRecord: Map<string, number>;
  orphanCountsByContract: Map<string, number>;
}

interface ConnectionScan {
  incomingByRecord: Map<string, number>;
  outgoingByRecord: Map<string, number>;
  incomingIdentifiersByRecord: Map<string, string[]>;
  outgoingIdentifiersByRecord: Map<string, string[]>;
  membershipsByRecord: Map<string, string[]>;
  compositions: LatticeComposition[];
}

interface StableIdentityCandidate {
  previousRecord: InvariantRecord;
  score: number;
}

export interface StableIdentityAssignment {
  records: InvariantRecord[];
  matchedPreviousIdentifiers: Set<string>;
}

function runGit(repositoryRoot: string, argumentsList: string[]): string {
  const processResult = Bun.spawnSync({
    cmd: ['git', ...argumentsList],
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (processResult.exitCode !== 0) {
    throw new Error(
      `git ${argumentsList.join(' ')} failed: ${processResult.stderr.toString().trim()}`,
    );
  }
  return processResult.stdout.toString();
}

function tryGit(repositoryRoot: string, argumentsList: string[]): string {
  const processResult = Bun.spawnSync({
    cmd: ['git', ...argumentsList],
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return processResult.exitCode === 0 ? processResult.stdout.toString() : '';
}

function parseHistoryLog(output: string): HistoryCommit[] {
  const commits: HistoryCommit[] = [];
  let currentCommit: HistoryCommit | null = null;
  for (const line of output.split('\n')) {
    if (line.startsWith('@@@')) {
      const [commit, committedAt, ...subjectParts] = line.slice(3).split('\t');
      if (!commit || !committedAt) continue;
      currentCommit = {
        commit,
        committedAt,
        subject: subjectParts.join('\t'),
        changes: [],
      };
      commits.push(currentCommit);
      continue;
    }
    if (!currentCommit || !line.trim()) continue;
    const columns = line.split('\t');
    const status = columns[0]!;
    if (status.startsWith('R') && columns[1] && columns[2]) {
      currentCommit.changes.push({
        status,
        previousPath: columns[1],
        path: columns[2],
      });
    } else if (columns[1]) {
      currentCommit.changes.push({ status, path: columns[1] });
    }
  }
  return commits;
}

function listHistoryCommits(repositoryRoot: string): HistoryCommit[] {
  return parseHistoryLog(
    runGit(repositoryRoot, [
      'log',
      '--first-parent',
      '--reverse',
      '--format=@@@%H%x09%cI%x09%s',
      '--name-status',
      '--find-renames',
      '--',
      '*.invariants.md',
      '*.lattice.md',
    ]),
  );
}

function loadChangedFile(
  repositoryRoot: string,
  commit: string,
  path: string,
): string {
  return runGit(repositoryRoot, ['show', `${commit}:${path}`]);
}

function applyCommitChanges(
  repositoryRoot: string,
  files: Map<string, string>,
  commit: HistoryCommit,
): void {
  for (const change of commit.changes) {
    if (change.previousPath) files.delete(change.previousPath);
    if (change.status.startsWith('D')) {
      files.delete(change.path);
      continue;
    }
    files.set(
      change.path,
      loadChangedFile(repositoryRoot, commit.commit, change.path),
    );
  }
}

function currentTrackedFiles(repositoryRoot: string): Map<string, string> {
  const paths = runGit(repositoryRoot, [
    'ls-files',
    '*.invariants.md',
    '*.lattice.md',
  ])
    .split('\n')
    .filter(Boolean);
  return new Map(
    paths.map((path) => [
      path,
      readFileSync(join(repositoryRoot, path), 'utf8'),
    ]),
  );
}

function currentCommit(repositoryRoot: string): HistoryCommit {
  const [commit, committedAt, ...subjectParts] = runGit(repositoryRoot, [
    'show',
    '-s',
    '--format=%H%x09%cI%x09%s',
    'HEAD',
  ])
    .trim()
    .split('\t');
  return {
    commit: commit!,
    committedAt: committedAt!,
    subject: subjectParts.join('\t'),
    changes: [],
  };
}

function buildSnapshotSources(repositoryRoot: string): SnapshotSource[] {
  const files = new Map<string, string>();
  const snapshots: SnapshotSource[] = [];
  const commits = listHistoryCommits(repositoryRoot);
  for (const commit of commits) {
    applyCommitChanges(repositoryRoot, files, commit);
    snapshots.push({
      commit,
      files: new Map(files),
      isCurrentTree: false,
    });
  }
  const head = currentCommit(repositoryRoot);
  if (snapshots.at(-1)?.commit.commit !== head.commit) {
    snapshots.push({
      commit: head,
      files: currentTrackedFiles(repositoryRoot),
      isCurrentTree: true,
    });
  } else {
    snapshots[snapshots.length - 1] = {
      commit: head,
      files: currentTrackedFiles(repositoryRoot),
      isCurrentTree: true,
    };
  }
  return snapshots;
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .split(' ')
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function jaccardSimilarity(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (!union.size) return 0;
  let intersectionCount = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersectionCount++;
  }
  return intersectionCount / union.size;
}

export function assignStableIdentities(
  previousRecords: InvariantRecord[],
  nextRecords: InvariantRecord[],
): StableIdentityAssignment {
  const previousByCurrentKey = new Map(
    previousRecords.map((record) => [
      recordKey(record.contractPath, record.name),
      record,
    ]),
  );
  const matchedPreviousIdentifiers = new Set<string>();
  const unmatchedPrevious = new Set(previousRecords);
  const unmatchedNext: InvariantRecord[] = [];

  for (const record of nextRecords) {
    const previousRecord = previousByCurrentKey.get(
      recordKey(record.contractPath, record.name),
    );
    if (!previousRecord) {
      unmatchedNext.push(record);
      continue;
    }
    record.stableIdentifier = previousRecord.stableIdentifier;
    matchedPreviousIdentifiers.add(previousRecord.stableIdentifier);
    unmatchedPrevious.delete(previousRecord);
  }

  for (const nextRecord of unmatchedNext) {
    const nextFingerprint = recordSemanticFingerprint(nextRecord);
    const candidates: StableIdentityCandidate[] = [...unmatchedPrevious]
      .map((previousRecord) => ({
        previousRecord,
        score: jaccardSimilarity(
          recordSemanticFingerprint(previousRecord),
          nextFingerprint,
        ),
      }))
      .filter((candidate) => candidate.score >= 0.72)
      .sort((left, right) => right.score - left.score);
    const bestCandidate = candidates[0];
    const secondCandidate = candidates[1];
    if (
      bestCandidate &&
      (!secondCandidate || bestCandidate.score - secondCandidate.score >= 0.08)
    ) {
      nextRecord.stableIdentifier =
        bestCandidate.previousRecord.stableIdentifier;
      matchedPreviousIdentifiers.add(
        bestCandidate.previousRecord.stableIdentifier,
      );
      unmatchedPrevious.delete(bestCandidate.previousRecord);
    } else {
      nextRecord.stableIdentifier = createHash('sha256')
        .update(
          `${nextRecord.contractPath}\0${nextRecord.name}\0${nextRecord.versionIdentifier}`,
        )
        .digest('hex')
        .slice(0, 16);
    }
  }
  return { records: nextRecords, matchedPreviousIdentifiers };
}

function parseSnapshotContracts(
  files: ReadonlyMap<string, string>,
  previousRecords: InvariantRecord[],
): {
  records: InvariantRecord[];
  issues: ContractParseIssue[];
} {
  const records: InvariantRecord[] = [];
  const issues: ContractParseIssue[] = [];
  for (const [path, source] of files) {
    if (!path.endsWith(CONTRACT_SUFFIX)) continue;
    const parseResult = parseContract(path, source);
    records.push(...parseResult.records);
    issues.push(...parseResult.issues);
  }
  return {
    records: assignStableIdentities(previousRecords, records).records,
    issues,
  };
}

function gitTree(repositoryRoot: string, commit: string): Map<string, string> {
  const output = runGit(repositoryRoot, [
    'ls-tree',
    '-r',
    '--format=%(objectname)\t%(path)',
    commit,
  ]);
  return new Map(
    output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [objectName, ...pathParts] = line.split('\t');
        return [pathParts.join('\t'), objectName!] as const;
      }),
  );
}

function scanAnnotations(
  repositoryRoot: string,
  commit: string,
  records: InvariantRecord[],
): AnnotationScan {
  const availableRecords = new Map(
    records.map((record) => [
      recordKey(record.contractPath, record.name),
      record,
    ]),
  );
  const output = tryGit(repositoryRoot, [
    'grep',
    '-n',
    '-I',
    'invariant:',
    commit,
    '--',
    '.',
    ':(exclude).claude/**',
    ':(exclude).invar/**',
    ':(exclude)tmp/**',
    ':(exclude)agent-dispatches/**',
    ':(exclude)scripts/retired-smokes/**',
    ':(exclude)*.md',
    ':(exclude)**/*.md',
  ]);
  const annotations: AnnotationReference[] = [];
  for (const outputLine of output.split('\n')) {
    if (!outputLine) continue;
    const withoutCommit = outputLine.startsWith(`${commit}:`)
      ? outputLine.slice(commit.length + 1)
      : outputLine.replace(/^[^:]+:/, '');
    const lineMatch = /^(.+?):(\d+):(.*)$/.exec(withoutCommit);
    if (!lineMatch) continue;
    for (const annotationMatch of lineMatch[3]!.matchAll(ANNOTATION_PATTERN)) {
      const recordName = annotationMatch[1]!.trim();
      const contractPath = annotationMatch[2]!.trim();
      annotations.push({
        sourcePath: lineMatch[1]!,
        line: Number(lineMatch[2]),
        contractPath,
        recordName,
        resolved: availableRecords.has(recordKey(contractPath, recordName)),
      });
    }
  }
  const countsByRecord = new Map<string, number>();
  const annotationsByRecord = new Map<string, AnnotationReference[]>();
  const orphanCountsByContract = new Map<string, number>();
  for (const annotation of annotations) {
    if (annotation.resolved) {
      const record = availableRecords.get(
        recordKey(annotation.contractPath, annotation.recordName),
      )!;
      countsByRecord.set(
        record.stableIdentifier,
        (countsByRecord.get(record.stableIdentifier) ?? 0) + 1,
      );
      const recordAnnotations =
        annotationsByRecord.get(record.stableIdentifier) ?? [];
      recordAnnotations.push(annotation);
      annotationsByRecord.set(record.stableIdentifier, recordAnnotations);
    } else {
      orphanCountsByContract.set(
        annotation.contractPath,
        (orphanCountsByContract.get(annotation.contractPath) ?? 0) + 1,
      );
    }
  }
  return {
    annotations,
    annotationsByRecord,
    countsByRecord,
    orphanCountsByContract,
  };
}

export function scanConnections(
  files: ReadonlyMap<string, string>,
  records: InvariantRecord[],
): ConnectionScan {
  const availableRecords = new Map(
    records.map((record) => [
      recordKey(record.contractPath, record.name),
      record,
    ]),
  );
  const recordsByStableIdentifier = new Map(
    records.map((record) => [record.stableIdentifier, record]),
  );
  const incomingByRecord = new Map<string, number>();
  const outgoingByRecord = new Map<string, number>();
  const incomingIdentifiersByRecord = new Map<string, string[]>();
  const outgoingIdentifiersByRecord = new Map<string, string[]>();
  const membershipsByRecord = new Map<string, string[]>();
  const compositions: LatticeComposition[] = [];
  const connectRecords = (
    sourceRecordIdentifier: string,
    targetRecordIdentifier: string,
  ) => {
    const outgoingIdentifiers =
      outgoingIdentifiersByRecord.get(sourceRecordIdentifier) ?? [];
    if (outgoingIdentifiers.includes(targetRecordIdentifier)) return;
    outgoingIdentifiers.push(targetRecordIdentifier);
    outgoingIdentifiersByRecord.set(
      sourceRecordIdentifier,
      outgoingIdentifiers,
    );
    const incomingIdentifiers =
      incomingIdentifiersByRecord.get(targetRecordIdentifier) ?? [];
    incomingIdentifiers.push(sourceRecordIdentifier);
    incomingIdentifiersByRecord.set(
      targetRecordIdentifier,
      incomingIdentifiers,
    );
    outgoingByRecord.set(
      sourceRecordIdentifier,
      (outgoingByRecord.get(sourceRecordIdentifier) ?? 0) + 1,
    );
    incomingByRecord.set(
      targetRecordIdentifier,
      (incomingByRecord.get(targetRecordIdentifier) ?? 0) + 1,
    );
  };

  for (const record of records) {
    const links = collectContractLinks(
      record.contractPath,
      Object.values(record.fields).join('\n'),
      availableRecords,
    );
    for (const link of links) {
      const targetRecord = availableRecords.get(link.targetKey);
      if (!targetRecord) continue;
      connectRecords(record.stableIdentifier, targetRecord.stableIdentifier);
    }
  }

  for (const [path, source] of files) {
    if (!path.endsWith(LATTICE_SUFFIX)) continue;
    const parsedCompositions = parseLatticeCompositions(
      path,
      source,
      availableRecords,
    );
    const parsedDependencies = parseLatticeDependencies(
      path,
      source,
      availableRecords,
    );
    for (const dependency of parsedDependencies) {
      connectRecords(dependency.sourceIdentifier, dependency.targetIdentifier);
    }
    compositions.push(...parsedCompositions);
    for (const composition of parsedCompositions) {
      for (const memberIdentifier of composition.memberIdentifiers) {
        const memberRecord = recordsByStableIdentifier.get(memberIdentifier);
        if (!memberRecord) continue;
        const memberships =
          membershipsByRecord.get(memberRecord.stableIdentifier) ?? [];
        memberships.push(composition.identifier);
        membershipsByRecord.set(memberRecord.stableIdentifier, memberships);
        incomingByRecord.set(
          memberRecord.stableIdentifier,
          (incomingByRecord.get(memberRecord.stableIdentifier) ?? 0) + 1,
        );
      }
    }
  }
  return {
    incomingByRecord,
    outgoingByRecord,
    incomingIdentifiersByRecord,
    outgoingIdentifiersByRecord,
    membershipsByRecord,
    compositions,
  };
}

export function codeReferenceTargets(
  source: CodeReferenceSource,
  value: string,
): Array<Omit<CodeReference, 'identifier' | 'resolved'>> {
  const references: Array<Omit<CodeReference, 'identifier' | 'resolved'>> = [];
  const seenLocations = new Set<string>();
  const codePathPattern =
    /(?:^|[\s`("'[])((?:\.{0,2}\/)?(?:[\p{L}\p{N}_$.-]+\/)*[\p{L}\p{N}_$.-]+\.(?:ts|tsx|js|mjs|cjs|md|sh|py|go|rs|json|vue))(?::(\d+)(?:-\d+)?)?/gu;
  for (const match of value.matchAll(codePathPattern)) {
    const path = match[1]!;
    if (path.endsWith('.invariants.md') || path.endsWith('.lattice.md')) {
      continue;
    }
    const line = Number(match[2] ?? '1');
    const locationKey = `${path}:${line}`;
    if (seenLocations.has(locationKey)) continue;
    seenLocations.add(locationKey);
    references.push({
      source,
      label: match[0]!.trim().replace(/^[`("'[]+/, ''),
      path,
      line,
    });
  }
  return references;
}

function resolveCodeReference(
  record: InvariantRecord,
  reference: Omit<CodeReference, 'identifier' | 'resolved'>,
  tree: ReadonlyMap<string, string>,
  pathsByBasename: ReadonlyMap<string, string[]>,
): CodeReference {
  const contractRelativePath = posix.normalize(
    posix.join(dirname(record.contractPath), reference.path),
  );
  const basenameMatches =
    pathsByBasename.get(posix.basename(reference.path)) ?? [];
  const mayResolveByBasename = !reference.path.includes('/');
  const resolvedPath = tree.has(reference.path)
    ? reference.path
    : tree.has(contractRelativePath)
      ? contractRelativePath
      : mayResolveByBasename && basenameMatches.length === 1
        ? basenameMatches[0]!
        : reference.path;
  return {
    ...reference,
    identifier: `${reference.source}:${resolvedPath}:${reference.line}`,
    path: resolvedPath,
    resolved: tree.has(resolvedPath),
  };
}

function recordCodeReferences(
  record: InvariantRecord,
  tree: ReadonlyMap<string, string>,
  annotations: AnnotationScan,
  pathsByBasename: ReadonlyMap<string, string[]>,
): CodeReference[] {
  const citationReferences = [
    ...codeReferenceTargets('evidence', record.fields.Evidence ?? ''),
    ...codeReferenceTargets('mechanism', record.fields.Mechanism ?? ''),
  ].map((reference) =>
    resolveCodeReference(record, reference, tree, pathsByBasename),
  );
  const annotationReferences = (
    annotations.annotationsByRecord.get(record.stableIdentifier) ?? []
  ).map((annotation) => ({
    identifier: `annotation:${annotation.sourcePath}:${annotation.line}`,
    source: 'annotation' as const,
    label: `invariant: ${record.name}`,
    path: annotation.sourcePath,
    line: annotation.line,
    resolved: tree.has(annotation.sourcePath),
  }));
  return [...citationReferences, ...annotationReferences];
}

function citationTargets(value: string): string[] {
  const targets = new Set<string>();
  for (const match of value.matchAll(/`([^`]+)`/g)) {
    const token = match[1]!.split('#')[0]!.replace(/:[0-9-]+$/, '');
    if (
      /(?:^|\/)[^/\s]+\.(?:ts|tsx|js|mjs|cjs|md|sh|py|go|rs|json|vue)$/.test(
        token,
      )
    ) {
      targets.add(token);
    }
  }
  for (const match of value.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
    const target = match[1]!;
    if (!/^[a-z]+:/i.test(target)) targets.add(target);
  }
  return [...targets];
}

export function resolveEvidence(
  record: InvariantRecord,
  tree: ReadonlyMap<string, string>,
): CitationResolution {
  const targets = citationTargets(record.fields['Evidence'] ?? '');
  const unresolved = targets.filter((target) => {
    const contractRelativeTarget = posix.normalize(
      posix.join(dirname(record.contractPath), target),
    );
    return !tree.has(target) && !tree.has(contractRelativeTarget);
  });
  return {
    referenced: targets.length,
    resolved: targets.length - unresolved.length,
    unresolved,
  };
}

export function verificationMode(
  record: InvariantRecord,
  repositoryRoot: string,
  executeCheapCommands: boolean,
): VerificationMode {
  const verification = record.fields['Verification']?.trim() ?? '';
  if (!verification) return 'missing';
  if (!executeCheapCommands) return 'citation-only';
  const readOnlyCommand = [...verification.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1]!.trim())
    .find(
      (command) =>
        /^(?:grep|rg)\s/.test(command) &&
        !/[;&><\n]/.test(command) &&
        !/\$\(/.test(command) &&
        !/(?<!\\)\|/.test(command),
    );
  if (!readOnlyCommand) return 'citation-only';
  const result = Bun.spawnSync({
    cmd: ['bash', '-lc', readOnlyCommand],
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 2_000,
  });
  return result.exitCode === 0 ? 'executed-pass' : 'executed-fail';
}

function ageInDays(firstSeenAt: string, currentDate: string): number {
  return Math.max(
    0,
    (Date.parse(currentDate) - Date.parse(firstSeenAt)) / 86_400_000,
  );
}

function updateRecordHistory(
  histories: Map<string, RecordHistory>,
  record: InvariantRecord,
  committedAt: string,
): RecordHistory {
  const fingerprint = recordSemanticFingerprint(record);
  const existing = histories.get(record.stableIdentifier);
  if (!existing) {
    const created = {
      firstSeenAt: committedAt,
      semanticChangeCount: 0,
      observedSnapshotCount: 1,
      lastFingerprint: fingerprint,
    };
    histories.set(record.stableIdentifier, created);
    return created;
  }
  existing.observedSnapshotCount++;
  if (existing.lastFingerprint !== fingerprint) {
    existing.semanticChangeCount++;
    existing.lastFingerprint = fingerprint;
  }
  return existing;
}

function buildSnapshot(
  repositoryRoot: string,
  source: SnapshotSource,
  previousRecords: InvariantRecord[],
  histories: Map<string, RecordHistory>,
): InvariantSnapshot {
  const parsed = parseSnapshotContracts(source.files, previousRecords);
  const tree = gitTree(repositoryRoot, source.commit.commit);
  const pathsByBasename = new Map<string, string[]>();
  for (const path of tree.keys()) {
    const basename = posix.basename(path);
    const matchingPaths = pathsByBasename.get(basename) ?? [];
    matchingPaths.push(path);
    pathsByBasename.set(basename, matchingPaths);
  }
  const annotations = scanAnnotations(
    repositoryRoot,
    source.commit.commit,
    parsed.records,
  );
  const connections = scanConnections(source.files, parsed.records);
  const maximumAnnotationCount = Math.max(
    1,
    ...annotations.countsByRecord.values(),
  );
  const maximumConnectionCount = Math.max(
    1,
    ...parsed.records.map(
      (record) =>
        (connections.incomingByRecord.get(record.stableIdentifier) ?? 0) +
        (connections.outgoingByRecord.get(record.stableIdentifier) ?? 0),
    ),
  );
  const recordHistories = new Map<string, RecordHistory>();
  for (const record of parsed.records) {
    recordHistories.set(
      record.stableIdentifier,
      updateRecordHistory(histories, record, source.commit.committedAt),
    );
  }
  const maximumAgeInDays = Math.max(
    1,
    ...[...recordHistories.values()].map((history) =>
      ageInDays(history.firstSeenAt, source.commit.committedAt),
    ),
  );
  const rankedRecords = parsed.records.map((record) => {
    const history = recordHistories.get(record.stableIdentifier)!;
    return calculateRank({
      record,
      annotationCount:
        annotations.countsByRecord.get(record.stableIdentifier) ?? 0,
      maximumAnnotationCount,
      orphanPressure:
        annotations.orphanCountsByContract.get(record.contractPath) ?? 0,
      incomingConnections:
        connections.incomingByRecord.get(record.stableIdentifier) ?? 0,
      outgoingConnections:
        connections.outgoingByRecord.get(record.stableIdentifier) ?? 0,
      maximumConnectionCount,
      latticeMemberships:
        connections.membershipsByRecord.get(record.stableIdentifier) ?? [],
      incomingRecordIdentifiers:
        connections.incomingIdentifiersByRecord.get(record.stableIdentifier) ??
        [],
      outgoingRecordIdentifiers:
        connections.outgoingIdentifiersByRecord.get(record.stableIdentifier) ??
        [],
      siblingRecordIdentifiers: parsed.records
        .filter(
          (candidateRecord) =>
            candidateRecord.contractPath === record.contractPath &&
            candidateRecord.stableIdentifier !== record.stableIdentifier,
        )
        .map((candidateRecord) => candidateRecord.stableIdentifier),
      codeReferences: recordCodeReferences(
        record,
        tree,
        annotations,
        pathsByBasename,
      ),
      verificationMode: verificationMode(
        record,
        repositoryRoot,
        source.isCurrentTree,
      ),
      evidenceResolution: resolveEvidence(record, tree),
      ageInDays: ageInDays(history.firstSeenAt, source.commit.committedAt),
      maximumAgeInDays,
      semanticChangeCount: history.semanticChangeCount,
      observedSnapshotCount: history.observedSnapshotCount,
    });
  });
  return {
    commit: source.commit.commit,
    shortCommit: source.commit.commit.slice(0, 8),
    committedAt: source.commit.committedAt,
    subject: source.commit.subject,
    records: rankedRecords,
    compositions: connections.compositions,
    annotationCount: annotations.annotations.filter(
      (annotation) => annotation.resolved,
    ).length,
    orphanCount: annotations.annotations.filter(
      (annotation) => !annotation.resolved,
    ).length,
    parseIssues: parsed.issues,
  };
}

export function buildInvariantFieldStore(
  repositoryRoot: string,
  onProgress?: (message: string) => void,
): InvariantFieldStore {
  const checkerVersion = tryGit(repositoryRoot, [
    'show',
    'HEAD:.claude/skills/invariants/scripts/check_invariants.mjs',
  ]).match(/const VERSION = '([^']+)'/)?.[1];
  const sources = buildSnapshotSources(repositoryRoot);
  const snapshots: InvariantSnapshot[] = [];
  const histories = new Map<string, RecordHistory>();
  let previousRecords: InvariantRecord[] = [];
  sources.forEach((source, snapshotIndex) => {
    onProgress?.(
      `Snapshot ${snapshotIndex + 1}/${sources.length}: ${source.commit.commit.slice(0, 8)}`,
    );
    const snapshot = buildSnapshot(
      repositoryRoot,
      source,
      previousRecords,
      histories,
    );
    snapshots.push(snapshot);
    previousRecords = snapshot.records.map((record) => ({
      stableIdentifier: record.stableIdentifier,
      versionIdentifier: record.versionIdentifier,
      contractPath: record.contractPath,
      domain: record.domain,
      name: record.name,
      slug: record.slug,
      kind: record.kind,
      line: 0,
      fields: record.fields,
    }));
  });
  return {
    schemaVersion: 2,
    checkerVersion: checkerVersion ?? 'unknown',
    generatedAt: new Date().toISOString(),
    repositoryRoot,
    formula: {
      summary: RANK_FORMULA_SUMMARY,
      weights: RANK_WEIGHTS,
      radius: '0.10 + 0.90 × e^(-2.5 × depth). R stays unreachable.',
      rotPenalty:
        'Each orphaned annotation in a record domain subtracts 0.08, capped at 1.00.',
    },
    recordVersions: Object.fromEntries(
      snapshots.flatMap((snapshot) =>
        snapshot.records.map((record) => [
          record.versionIdentifier,
          {
            contractPath: record.contractPath,
            name: record.name,
            fields: record.fields,
          },
        ]),
      ),
    ),
    snapshots: snapshots.map((snapshot) => ({
      ...snapshot,
      records: snapshot.records.map(({ fields: _fields, ...record }) => record),
    })),
  };
}

export function repositoryRootFromCurrentDirectory(
  currentDirectory: string,
): string {
  const output = runGit(currentDirectory, ['rev-parse', '--show-toplevel']);
  return output.trim();
}

export function isGeneratedStoreCurrent(
  repositoryRoot: string,
  storePath: string,
): boolean {
  if (!existsSync(storePath)) return false;
  try {
    const store = JSON.parse(
      readFileSync(storePath, 'utf8'),
    ) as InvariantFieldStore;
    return (
      store.snapshots.at(-1)?.commit === currentCommit(repositoryRoot).commit &&
      (store.snapshots
        .at(-1)
        ?.records.every((record) => Array.isArray(record.codeReferences)) ??
        false)
    );
  } catch {
    return false;
  }
}

export function relativeStorePath(
  repositoryRoot: string,
  storePath: string,
): string {
  return relative(repositoryRoot, storePath);
}
