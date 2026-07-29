#!/usr/bin/env bun

// Check links in one task record before the record enters the task lifecycle.
//
// Run:
//   bun scripts/tasks/lint-task-links.ts <task-record.md>
//   bun scripts/tasks/lint-task-links.ts --fix <task-record.md>
//   bun scripts/tasks/lint-task-links.ts --fix --moved-only <task-record.md>
//   bun scripts/tasks/lint-task-links.ts --base-directory <stored-folder> <brief.md>
//   bun scripts/tasks/lint-task-links.ts --self-test
//
// A clean file prints nothing and exits 0. A finding names its line and exits
// 1. A task-state link that moved stays valid, names its current path, and
// `--fix` refreshes it. Dead relative Markdown links stay errors. Bare document
// references show the Markdown link to use when one target resolves.
// `--fix --moved-only` refreshes only moved task-state links and never scans
// for or changes bare references. The self-test proves every class.

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
import { TaskStatePath } from '../../src/modules/system/TaskStatePath';

interface TextRange {
  start: number;
  end: number;
}

interface MarkdownTarget {
  destination: string;
  start: number;
  end: number;
  destinationStart: number;
  destinationEnd: number;
}

interface MovedMarkdownTarget extends MarkdownTarget {
  replacementDestination: string;
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
  blocking: boolean;
}

interface LintResult {
  findings: LinkFinding[];
  bareReferences: BareReferenceResolution[];
  movedMarkdownTargets: MovedMarkdownTarget[];
}

