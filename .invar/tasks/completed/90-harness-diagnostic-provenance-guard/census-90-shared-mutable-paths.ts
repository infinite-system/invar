#!/usr/bin/env bun
// Census: which paths does a test run write that another concurrent run can also write?
//
// WHAT IT FINDS OUT
// Test isolation breaks when two runs write one path. This census scans the verification
// surface (scripts/**, src/modules/**) for path expressions that do NOT carry a per-run token,
// and reports each one with its file, line, and rule. A per-run token is `mktemp`, `mkdtemp`,
// `XXXXXX`, a shell `$$`, or an interpolated variable — anything that makes the path differ
// between two runs on one machine.
//
// The number it prints is the count of SHARED path expressions. That number is the size of the
// surface where one run can change another run's verdict. A rise in it means a new shared write
// entered the verification surface; it does not by itself mean a defect, because some shared
// paths are shared on purpose (the machine-wide quiet lock). Every hit is judged in the task 90
// report, which carries the verdict column this script cannot compute: who reads the path, and
// whether pollution can flip a gate result.
//
// HOW TO RUN IT
//   bun .invar/tasks/in-progress/90-harness-diagnostic-provenance-guard/census-90-shared-mutable-paths.ts
//   bun .../census-90-shared-mutable-paths.ts --self-test
//
// HOW TO READ ITS OUTPUT
// One line per hit: `<rule>  <file>:<line>  <the matched text>`, then a per-rule tally and the
// total. `--self-test` is the positive control: it runs every rule against a fixture holding one
// known shared path and one known per-run path per rule, and requires the shared one to be
// reported and the per-run one to be silent. A rule that cannot report and a rule that reports
// everything both fail the self-test.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

interface CensusRule {
  readonly name: string;
  readonly appliesTo: (filePath: string) => boolean;
  /** Returns the matched text when the line names a shared path, null otherwise. */
  readonly match: (line: string, filePath: string) => string | null;
  /** Self-test fixture: a line the rule MUST report. */
  readonly sharedExample: string;
  /** Self-test fixture: a line the rule must NOT report. */
  readonly perRunExample: string;
}

/** Verbs that make a path a real disk operation rather than an in-memory document name. */
const diskVerbs = [
  'writeFileSync',
  'appendFileSync',
  'readFileSync',
  'mkdirSync',
  'rmSync',
  'statSync',
  'existsSync',
  'openSync',
  'symlinkSync',
  'renameSync',
  'createWriteStream',
  'Bun.write',
  'Bun.file',
  'outfile',
  'mkfifo',
  'spawn',
];

/** A binding whose NAME says the value is a filesystem location. */
const pathBindingPattern =
  /(?:const|let|var|readonly)\s+\w*(?:[Pp]ath|[Ff]ile|[Dd]irectory|[Ll]og|[Pp]ng)\w*\s*[:=]/;

function touchesDisk(line: string, filePath: string): boolean {
  if (filePath.endsWith('.sh')) return true;
  if (pathBindingPattern.test(line)) return true;
  return diskVerbs.some((verb) => line.includes(verb));
}

