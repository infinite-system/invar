import { createHash } from 'node:crypto';
import { dirname, normalize, posix, resolve } from 'node:path';
import type {
  AnnotationReference,
  ContractParseIssue,
  ContractParseResult,
  InvariantKind,
  InvariantRecord,
  LatticeComposition,
  LatticeDependency,
} from './types';

const REALITY_HEADING = '## Reality-based invariants';
const CHOSEN_HEADING = '## Chosen invariants';
const CHOSEN_HEADING_ALIAS = '## Designed invariants';
const RECORD_HEADING_PATTERN = /^### (.*\S)$/;
const FIELD_PATTERN = /^(?:-\s+)?\*\*?([^*:]+):\*\*?\s*(.*)$/;
const ANNOTATION_PATTERN =
  /invariant:\s*([^(\n]+?)\s*\(([^)\n]*\.invariants\.md)\)/g;
const REQUIRED_FIELDS = [
  'Invariant',
  'Scope',
  'Mechanism',
  'Evidence',
  'Impossible if true',
  'Verification',
  'Status',
  'Last refined',
] as const;
const OPTIONAL_FIELDS = [
  'Renegotiable at',
  'Components',
  'Generates',
  'Rejected alternatives',
  'Open question',
  'Enforcement',
] as const;
const ALLOWED_FIELDS = new Set<string>([
  ...REQUIRED_FIELDS,
  ...OPTIONAL_FIELDS,
]);
const ALLOWED_STATUSES = new Set(['established', 'provisional']);
const DATE_PATTERN = /^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

interface MaskedDocument {
  lines: string[];
  activeLines: boolean[];
}

interface ParsedRecord {
  name: string;
  line: number;
  fields: Record<string, string>;
  kind: InvariantKind;
}

interface MarkdownLink {
  text: string;
  target: string;
}

export function normalizeContractText(source: string): string {
  return source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export function slugifyInvariantName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .replace(/ /g, '-');
}

export function recordKey(contractPath: string, name: string): string {
  return `${contractPath}#${slugifyInvariantName(name)}`;
}

export function recordVersionIdentifier(
  contractPath: string,
  name: string,
  fields: Record<string, string>,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ contractPath, name, fields }))
    .digest('hex')
    .slice(0, 16);
}

export function recordSemanticFingerprint(
  record: Pick<InvariantRecord, 'fields'>,
): string {
  const loadBearingFields = [
    'Invariant',
    'Scope',
    'Mechanism',
    'Generates',
    'Impossible if true',
  ];
  return loadBearingFields
    .map((fieldName) => record.fields[fieldName] ?? '')
    .join(' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function maskInertContent(source: string): MaskedDocument {
  const lines = normalizeContractText(source).split('\n');
  const activeLines = new Array<boolean>(lines.length).fill(true);
  let fenceMarker: string | null = null;
  let insideComment = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    if (fenceMarker) {
      activeLines[lineIndex] = false;
      if (line.trimStart().startsWith(fenceMarker)) fenceMarker = null;
      continue;
    }
    const fenceMatch = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (fenceMatch && !insideComment) {
      fenceMarker = fenceMatch[2]!;
      activeLines[lineIndex] = false;
      continue;
    }
    if (insideComment) {
      activeLines[lineIndex] = false;
      if (line.includes('-->')) insideComment = false;
      continue;
    }
    if (!line.includes('<!--')) continue;
    const withoutClosedComments = line.replace(/<!--.*?-->/g, (comment) =>
      ' '.repeat(comment.length),
    );
    if (withoutClosedComments.includes('<!--')) {
      lines[lineIndex] = withoutClosedComments.slice(
        0,
        withoutClosedComments.indexOf('<!--'),
      );
      insideComment = true;
    } else {
      lines[lineIndex] = withoutClosedComments;
    }
  }
  return { lines, activeLines };
}

function sectionBounds(document: MaskedDocument): {
  realityStart: number;
  realityEnd: number;
  chosenStart: number;
  chosenEnd: number;
} | null {
  const realityLines: number[] = [];
  const chosenLines: number[] = [];
  document.lines.forEach((line, lineIndex) => {
    if (!document.activeLines[lineIndex]) return;
    const trimmedLine = line.trim();
    if (trimmedLine === REALITY_HEADING) realityLines.push(lineIndex);
    if (
      trimmedLine === CHOSEN_HEADING ||
      trimmedLine === CHOSEN_HEADING_ALIAS
    ) {
      chosenLines.push(lineIndex);
    }
  });
  if (
    realityLines.length !== 1 ||
    chosenLines.length !== 1 ||
    realityLines[0]! >= chosenLines[0]!
  ) {
    return null;
  }
  let chosenEnd = document.lines.length;
  for (
    let lineIndex = chosenLines[0]! + 1;
    lineIndex < document.lines.length;
    lineIndex++
  ) {
    if (
      document.activeLines[lineIndex] &&
      document.lines[lineIndex]!.startsWith('## ')
    ) {
      chosenEnd = lineIndex;
      break;
    }
  }
  return {
    realityStart: realityLines[0]! + 1,
    realityEnd: chosenLines[0]!,
    chosenStart: chosenLines[0]! + 1,
    chosenEnd,
  };
}

