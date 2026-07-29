#!/usr/bin/env bun

// Check links in one task record before the record enters the task lifecycle.
//
// Run:
//   bun scripts/tasks/lint-task-links.ts <task-record.md>
//   bun scripts/tasks/lint-task-links.ts --fix <task-record.md>
//   bun scripts/tasks/lint-task-links.ts --base-directory <stored-folder> <brief.md>
//   bun scripts/tasks/lint-task-links.ts --self-test
//
// A clean file prints nothing and exits 0. A finding names its line and exits
// 1. Dead relative Markdown links name their missing target. Bare document
// references show the Markdown link to use when one target resolves. `--fix`
// writes only references with one resolving target. The self-test plants one
// dead link and one bare reference, then proves that a clean file stays silent.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

interface TextRange {
  start: number;
  end: number;
}

interface MarkdownTarget {
  destination: string;
  start: number;
  end: number;
}

interface BareReference {
  text: string;
  start: number;
  end: number;
  fixable: boolean;
}

interface BareReferenceResolution extends BareReference {
  suggestedLink: string | null;
  replacement: string | null;
  candidateCount: number;
}

interface LinkFinding {
  offset: number;
  message: string;
}

interface LintResult {
  findings: LinkFinding[];
  bareReferences: BareReferenceResolution[];
}

interface CommandArguments {
  fix: boolean;
  sourceArgument: string;
  baseDirectory: string | null;
}

const MARKDOWN_DESTINATION_SUFFIX = /\.md(?:[?#].*)?$/i;
const BARE_DOCUMENT_REFERENCE =
  /(?:\.\.?\/|\/)?[A-Za-z0-9_@.-]+(?:\/[A-Za-z0-9_@.-]+)*\.md\b/g;
const SKIPPED_DIRECTORY_NAMES = new Set([
  '.git',
  'dist',
  'node_modules',
  'tmp',
]);

function repositoryRootFor(path: string): string {
  let candidate = resolve(path);
  while (true) {
    if (existsSync(join(candidate, '.git'))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) return resolve(path);
    candidate = parent;
  }
}

function markdownPath(path: string): string {
  return path.split(sep).join('/');
}

function lineNumberAt(text: string, offset: number): number {
  let lineNumber = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === '\n') lineNumber += 1;
  }
  return lineNumber;
}

function fencedCodeRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  const fencePattern = /^( {0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/gm;
  let openFence:
    { character: string; length: number; start: number } | undefined;
  for (const match of text.matchAll(fencePattern)) {
    const fence = match[2];
    if (fence === undefined || match.index === undefined) continue;
    if (openFence === undefined) {
      openFence = {
        character: fence[0] ?? '',
        length: fence.length,
        start: match.index,
      };
      continue;
    }
    if (fence[0] === openFence.character && fence.length >= openFence.length) {
      ranges.push({
        start: openFence.start,
        end: match.index + match[0].length,
      });
      openFence = undefined;
    }
  }
  if (openFence !== undefined) {
    ranges.push({ start: openFence.start, end: text.length });
  }
  return ranges;
}

function inlineMarkdownTargets(text: string): MarkdownTarget[] {
  const targets: MarkdownTarget[] = [];
  const inlineLink =
    /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+["'][^)\n]*["'])?\s*\)/g;
  for (const match of text.matchAll(inlineLink)) {
    if (match.index === undefined) continue;
    const destination = match[1] ?? match[2];
    if (destination === undefined) continue;
    targets.push({
      destination,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return targets;
}

function referenceDefinitionTargets(text: string): MarkdownTarget[] {
  const targets: MarkdownTarget[] = [];
  const referenceDefinition =
    /^( {0,3})\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|(\S+))/gm;
  for (const match of text.matchAll(referenceDefinition)) {
    if (match.index === undefined) continue;
    const destination = match[2] ?? match[3];
    if (destination === undefined) continue;
    targets.push({
      destination,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return targets;
}

function linkedTextRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  const referenceLink = /!?\[[^\]\n]+\](?:\[[^\]\n]*\])/g;
  for (const match of text.matchAll(referenceLink)) {
    if (match.index === undefined) continue;
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return ranges;
}

function inlineCodeRanges(
  text: string,
): Array<TextRange & { delimiterLength: number }> {
  const ranges: Array<TextRange & { delimiterLength: number }> = [];
  const inlineCode = /(`+)([^`\n]*?)\1/g;
  for (const match of text.matchAll(inlineCode)) {
    if (match.index === undefined || match[1] === undefined) continue;
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      delimiterLength: match[1].length,
    });
  }
  return ranges;
}

function rangeContains(ranges: TextRange[], offset: number): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function relativeMarkdownTarget(destination: string): string | null {
  if (!MARKDOWN_DESTINATION_SUFFIX.test(destination)) return null;
  if (
    destination.startsWith('#') ||
    destination.startsWith('//') ||
    isAbsolute(destination) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination)
  ) {
    return null;
  }
  const pathWithoutAnchor = destination.split(/[?#]/, 1)[0];
  if (pathWithoutAnchor === undefined || pathWithoutAnchor.length === 0) {
    return null;
  }
  try {
    return decodeURIComponent(pathWithoutAnchor);
  } catch {
    return pathWithoutAnchor;
  }
}

function pathIsFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function documentFilesBelow(root: string): string[] {
  const files: string[] = [];
  const pendingDirectories = [root];
  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    if (directory === undefined) continue;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(path);
        continue;
      }
      if (!entry.isDirectory() || SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }
      if (
        entry.name === 'worktrees' &&
        dirname(path).endsWith(`${sep}.invar`)
      ) {
        continue;
      }
      pendingDirectories.push(path);
    }
  }
  return files;
}