/** In a shell script a bare word is already a path; in TypeScript it must be a string. */
function fixedTemporaryPath(line: string, filePath: string): string | null {
  const quoted = /['"](\/tmp\/[A-Za-z0-9_.\-/]+)['"]/.exec(line);
  if (quoted) return quoted[1]!;
  if (!filePath.endsWith('.sh')) return null;
  const bare = /(?:^|[\s=><])(\/tmp\/[A-Za-z0-9_.\-/]+)/.exec(line);
  return bare ? bare[1]! : null;
}

function hasPerRunToken(line: string): boolean {
  return (
    line.includes('mktemp') ||
    line.includes('mkdtemp') ||
    line.includes('XXXXXX') ||
    line.includes('$$') ||
    /\$\{?[A-Za-z_]/.test(line) ||
    line.includes('${')
  );
}

const rules: readonly CensusRule[] = [
  {
    name: 'fixed-tmp-path',
    appliesTo: (filePath) =>
      filePath.endsWith('.ts') || filePath.endsWith('.sh'),
    match: (line, filePath) => {
      if (hasPerRunToken(line)) return null;
      if (!touchesDisk(line, filePath)) return null;
      return fixedTemporaryPath(line, filePath);
    },
    sharedExample: `writeFileSync('/tmp/invar-shared-report.txt', text);`,
    perRunExample: `writeFileSync(mkdtempSync('/tmp/invar-report-XXXXXX'), text);`,
  },
  {
    name: 'fixed-tmp-name-without-a-disk-verb',
    appliesTo: (filePath) => filePath.endsWith('.ts'),
    match: (line, filePath) => {
      if (hasPerRunToken(line)) return null;
      if (touchesDisk(line, filePath)) return null;
      return fixedTemporaryPath(line, filePath);
    },
    sharedExample: `document.loadFromText(text, '/tmp/observed.ts');`,
    perRunExample: `writeFileSync('/tmp/observed.ts', text);`,
  },
  {
    name: 'repository-relative-artifact',
    appliesTo: (filePath) =>
      filePath.endsWith('.ts') || filePath.endsWith('.sh'),
    match: (line) => {
      const match = /['"`](artifacts\/[A-Za-z0-9_.\-/]+)['"`]/.exec(line);
      if (!match) return null;
      return match[1]!;
    },
    sharedExample: `return 'artifacts/tui.log';`,
    perRunExample: `const logPath = join(homeDirectory, 'tui.log');`,
  },
  {
    name: 'repository-relative-history',
    appliesTo: (filePath) =>
      filePath.endsWith('.ts') || filePath.endsWith('.sh'),
    match: (line) => {
      const match = /['"`](\.perf-history[A-Za-z0-9_.\-/]*)['"`]/.exec(line);
      return match ? match[1]! : null;
    },
    sharedExample: `const historyPath = join(root, '.perf-history', 'x.ndjson');`,
    perRunExample: `const historyPath = join(runDirectory, 'history.ndjson');`,
  },
  {
    name: 'fixed-network-port',
    appliesTo: (filePath) =>
      filePath.endsWith('.ts') || filePath.endsWith('.sh'),
    match: (line) => {
      const match = /(?:localhost|127\.0\.0\.1):(\d{2,5})\b/.exec(line);
      return match ? match[0]! : null;
    },
    sharedExample: `const endpoint = 'http://127.0.0.1:8080/probe';`,
    perRunExample: `const endpoint = \`http://127.0.0.1:\${chosenPort}/probe\`;`,
  },
];

const skippedDirectoryNames = new Set([
  'node_modules',
  '.git',
  'dist',
  'retired-smokes',
]);

function collectSourceFiles(root: string, directory: string): string[] {
  const collected: string[] = [];
  for (const entryName of readdirSync(directory)) {
    if (skippedDirectoryNames.has(entryName)) continue;
    const entryPath = join(directory, entryName);
    const entryStat = statSync(entryPath);
    if (entryStat.isDirectory()) {
      collected.push(...collectSourceFiles(root, entryPath));
      continue;
    }
    if (entryName.endsWith('.ts') || entryName.endsWith('.sh')) {
      collected.push(relative(root, entryPath));
    }
  }
  return collected;
}

function runSelfTest(): number {
  let failureCount = 0;
  for (const rule of rules) {
    const sharedMatch = rule.match(rule.sharedExample, 'self-test-fixture.ts');
    if (sharedMatch === null) {
      console.log(
        `SELF-TEST FAIL  ${rule.name} did not report its shared example`,
      );
      failureCount += 1;
    } else {
      console.log(
        `SELF-TEST PASS  ${rule.name} reports a shared path (${sharedMatch})`,
      );
    }
    const perRunMatch = rule.match(rule.perRunExample, 'self-test-fixture.ts');
    if (perRunMatch !== null) {
      console.log(
        `SELF-TEST FAIL  ${rule.name} reported a per-run path (${perRunMatch})`,
      );
      failureCount += 1;
    } else {
      console.log(
        `SELF-TEST PASS  ${rule.name} stays silent on a per-run path`,
      );
    }
  }
  console.log(
    failureCount === 0
      ? 'census-90 self-test: every rule can report and can stay silent'
      : `census-90 self-test: ${failureCount} failure(s)`,
  );
  return failureCount === 0 ? 0 : 1;
}

if (process.argv.includes('--self-test')) {
  process.exit(runSelfTest());
}

const repositoryRoot = process.cwd();
const scannedFiles = [
  ...collectSourceFiles(repositoryRoot, join(repositoryRoot, 'scripts')),
  ...collectSourceFiles(repositoryRoot, join(repositoryRoot, 'src')),
];

const tallyByRule = new Map<string, number>();
let totalHitCount = 0;

for (const filePath of scannedFiles) {
  const lines = readFileSync(join(repositoryRoot, filePath), 'utf8').split(
    '\n',
  );
  for (const [lineIndex, line] of lines.entries()) {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) {
      continue;
    }
    for (const rule of rules) {
      if (!rule.appliesTo(filePath)) continue;
      const matched = rule.match(line, filePath);
      if (matched === null) continue;
      console.log(`${rule.name}  ${filePath}:${lineIndex + 1}  ${matched}`);
      tallyByRule.set(rule.name, (tallyByRule.get(rule.name) ?? 0) + 1);
      totalHitCount += 1;
    }
  }
}

console.log('');
for (const rule of rules) {
  console.log(`  ${rule.name}: ${tallyByRule.get(rule.name) ?? 0}`);
}
console.log(
  `shared path expressions: ${totalHitCount} (over ${scannedFiles.length} scanned files)`,
);