interface CommandArguments {
  fix: boolean;
  movedOnly: boolean;
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
    const linkOpeningOffset = match[0].indexOf('](');
    const destinationMarker =
      match[1] === undefined ? destination : `<${destination}>`;
    const destinationMarkerOffset = match[0].indexOf(
      destinationMarker,
      linkOpeningOffset + 2,
    );
    if (destinationMarkerOffset < 0) continue;
    const destinationStart =
      match.index + destinationMarkerOffset + (match[1] === undefined ? 0 : 1);
    targets.push({
      destination,
      start: match.index,
      end: match.index + match[0].length,
      destinationStart,
      destinationEnd: destinationStart + destination.length,
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
    const definitionOpeningOffset = match[0].indexOf(']:');
    const destinationMarker =
      match[2] === undefined ? destination : `<${destination}>`;
    const destinationMarkerOffset = match[0].indexOf(
      destinationMarker,
      definitionOpeningOffset + 2,
    );
    if (destinationMarkerOffset < 0) continue;
    const destinationStart =
      match.index + destinationMarkerOffset + (match[2] === undefined ? 0 : 1);
    targets.push({
      destination,
      start: match.index,
      end: match.index + match[0].length,
      destinationStart,
      destinationEnd: destinationStart + destination.length,
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

function movedTaskStateTarget(path: string): string | null {
  for (const alternatePath of TaskStatePath.Class.alternateStatePaths(path)) {
    if (pathIsFile(alternatePath)) return realpathSync(alternatePath);
  }
  return null;
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
  includeBareReferences = true,
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
  const movedMarkdownTargets: MovedMarkdownTarget[] = [];

  for (const target of markdownTargets) {
    const relativeTarget = relativeMarkdownTarget(target.destination);
    if (relativeTarget === null) continue;
    const resolvedTarget = resolve(resolutionDirectory, relativeTarget);
    if (pathIsFile(resolvedTarget)) continue;
    const movedTarget = movedTaskStateTarget(resolvedTarget);
    if (movedTarget !== null) {
      const suffixOffset = target.destination.search(/[?#]/);
      const pathSuffix =
        suffixOffset < 0 ? '' : target.destination.slice(suffixOffset);
      const replacementPath = markdownPath(
        relative(resolutionDirectory, movedTarget),
      );
      const replacementDestination = `${replacementPath}${pathSuffix}`;
      movedMarkdownTargets.push({
        ...target,
        replacementDestination: replacementDestination || target.destination,
      });
      findings.push({
        offset: target.start,
        message:
          `moved relative Markdown link '${target.destination}'; ` +
          `current location is ${replacementDestination}`,
        blocking: false,
      });
      continue;
    }
    findings.push({
      offset: target.start,
      message: `dead relative Markdown link '${target.destination}'`,
      blocking: true,
    });
  }

  const bareReferences = includeBareReferences
    ? (() => {
        const repositoryRoot = repositoryRootFor(resolutionDirectory);
        const documentFiles = documentFilesBelow(repositoryRoot);
        return bareDocumentReferences(text, linkedRanges, codeRanges).map(
          (reference): BareReferenceResolution => {
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
          },
        );
      })()
    : [];

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
      blocking: true,
    });
  }

  findings.sort((left, right) => left.offset - right.offset);
  return { findings, bareReferences, movedMarkdownTargets };
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

function fixReferences(
  sourceFile: string,
  text: string,
  bareReferences: BareReferenceResolution[],
  movedMarkdownTargets: MovedMarkdownTarget[],
  includeBareReferences: boolean,
): { text: string; fixedBareCount: number; refreshedMovedCount: number } {
  const bareFixes = bareReferences
    .filter(
      (
        reference,
      ): reference is BareReferenceResolution & { replacement: string } =>
        reference.replacement !== null,
    )
    .map((reference) => ({
      start: reference.start,
      end: reference.end,
      replacement: reference.replacement,
    }));
  const movedFixes = movedMarkdownTargets.map((target) => ({
    start: target.destinationStart,
    end: target.destinationEnd,
    replacement: target.replacementDestination,
  }));
  const fixes = [
    ...(includeBareReferences ? bareFixes : []),
    ...movedFixes,
  ].sort((left, right) => right.start - left.start);
  let fixedText = text;
  for (const fix of fixes) {
    fixedText =
      fixedText.slice(0, fix.start) +
      fix.replacement +
      fixedText.slice(fix.end);
  }
  if (fixes.length > 0) writeFileSync(sourceFile, fixedText);
  return {
    text: fixedText,
    fixedBareCount: includeBareReferences ? bareFixes.length : 0,
    refreshedMovedCount: movedFixes.length,
  };
}

function parseCommandArguments(arguments_: string[]): CommandArguments | null {
  let fix = false;
  let movedOnly = false;
  let sourceArgument: string | undefined;
  let baseDirectory: string | null = null;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--fix') {
      fix = true;
      continue;
    }
    if (argument === '--moved-only') {
      movedOnly = true;
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
  return sourceArgument === undefined || (movedOnly && !fix)
    ? null
    : { fix, movedOnly, sourceArgument, baseDirectory };
}

function runLint(arguments_: string[]): number {
  const commandArguments = parseCommandArguments(arguments_);
  if (commandArguments === null) {
    console.error(
      'usage: bun scripts/tasks/lint-task-links.ts [--fix [--moved-only]] [--base-directory <stored-folder>] <task-record.md>',
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
  const includeBareReferences = !commandArguments.movedOnly;
  let result = lintTaskRecord(
    sourceFile,
    text,
    resolutionDirectory,
    includeBareReferences,
  );
  if (commandArguments.fix) {
    const fixed = fixReferences(
      sourceFile,
      text,
      result.bareReferences,
      result.movedMarkdownTargets,
      includeBareReferences,
    );
    text = fixed.text;
    if (commandArguments.movedOnly) {
      console.log(
        `task-link-lint: ${fixed.refreshedMovedCount} moved link(s) refreshed in ${displayPathFor(sourceFile)}`,
      );
    } else {
      if (fixed.refreshedMovedCount > 0) {
        console.log(
          `task-link-lint: refreshed ${fixed.refreshedMovedCount} moved link(s) in ${displayPathFor(sourceFile)}`,
        );
      }
      if (fixed.fixedBareCount > 0) {
        console.log(
          `task-link-lint: fixed ${fixed.fixedBareCount} bare document reference(s) in ${displayPathFor(sourceFile)}`,
        );
      }
    }
    result = lintTaskRecord(
      sourceFile,
      text,
      resolutionDirectory,
      includeBareReferences,
    );
  }
  if (!commandArguments.movedOnly && result.findings.length > 0) {
    printFindings(sourceFile, text, result.findings);
  }
  if (commandArguments.movedOnly) return 0;
  return result.findings.some((finding) => finding.blocking) ? 1 : 0;
}

function selfTest(): number {
  const sandbox = mkdtempSync(join(tmpdir(), 'task-link-lint-self-test-'));
  try {
    const scratchDirectory = join(sandbox, 'scratch');
    mkdirSync(join(sandbox, '.git'));
    const storedDirectory = join(
      sandbox,
      '.invar',
      'tasks',
      'completed',
      '999-task-link-lint-source',
    );
    const currentTargetDirectory = join(
      sandbox,
      '.invar',
      'tasks',
      'completed',
      '997-task-link-lint-target',
    );
    mkdirSync(scratchDirectory);
    mkdirSync(storedDirectory, { recursive: true });
    mkdirSync(currentTargetDirectory, { recursive: true });
    const target = join(
      currentTargetDirectory,
      'task-997-task-link-lint-target.md',
    );
    const deadSource = join(scratchDirectory, 'brief-288-dead.md');
    const bareSource = join(scratchDirectory, 'brief-288-bare.md');
    const cleanSource = join(scratchDirectory, 'brief-288-clean.md');
    const currentSource = join(scratchDirectory, 'brief-291-current.md');
    const movedSource = join(scratchDirectory, 'brief-291-moved.md');
    const deadTaskSource = join(scratchDirectory, 'brief-291-dead-task.md');
    const deadSourceLinkSource = join(
      scratchDirectory,
      'brief-291-dead-source-link.md',
    );
    const movedOnlyBareSource = join(
      scratchDirectory,
      'brief-291-moved-only-bare.md',
    );
    writeFileSync(target, '# Target\n');
    writeFileSync(deadSource, 'See [missing](report-288-missing.md).\n');
    writeFileSync(bareSource, 'See `task-997-task-link-lint-target.md`.\n');
    writeFileSync(
      cleanSource,
      [
        'See [the control report](../997-task-link-lint-target/task-997-task-link-lint-target.md).',
        'Patterns such as *.md, *.invariants.md, and report-288-...md are not references.',
        '```',
        'bun tool.ts report-288-command.md',
        '```',
        '',
      ].join('\n'),
    );
    writeFileSync(
      currentSource,
      'See [current](../997-task-link-lint-target/task-997-task-link-lint-target.md).\n',
    );
    writeFileSync(
      movedSource,
      'See [moved](../../active/997-task-link-lint-target/task-997-task-link-lint-target.md).\n',
    );
    writeFileSync(
      deadTaskSource,
      'See [dead](../../active/996-dead-task-link-target/task-996-dead-task-link-target.md).\n',
    );
    writeFileSync(
      deadSourceLinkSource,
      'See [dead source](../../../../src/task-997-task-link-lint-target.md).\n',
    );
    writeFileSync(
      movedOnlyBareSource,
      'See `task-997-task-link-lint-target.md`.\n',
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
    const currentResult = run(currentSource);
    const movedResult = run(movedSource);
    const movedFixResult = run(movedSource, ['--fix']);
    const movedFixedText = readFileSync(movedSource, 'utf8');
    const deadTaskResult = run(deadTaskSource);
    const deadSourceLinkResult = run(deadSourceLinkSource);
    const movedOnlyBareTextBefore = readFileSync(movedOnlyBareSource, 'utf8');
    const movedOnlyBareResult = run(movedOnlyBareSource, [
      '--fix',
      '--moved-only',
    ]);
    const movedOnlyBareTextAfter = readFileSync(movedOnlyBareSource, 'utf8');

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
        "bare document reference 'task-997-task-link-lint-target.md'; use [task-997-task-link-lint-target.md](../997-task-link-lint-target/task-997-task-link-lint-target.md)",
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
      fixedText !==
        'See [task-997-task-link-lint-target.md](../997-task-link-lint-target/task-997-task-link-lint-target.md).\n'
    ) {
      console.error(
        'task-link-lint self-test: --fix did not rewrite one resolving target',
      );
      return 1;
    }
    console.log('PASS  --fix rewrites one unambiguous bare reference');

    if (
      currentResult.exitCode !== 0 ||
      currentResult.stdout.toString() !== '' ||
      currentResult.stderr.toString() !== ''
    ) {
      console.error(
        'task-link-lint self-test: current-state link was not silent',
      );
      return 1;
    }
    console.log('PASS  a current-state task link is silent');

    const movedError = movedResult.stderr.toString();
    if (
      movedResult.exitCode !== 0 ||
      !movedError.includes(
        "moved relative Markdown link '../../active/997-task-link-lint-target/task-997-task-link-lint-target.md'; current location is ../997-task-link-lint-target/task-997-task-link-lint-target.md",
      )
    ) {
      console.error(
        'task-link-lint self-test: moved task link was not a valid finding',
      );
      return 1;
    }
    console.log(`CONTROL moved-link exit=${movedResult.exitCode}`);
    process.stdout.write(movedError);
    console.log('PASS  a moved task link is valid and flagged');

    if (
      movedFixResult.exitCode !== 0 ||
      movedFixedText !==
        'See [moved](../997-task-link-lint-target/task-997-task-link-lint-target.md).\n'
    ) {
      console.error(
        'task-link-lint self-test: --fix did not refresh the moved task link',
      );
      return 1;
    }
    console.log('PASS  --fix refreshes a moved task link');

    if (
      deadTaskResult.exitCode !== 1 ||
      !deadTaskResult.stderr.toString().includes('dead relative Markdown link')
    ) {
      console.error(
        'task-link-lint self-test: dead task-state link did not fail',
      );
      return 1;
    }
    console.log('PASS  a dead task-state link stays red');

    if (
      deadSourceLinkResult.exitCode !== 1 ||
      !deadSourceLinkResult.stderr
        .toString()
        .includes('dead relative Markdown link')
    ) {
      console.error(
        'task-link-lint self-test: dead src link was rescued outside task-state scope',
      );
      return 1;
    }
    console.log('PASS  a dead src link is not rescued by task-state fallback');

    if (
      movedOnlyBareResult.exitCode !== 0 ||
      movedOnlyBareTextAfter !== movedOnlyBareTextBefore ||
      !movedOnlyBareResult.stdout
        .toString()
        .includes('0 moved link(s) refreshed')
    ) {
      console.error(
        'task-link-lint self-test: --moved-only changed a bare reference',
      );
      return 1;
    }
    console.log(
      'PASS  --moved-only leaves an unambiguous bare reference unchanged',
    );
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