function bareReferenceCandidates(
  resolutionDirectory: string,
  referenceText: string,
  repositoryRoot: string,
  documentFiles: string[],
): string[] {
  const directCandidate = resolve(resolutionDirectory, referenceText);
  if (pathIsFile(directCandidate)) return [realpathSync(directCandidate)];

  const repositoryCandidate = resolve(repositoryRoot, referenceText);
  if (pathIsFile(repositoryCandidate)) {
    return [realpathSync(repositoryCandidate)];
  }

  const referenceFileName = referenceText.split('/').at(-1);
  if (referenceFileName === undefined) return [];
  return [
    ...new Set(
      documentFiles
        .filter((path) => path.split(sep).at(-1) === referenceFileName)
        .map((path) => realpathSync(path)),
    ),
  ];
}

function bareDocumentReferences(
  text: string,
  excludedRanges: TextRange[],
  codeRanges: Array<TextRange & { delimiterLength: number }>,
): BareReference[] {
  const references: BareReference[] = [];
  for (const match of text.matchAll(BARE_DOCUMENT_REFERENCE)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (rangeContains(excludedRanges, start)) continue;
    if (text[start - 1] === '*' || match[0].includes('...')) continue;
    if (text[start - 1] === '<' && text[end] === '>') continue;
    if (match[0].startsWith('//')) continue;
    if (text.slice(Math.max(0, start - 8), start).includes('://')) continue;
    const codeRange = codeRanges.find(
      (range) => start >= range.start && end <= range.end,
    );
    const exactCodeReference =
      codeRange !== undefined &&
      start === codeRange.start + codeRange.delimiterLength &&
      end === codeRange.end - codeRange.delimiterLength;
    references.push({
      text: match[0],
      start: exactCodeReference ? codeRange.start : start,
      end: exactCodeReference ? codeRange.end : end,
      fixable: codeRange === undefined || exactCodeReference,
    });
  }
  return references;
}