function parseSection(
  document: MaskedDocument,
  startLine: number,
  endLine: number,
  realityBased: boolean,
): ParsedRecord[] {
  const records: ParsedRecord[] = [];
  let lineIndex = startLine;
  while (lineIndex < endLine) {
    if (
      !document.activeLines[lineIndex] ||
      !document.lines[lineIndex]!.startsWith('### ')
    ) {
      lineIndex++;
      continue;
    }
    const headingMatch = RECORD_HEADING_PATTERN.exec(
      document.lines[lineIndex]!,
    );
    if (!headingMatch) {
      lineIndex++;
      continue;
    }
    const record: ParsedRecord = {
      name: headingMatch[1]!.trim(),
      line: lineIndex + 1,
      fields: {},
      kind: realityBased ? 'reality-absolute' : 'chosen',
    };
    lineIndex++;
    let currentField: string | null = null;
    while (
      lineIndex < endLine &&
      !(
        document.activeLines[lineIndex] &&
        (document.lines[lineIndex]!.startsWith('### ') ||
          document.lines[lineIndex]!.startsWith('## '))
      )
    ) {
      if (document.activeLines[lineIndex]) {
        const trimmedLine = document.lines[lineIndex]!.trim();
        const fieldMatch = FIELD_PATTERN.exec(trimmedLine);
        if (fieldMatch) {
          currentField = fieldMatch[1]!.trim();
          record.fields[currentField] = fieldMatch[2]!.trim();
        } else if (trimmedLine && currentField) {
          record.fields[currentField] =
            `${record.fields[currentField]} ${trimmedLine}`.trim();
        }
      }
      lineIndex++;
    }
    if (realityBased && record.fields['Renegotiable at']) {
      record.kind = 'reality-renegotiable';
    }
    records.push(record);
  }
  return records;
}

export function parseContract(
  contractPath: string,
  source: string,
): ContractParseResult {
  const document = maskInertContent(source);
  const bounds = sectionBounds(document);
  const issues: ContractParseIssue[] = [];
  if (!bounds) {
    return {
      records: [],
      issues: [
        {
          contractPath,
          message:
            'The checker cannot find one ordered reality section and one chosen section.',
        },
      ],
    };
  }
  const parsedRecords = [
    ...parseSection(document, bounds.realityStart, bounds.realityEnd, true),
    ...parseSection(document, bounds.chosenStart, bounds.chosenEnd, false),
  ];
  const seenNames = new Set<string>();
  const namesBySlug = new Map<string, string>();
  const records = parsedRecords.map((parsedRecord) => {
    if (seenNames.has(parsedRecord.name)) {
      issues.push({
        contractPath,
        message: `${parsedRecord.name} is a duplicate invariant name.`,
      });
    }
    seenNames.add(parsedRecord.name);
    const slug = slugifyInvariantName(parsedRecord.name);
    const nameForSlug = namesBySlug.get(slug);
    if (nameForSlug && nameForSlug !== parsedRecord.name) {
      issues.push({
        contractPath,
        message: `${parsedRecord.name} collides with ${nameForSlug} at #${slug}.`,
      });
    }
    namesBySlug.set(slug, parsedRecord.name);
    for (const fieldName of REQUIRED_FIELDS) {
      if (!parsedRecord.fields[fieldName]) {
        issues.push({
          contractPath,
          message: `${parsedRecord.name} has no ${fieldName} field.`,
        });
      }
    }
    for (const fieldName of Object.keys(parsedRecord.fields)) {
      if (!ALLOWED_FIELDS.has(fieldName)) {
        issues.push({
          contractPath,
          message: `${parsedRecord.name} has unknown field ${fieldName}.`,
        });
      }
    }
    if (
      parsedRecord.kind === 'chosen' &&
      parsedRecord.fields['Renegotiable at']
    ) {
      issues.push({
        contractPath,
        message: `${parsedRecord.name} puts Renegotiable at on a chosen record.`,
      });
    }
    const status = parsedRecord.fields.Status;
    if (status && !ALLOWED_STATUSES.has(status)) {
      issues.push({
        contractPath,
        message: `${parsedRecord.name} has invalid Status ${status}.`,
      });
    }
    const lastRefined = parsedRecord.fields['Last refined'];
    if (lastRefined && !DATE_PATTERN.test(lastRefined)) {
      issues.push({
        contractPath,
        message: `${parsedRecord.name} has an invalid Last refined date.`,
      });
    }
    const versionIdentifier = recordVersionIdentifier(
      contractPath,
      parsedRecord.name,
      parsedRecord.fields,
    );
    return {
      stableIdentifier: recordKey(contractPath, parsedRecord.name),
      versionIdentifier,
      contractPath,
      domain: contractPath.replace(/\.invariants\.md$/, ''),
      name: parsedRecord.name,
      slug,
      kind: parsedRecord.kind,
      line: parsedRecord.line,
      fields: parsedRecord.fields,
    };
  });
  return { records, issues };
}

