import type {
  CitationResolution,
  InvariantKind,
  InvariantRecord,
  RankComponents,
  RankedRecord,
  VerificationMode,
} from './types';

export const RANK_WEIGHTS = {
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
} as const;

export const RANK_FORMULA_SUMMARY =
  'depth = weighted structural evidence - rot; distance = 0.10 + 0.90 × e^(-2.5 × depth)';

export interface RankInput {
  record: InvariantRecord;
  annotationCount: number;
  maximumAnnotationCount: number;
  orphanPressure: number;
  incomingConnections: number;
  outgoingConnections: number;
  maximumConnectionCount: number;
  latticeMemberships: string[];
  verificationMode: VerificationMode;
  evidenceResolution: CitationResolution;
  ageInDays: number;
  maximumAgeInDays: number;
  semanticChangeCount: number;
  observedSnapshotCount: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function kindDepth(kind: InvariantKind): number {
  if (kind === 'reality-absolute') return 1;
  if (kind === 'reality-renegotiable') return 0.72;
  return 0.45;
}

function isNonVacuousBoundary(boundary: string): boolean {
  const normalizedBoundary = boundary.toLowerCase().trim();
  if (normalizedBoundary.length < 24) return false;
  return ![
    'the system behaves incorrectly',
    'the invariant is violated',
    'incorrect behavior',
    'something goes wrong',
  ].some((vacuousPhrase) => normalizedBoundary.includes(vacuousPhrase));
}

function verificationDepth(mode: VerificationMode): number {
  if (mode === 'executed-pass') return 1;
  if (mode === 'citation-only') return 0.55;
  return 0;
}

function logarithmicRatio(value: number, maximum: number): number {
  if (maximum <= 0 || value <= 0) return 0;
  return Math.log1p(value) / Math.log1p(maximum);
}

function tokenCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function simplicityDepth(
  record: InvariantRecord,
  latticeMembershipCount: number,
): number {
  const invariant = record.fields['Invariant']?.trim() ?? '';
  const mechanism = record.fields['Mechanism']?.trim() ?? '';
  const boundary = record.fields['Impossible if true']?.trim() ?? '';
  if (mechanism.length < 24 || !isNonVacuousBoundary(boundary) || !invariant) {
    return 0;
  }
  const generatedClaims = (record.fields['Generates'] ?? '')
    .split(/[;·]/)
    .map((claim) => claim.trim())
    .filter(Boolean).length;
  const outputBreadth = generatedClaims + latticeMembershipCount;
  if (!outputBreadth) return 0;
  const ruleTokens = tokenCount(`${invariant} ${mechanism}`);
  const compactness = 1 - Math.min(1, Math.max(0, ruleTokens - 30) / 170);
  const breadth = Math.min(1, outputBreadth / 6);
  return clamp(compactness * 0.45 + breadth * 0.55);
}

export function calculateRank(input: RankInput): RankedRecord {
  const totalConnections =
    input.incomingConnections + input.outgoingConnections;
  const evidence =
    input.evidenceResolution.referenced > 0
      ? input.evidenceResolution.resolved / input.evidenceResolution.referenced
      : 0;
  const generativityText = input.record.fields['Generates']?.trim() ?? '';
  const generativity =
    (generativityText.length >= 20 ? 0.65 : generativityText ? 0.35 : 0) +
    (input.latticeMemberships.length ? 0.35 : 0);
  const age =
    input.maximumAgeInDays > 0
      ? clamp(input.ageInDays / input.maximumAgeInDays)
      : 0;
  const changeRate =
    input.observedSnapshotCount > 0
      ? input.semanticChangeCount / input.observedSnapshotCount
      : 0;
  const stability = 1 / (1 + changeRate * 4);
  const components: RankComponents = {
    kind: kindDepth(input.record.kind),
    falsifiability: isNonVacuousBoundary(
      input.record.fields['Impossible if true'] ?? '',
    )
      ? 1
      : 0,
    evidence,
    verification: verificationDepth(input.verificationMode),
    status: input.record.fields['Status'] === 'established' ? 1 : 0.35,
    generativity: clamp(generativity),
    simplicity: simplicityDepth(input.record, input.latticeMemberships.length),
    curvature: logarithmicRatio(totalConnections, input.maximumConnectionCount),
    annotations: input.annotationCount
      ? logarithmicRatio(input.annotationCount, input.maximumAnnotationCount)
      : /review-time|no code locus/i.test(
            input.record.fields['Enforcement'] ?? '',
          )
        ? 0.35
        : 0,
    survival: age * stability,
    rotPenalty: clamp(input.orphanPressure * 0.08),
  };
  const weightedDepth = (
    Object.keys(RANK_WEIGHTS) as Array<keyof typeof RANK_WEIGHTS>
  ).reduce(
    (depth, componentName) =>
      depth + components[componentName] * RANK_WEIGHTS[componentName],
    0,
  );
  const rank = clamp(weightedDepth - components.rotPenalty);
  const radius = 0.1 + 0.9 * Math.exp(-2.5 * rank);
  return {
    stableIdentifier: input.record.stableIdentifier,
    versionIdentifier: input.record.versionIdentifier,
    contractPath: input.record.contractPath,
    domain: input.record.domain,
    name: input.record.name,
    slug: input.record.slug,
    kind: input.record.kind,
    fields: input.record.fields,
    rank,
    radius,
    rankComponents: components,
    annotationCount: input.annotationCount,
    orphanPressure: input.orphanPressure,
    incomingConnections: input.incomingConnections,
    outgoingConnections: input.outgoingConnections,
    latticeMemberships: input.latticeMemberships,
    verificationMode: input.verificationMode,
    evidenceResolution: input.evidenceResolution,
    ageInDays: input.ageInDays,
    semanticChangeCount: input.semanticChangeCount,
  };
}
