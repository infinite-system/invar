export type InvariantKind =
  'reality-absolute' | 'reality-renegotiable' | 'chosen';

export type VerificationMode =
  'executed-pass' | 'executed-fail' | 'citation-only' | 'missing';

export interface InvariantRecord {
  stableIdentifier: string;
  versionIdentifier: string;
  contractPath: string;
  domain: string;
  name: string;
  slug: string;
  kind: InvariantKind;
  line: number;
  fields: Record<string, string>;
}

export interface ContractParseIssue {
  contractPath: string;
  message: string;
}

export interface ContractParseResult {
  records: InvariantRecord[];
  issues: ContractParseIssue[];
}

export interface AnnotationReference {
  sourcePath: string;
  line: number;
  contractPath: string;
  recordName: string;
  resolved: boolean;
}

export interface LatticeComposition {
  identifier: string;
  latticePath: string;
  name: string;
  guarantee: string;
  memberIdentifiers: string[];
}

export interface LatticeDependency {
  sourceIdentifier: string;
  targetIdentifier: string;
}

export interface CitationResolution {
  referenced: number;
  resolved: number;
  unresolved: string[];
}

export type CodeReferenceSource = 'evidence' | 'mechanism' | 'annotation';

export interface CodeReference {
  identifier: string;
  source: CodeReferenceSource;
  label: string;
  path: string;
  line: number;
  resolved: boolean;
}

export interface RankComponents {
  kind: number;
  falsifiability: number;
  evidence: number;
  verification: number;
  status: number;
  generativity: number;
  simplicity: number;
  curvature: number;
  annotations: number;
  survival: number;
  rotPenalty: number;
}

export interface RankedRecord {
  stableIdentifier: string;
  versionIdentifier: string;
  contractPath: string;
  domain: string;
  name: string;
  slug: string;
  kind: InvariantKind;
  fields: Record<string, string>;
  rank: number;
  radius: number;
  rankComponents: RankComponents;
  annotationCount: number;
  orphanPressure: number;
  incomingConnections: number;
  outgoingConnections: number;
  latticeMemberships: string[];
  incomingRecordIdentifiers: string[];
  outgoingRecordIdentifiers: string[];
  siblingRecordIdentifiers: string[];
  codeReferences: CodeReference[];
  verificationMode: VerificationMode;
  evidenceResolution: CitationResolution;
  ageInDays: number;
  semanticChangeCount: number;
}

export interface InvariantSnapshot {
  commit: string;
  shortCommit: string;
  committedAt: string;
  subject: string;
  records: RankedRecord[];
  compositions: LatticeComposition[];
  annotationCount: number;
  orphanCount: number;
  parseIssues: ContractParseIssue[];
}

export interface StoredInvariantSnapshot extends Omit<
  InvariantSnapshot,
  'records'
> {
  records: Array<Omit<RankedRecord, 'fields'>>;
}

export interface InvariantFieldStore {
  schemaVersion: number;
  checkerVersion: string;
  generatedAt: string;
  repositoryRoot: string;
  formula: {
    summary: string;
    weights: Record<keyof Omit<RankComponents, 'rotPenalty'>, number>;
    radius: string;
    rotPenalty: string;
  };
  recordVersions: Record<
    string,
    {
      contractPath: string;
      name: string;
      fields: Record<string, string>;
    }
  >;
  snapshots: StoredInvariantSnapshot[];
}

export interface InvariantSnapshotMetadata {
  commit: string;
  shortCommit: string;
  committedAt: string;
  subject: string;
  recordCount: number;
  annotationCount: number;
  orphanCount: number;
  parseIssueCount: number;
}

export interface InvariantFieldMetadata {
  schemaVersion: number;
  checkerVersion: string;
  generatedAt: string;
  formula: InvariantFieldStore['formula'];
  snapshots: InvariantSnapshotMetadata[];
}