function stripInlineCode(line: string): string {
  return line.replace(/`[^`]*`/g, (inlineCode) =>
    ' '.repeat(inlineCode.length),
  );
}

export function parseAnnotations(
  sourcePath: string,
  source: string,
  availableRecords: ReadonlyMap<string, InvariantRecord>,
): AnnotationReference[] {
  const document = maskInertContent(source);
  const annotations: AnnotationReference[] = [];
  document.lines.forEach((rawLine, lineIndex) => {
    if (!document.activeLines[lineIndex]) return;
    const line = stripInlineCode(rawLine);
    for (const match of line.matchAll(ANNOTATION_PATTERN)) {
      const recordName = match[1]!.trim();
      const contractPath = match[2]!.trim();
      annotations.push({
        sourcePath,
        line: lineIndex + 1,
        contractPath,
        recordName,
        resolved: availableRecords.has(recordKey(contractPath, recordName)),
      });
    }
  });
  return annotations;
}

function extractMarkdownLinks(
  source: string,
  definitionSource = source,
): MarkdownLink[] {
  const document = maskInertContent(source);
  const activeSource = document.lines
    .map((line, lineIndex) =>
      document.activeLines[lineIndex] ? stripInlineCode(line) : '',
    )
    .join('\n');
  const definitionDocument = maskInertContent(definitionSource);
  const activeDefinitionSource = definitionDocument.lines
    .map((line, lineIndex) =>
      definitionDocument.activeLines[lineIndex] ? stripInlineCode(line) : '',
    )
    .join('\n');
  const definitions = new Map<string, string>();
  for (const match of activeDefinitionSource.matchAll(
    /^[ \t]*\[([^\]]+)\]:\s*(?:<([^>\n]+)>|(\S+))(?:[ \t]+["'(].*)?$/gm,
  )) {
    definitions.set(match[1]!.toLowerCase(), (match[2] ?? match[3])!.trim());
  }
  const links: MarkdownLink[] = [];
  const linkTextPattern = '((?:[^\\[\\]]|\\[[^\\]]*\\])*)';
  const inlinePattern = new RegExp(
    `\\[${linkTextPattern}\\]\\((?:<([^>\\n]*)>|([^)\\s]+))\\)`,
    'g',
  );
  for (const match of activeSource.matchAll(inlinePattern)) {
    links.push({
      text: match[1]!.replace(/\s+/g, ' ').trim(),
      target: (match[2] ?? match[3])!.trim(),
    });
  }
  const referencePattern = new RegExp(
    `\\[${linkTextPattern}\\]\\[([^\\]]*)\\]`,
    'g',
  );
  for (const match of activeSource.matchAll(referencePattern)) {
    const text = match[1]!.replace(/\s+/g, ' ').trim();
    const referenceName = (match[2] || text).toLowerCase();
    const target = definitions.get(referenceName);
    if (target) links.push({ text, target });
  }
  return links;
}

function resolveContractLink(
  latticePath: string,
  target: string,
  availableRecords: ReadonlyMap<string, InvariantRecord>,
): string | null {
  let decodedTarget = target;
  try {
    decodedTarget = decodeURIComponent(target);
  } catch {
    decodedTarget = target;
  }
  if (!decodedTarget.includes('.invariants.md#')) return null;
  const [targetPath, anchor] = decodedTarget.split('#');
  if (!targetPath || !anchor) return null;
  const relativeTarget = normalize(
    posix.join(dirname(latticePath), targetPath),
  ).replaceAll('\\', '/');
  const candidatePaths = [relativeTarget, targetPath.replace(/^\.\//, '')];
  for (const candidatePath of candidatePaths) {
    const matchingRecord = [...availableRecords.values()].find(
      (record) =>
        record.contractPath === candidatePath && record.slug === anchor,
    );
    if (matchingRecord) return matchingRecord.stableIdentifier;
  }
  return null;
}

export function parseLatticeCompositions(
  latticePath: string,
  source: string,
  availableRecords: ReadonlyMap<string, InvariantRecord>,
): LatticeComposition[] {
  const document = maskInertContent(source);
  const compositions: LatticeComposition[] = [];
  let insideCompositions = false;
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const flushComposition = () => {
    if (!currentHeading) return;
    const body = currentLines.join('\n');
    const guaranteeMatch = /\*\*Guarantee:\*\*\s*([\s\S]*?)(?=\n\*\*|$)/.exec(
      body,
    );
    const memberIdentifiers = extractMarkdownLinks(body, source)
      .map((link) =>
        resolveContractLink(latticePath, link.target, availableRecords),
      )
      .filter((recordIdentifier): recordIdentifier is string =>
        Boolean(recordIdentifier),
      );
    if (memberIdentifiers.length) {
      compositions.push({
        identifier: `${latticePath}#${slugifyInvariantName(currentHeading)}`,
        latticePath,
        name: currentHeading,
        guarantee: guaranteeMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? '',
        memberIdentifiers: [...new Set(memberIdentifiers)],
      });
    }
    currentHeading = null;
    currentLines = [];
  };

  document.lines.forEach((line, lineIndex) => {
    if (!document.activeLines[lineIndex]) return;
    if (line.startsWith('## ')) {
      flushComposition();
      insideCompositions = /^## Compositions?\b/i.test(line);
      return;
    }
    if (insideCompositions && line.startsWith('### ')) {
      flushComposition();
      currentHeading = line.slice(4).trim();
      return;
    }
    if (currentHeading) currentLines.push(line);
  });
  flushComposition();
  return compositions;
}