function lintTaskRecord(
  sourceFile: string,
  text: string,
  resolutionDirectory = dirname(sourceFile),
): LintResult {
  const fencedRanges = fencedCodeRanges(text);
  const inlineTargets = inlineMarkdownTargets(text).filter(
    (target) => !rangeContains(fencedRanges, target.start),
  );
  const definitionTargets = referenceDefinitionTargets(text).filter(
    (target) => !rangeContains(fencedRanges, target.start),
  );
  const markdownTargets = [...inlineTargets, ...definitionTargets];
  const codeRanges = inlineCodeRanges(text).filter(
    (range) => !rangeContains(fencedRanges, range.start),
  );
  const linkedRanges = [
    ...fencedRanges,
    ...markdownTargets.map(({ start, end }) => ({ start, end })),
    ...linkedTextRanges(text),
  ];
  const findings: LinkFinding[] = [];

  for (const target of markdownTargets) {
    const relativeTarget = relativeMarkdownTarget(target.destination);
    if (relativeTarget === null) continue;
    const resolvedTarget = resolve(resolutionDirectory, relativeTarget);
    if (!pathIsFile(resolvedTarget)) {
      findings.push({
        offset: target.start,
        message: `dead relative Markdown link '${target.destination}'`,
      });
    }
  }

  const repositoryRoot = repositoryRootFor(resolutionDirectory);
  const documentFiles = documentFilesBelow(repositoryRoot);
  const bareReferences = bareDocumentReferences(
    text,
    linkedRanges,
    codeRanges,
  ).map((reference): BareReferenceResolution => {
    const candidates = bareReferenceCandidates(
      resolutionDirectory,
      reference.text,
      repositoryRoot,
      documentFiles,
    );
    const target = candidates.length === 1 ? candidates[0] : undefined;
    const destination =
      target === undefined
        ? null
        : markdownPath(relative(resolutionDirectory, target));
    const suggestedLink =
      destination === null
        ? null
        : `[${reference.text}](${destination || reference.text})`;
    return {
      ...reference,
      candidateCount: candidates.length,
      suggestedLink,
      replacement: reference.fixable ? suggestedLink : null,
    };
  });

  for (const reference of bareReferences) {
    const resolution =
      reference.suggestedLink === null
        ? reference.candidateCount === 0
          ? 'no target resolves'
          : `${reference.candidateCount} targets resolve`
        : `use ${reference.suggestedLink}`;
    findings.push({
      offset: reference.start,
      message: `bare document reference '${reference.text}'; ${resolution}`,
    });
  }

  findings.sort((left, right) => left.offset - right.offset);
  return { findings, bareReferences };
}

function displayPathFor(path: string): string {
  const relativePath = relative(process.cwd(), path);
  return relativePath.startsWith('..') ? path : relativePath;
}

function printFindings(
  sourceFile: string,
  text: string,
  findings: LinkFinding[],
): void {
  const displayPath = displayPathFor(sourceFile);
  for (const finding of findings) {
    console.error(
      `${displayPath}:${lineNumberAt(text, finding.offset)}: ${finding.message}`,
    );
  }
}

function fixBareReferences(
  sourceFile: string,
  text: string,
  bareReferences: BareReferenceResolution[],
): { text: string; fixedCount: number } {
  const fixableReferences = bareReferences
    .filter(
      (
        reference,
      ): reference is BareReferenceResolution & { replacement: string } =>
        reference.replacement !== null,
    )
    .sort((left, right) => right.start - left.start);
  let fixedText = text;
  for (const reference of fixableReferences) {
    fixedText =
      fixedText.slice(0, reference.start) +
      reference.replacement +
      fixedText.slice(reference.end);
  }
  if (fixableReferences.length > 0) writeFileSync(sourceFile, fixedText);
  return { text: fixedText, fixedCount: fixableReferences.length };
}

function parseCommandArguments(arguments_: string[]): CommandArguments | null {
  let fix = false;
  let sourceArgument: string | undefined;
  let baseDirectory: string | null = null;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--fix') {
      fix = true;
      continue;
    }
    if (argument === '--base-directory') {
      const directoryArgument = arguments_[index + 1];
      if (directoryArgument === undefined) return null;
      baseDirectory = resolve(directoryArgument);
      index += 1;
      continue;
    }
    if (argument === undefined || sourceArgument !== undefined) return null;
    sourceArgument = argument;
  }
  return sourceArgument === undefined
    ? null
    : { fix, sourceArgument, baseDirectory };
}

function runLint(arguments_: string[]): number {
  const commandArguments = parseCommandArguments(arguments_);
  if (commandArguments === null) {
    console.error(
      'usage: bun scripts/tasks/lint-task-links.ts [--fix] [--base-directory <stored-folder>] <task-record.md>',
    );
    return 2;
  }
  const sourceFile = resolve(commandArguments.sourceArgument);
  if (!pathIsFile(sourceFile)) {
    console.error(
      `task-link-lint: file not found: ${commandArguments.sourceArgument}`,
    );
    return 2;
  }
  const resolutionDirectory =
    commandArguments.baseDirectory ?? dirname(sourceFile);

  let text = readFileSync(sourceFile, 'utf8');
  let result = lintTaskRecord(sourceFile, text, resolutionDirectory);
  if (commandArguments.fix) {
    const fixed = fixBareReferences(sourceFile, text, result.bareReferences);
    text = fixed.text;
    if (fixed.fixedCount > 0) {
      console.log(
        `task-link-lint: fixed ${fixed.fixedCount} bare document reference(s) in ${displayPathFor(sourceFile)}`,
      );
    }
    result = lintTaskRecord(sourceFile, text, resolutionDirectory);
  }
  if (result.findings.length === 0) return 0;
  printFindings(sourceFile, text, result.findings);
  return 1;
}