export function parseLatticeDependencies(
  latticePath: string,
  source: string,
  availableRecords: ReadonlyMap<string, InvariantRecord>,
): LatticeDependency[] {
  const document = maskInertContent(source);
  const activeSource = document.lines
    .map((line, lineIndex) => (document.activeLines[lineIndex] ? line : ''))
    .join('\n');
  const dependencies: LatticeDependency[] = [];
  const seenDependencies = new Set<string>();
  for (const paragraph of activeSource.split(/\n\s*\n/)) {
    const dependencyPhrase = /\bstands?\s+on\b/i.exec(paragraph);
    if (!dependencyPhrase) continue;
    const sourcePart = paragraph.slice(0, dependencyPhrase.index);
    const targetPart = paragraph.slice(
      dependencyPhrase.index + dependencyPhrase[0].length,
    );
    const sourceIdentifiers = extractMarkdownLinks(sourcePart, source)
      .map((link) =>
        resolveContractLink(latticePath, link.target, availableRecords),
      )
      .filter((identifier): identifier is string => Boolean(identifier));
    const targetIdentifiers = extractMarkdownLinks(targetPart, source)
      .map((link) =>
        resolveContractLink(latticePath, link.target, availableRecords),
      )
      .filter((identifier): identifier is string => Boolean(identifier));
    for (const sourceIdentifier of sourceIdentifiers) {
      for (const targetIdentifier of targetIdentifiers) {
        if (sourceIdentifier === targetIdentifier) continue;
        const dependencyIdentifier = `${sourceIdentifier}->${targetIdentifier}`;
        if (seenDependencies.has(dependencyIdentifier)) continue;
        seenDependencies.add(dependencyIdentifier);
        dependencies.push({ sourceIdentifier, targetIdentifier });
      }
    }
  }
  return dependencies;
}

export function collectContractLinks(
  sourcePath: string,
  source: string,
  availableRecords: ReadonlyMap<string, InvariantRecord>,
): Array<{ sourceKey: string | null; targetKey: string }> {
  return extractMarkdownLinks(source)
    .map((link) => ({
      sourceKey: null,
      targetKey: resolveContractLink(sourcePath, link.target, availableRecords),
    }))
    .filter(
      (
        link,
      ): link is {
        sourceKey: null;
        targetKey: string;
      } => Boolean(link.targetKey),
    );
}

export function resolveRepositoryRelativePath(
  root: string,
  path: string,
): string {
  return resolve(root, path);
}