function selfTest(): number {
  const sandbox = mkdtempSync(join(tmpdir(), 'task-link-lint-self-test-'));
  try {
    const scratchDirectory = join(sandbox, 'scratch');
    const storedDirectory = join(sandbox, 'stored-task-folder');
    mkdirSync(scratchDirectory);
    mkdirSync(storedDirectory);
    const target = join(storedDirectory, 'report-288-control.md');
    const deadSource = join(scratchDirectory, 'brief-288-dead.md');
    const bareSource = join(scratchDirectory, 'brief-288-bare.md');
    const cleanSource = join(scratchDirectory, 'brief-288-clean.md');
    writeFileSync(target, '# Target\n');
    writeFileSync(deadSource, 'See [missing](report-288-missing.md).\n');
    writeFileSync(bareSource, 'See `report-288-control.md`.\n');
    writeFileSync(
      cleanSource,
      [
        'See [the control report](report-288-control.md).',
        'Patterns such as *.md, *.invariants.md, and report-288-...md are not references.',
        '```',
        'bun tool.ts report-288-command.md',
        '```',
        '',
      ].join('\n'),
    );

    const run = (path: string, extraArguments: string[] = []) =>
      Bun.spawnSync(
        [
          process.execPath,
          import.meta.path,
          '--base-directory',
          storedDirectory,
          ...extraArguments,
          path,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      );
    const deadResult = run(deadSource);
    const bareResult = run(bareSource);
    const cleanResult = run(cleanSource);
    const fixResult = run(bareSource, ['--fix']);
    const fixedText = readFileSync(bareSource, 'utf8');

    const deadError = deadResult.stderr.toString();
    const bareError = bareResult.stderr.toString();
    if (
      deadResult.exitCode !== 1 ||
      !deadError.includes("dead relative Markdown link 'report-288-missing.md'")
    ) {
      console.error('task-link-lint self-test: dead-link control did not fail');
      return 1;
    }
    console.log(`CONTROL dead-link exit=${deadResult.exitCode}`);
    process.stdout.write(deadError);
    console.log('PASS  a planted dead relative Markdown link exits 1');

    if (
      bareResult.exitCode !== 1 ||
      !bareError.includes(
        "bare document reference 'report-288-control.md'; use [report-288-control.md](report-288-control.md)",
      )
    ) {
      console.error(
        'task-link-lint self-test: bare-reference control did not fail',
      );
      return 1;
    }
    console.log(`CONTROL bare-reference exit=${bareResult.exitCode}`);
    process.stdout.write(bareError);
    console.log('PASS  a planted bare document reference exits 1');

    if (
      cleanResult.exitCode !== 0 ||
      cleanResult.stdout.toString() !== '' ||
      cleanResult.stderr.toString() !== ''
    ) {
      console.error('task-link-lint self-test: clean control was not silent');
      return 1;
    }
    console.log(
      `CONTROL clean exit=${cleanResult.exitCode} stdout=${cleanResult.stdout.byteLength} stderr=${cleanResult.stderr.byteLength}`,
    );
    console.log('PASS  a clean linked document reference is silent');

    if (
      fixResult.exitCode !== 0 ||
      fixedText !== 'See [report-288-control.md](report-288-control.md).\n'
    ) {
      console.error(
        'task-link-lint self-test: --fix did not rewrite one resolving target',
      );
      return 1;
    }
    console.log('PASS  --fix rewrites one unambiguous bare reference');
    console.log('task-link-lint self-test: ALL-PASS');
    return 0;
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  process.exitCode =
    process.argv.length === 3 && process.argv[2] === '--self-test'
      ? selfTest()
      : runLint(process.argv.slice(2));
}
