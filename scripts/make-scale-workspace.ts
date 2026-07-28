/**
 * Generate a standalone TypeScript workspace for hand-testing Invar at scale.
 *
 * It is written OUTSIDE this repository on purpose. `tsconfig.json` here
 * declares neither `include` nor `exclude`, so `tsc --noEmit` compiles every
 * `.ts` file under the repository root — a `.gitignore` entry does not hide a
 * file from the compiler, and a 500,000-line module inside the tree would make
 * the merge gate unusable.
 *
 * The workspace contains two TypeScript files so the language-server size
 * budget can be observed rather than assumed:
 *
 *   small.ts   a few hundred bytes — language features must WORK
 *   huge.ts    ~20 MB             — language features must be SUPPRESSED
 *
 * Without `small.ts` a quiet editor proves nothing: a file the provider never
 * attached to looks exactly like a file it deliberately gave up on.
 *
 * Usage:
 *   bun scripts/make-scale-workspace.ts                 # 500,000 lines
 *   bun scripts/make-scale-workspace.ts --lines 100000
 *   bun scripts/make-scale-workspace.ts --directory /path/to/workspace
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_DIRECTORY = '/home/parallels/dev/invar-scale';
const DEFAULT_LINE_COUNT = 500_000;

/** Lines per generated chunk — bounds peak string size while writing. */
const CHUNK_LINE_COUNT = 20_000;

function parseArguments(argumentList: string[]): {
  directory: string;
  lineCount: number;
} {
  let directory = DEFAULT_DIRECTORY;
  let lineCount = DEFAULT_LINE_COUNT;
  for (let index = 0; index < argumentList.length; index += 2) {
    const name = argumentList[index];
    const value = argumentList[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${name}`);
    if (name === '--directory') directory = value;
    else if (name === '--lines') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`--lines expects a positive integer, got ${value}`);
      }
      lineCount = parsed;
    } else throw new Error(`Unknown argument ${name}`);
  }
  return { directory, lineCount };
}

/**
 * The one line that is strictly wider than every other, placed at a findable
 * position. A SOLE champion is what makes both `TextDocument` width paths
 * reachable by hand: typing at its end promotes the replacement in O(1), while
 * shortening it is the only edit that still forces the exact full-document
 * rescan. With thousands of lines tied at the maximum, the rescan branch can
 * never be observed.
 */
const CHAMPION_LINE_NUMBER = 250_000;

function generateChampionLine(): string {
  return (
    `export const scaleWidestLineChampion = ` +
    `'WIDEST-LINE-CHAMPION — this is the single widest line in the file. ` +
    `Type at its end and the maximum-width champion is promoted in constant ` +
    `time; shorten it and it is the one edit that still costs an exact ` +
    `full-document rescan, which is the only place in this file where a ` +
    `500,000-line document should be possible to feel at all.';`
  );
}

/**
 * One generated line of plausible TypeScript. Line lengths vary on a cycle so
 * horizontal scrolling has something to travel over, and every eighth line is
 * long — but none of them reaches the sole champion above.
 */
function generateLine(lineIndex: number): string {
  if (lineIndex + 1 === CHAMPION_LINE_NUMBER) return generateChampionLine();
  const ordinal = String(lineIndex).padStart(7, '0');
  const cycle = lineIndex % 8;
  if (cycle === 0) {
    return `export interface ScaleRecord${ordinal} { identifier: string; }`;
  }
  if (cycle === 1) {
    return `export type ScaleAlias${ordinal} = ScaleRecord${ordinal} | null;`;
  }
  if (cycle === 2) {
    return `export const scaleConstant${ordinal} = ${lineIndex} as const;`;
  }
  if (cycle === 3) {
    return (
      `export function readScaleRecord${ordinal}` +
      `(record: ScaleRecord${ordinal}): string { return record.identifier; }`
    );
  }
  if (cycle === 4) {
    return `// annotation ${ordinal}: generated for scale testing.`;
  }
  if (cycle === 5) {
    return `export const scaleLabel${ordinal} = 'label-${ordinal}';`;
  }
  if (cycle === 6) {
    return '';
  }
  return (
    `export const scaleWideDescriptor${ordinal} = ` +
    `'a deliberately long generated descriptor line used to give the ` +
    `horizontal scrollbar real travel and to make the widest-line champion ` +
    `move whenever this file is edited near its end — ordinal ${ordinal}';`
  );
}

const { directory, lineCount } = parseArguments(Bun.argv.slice(2));
mkdirSync(directory, { recursive: true });

await Bun.write(
  join(directory, 'tsconfig.json'),
  `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ['small.ts'],
    },
    null,
    2,
  )}\n`,
);

await Bun.write(
  join(directory, 'small.ts'),
  [
    '// A normal-sized TypeScript file: language features MUST work here.',
    '// Hover `describeSmallRecord`, complete on `smallRecord.`, and introduce',
    '// a type error to confirm diagnostics arrive. If this file is also quiet,',
    '// the language server is not running at all and the huge-file result',
    '// below proves nothing.',
    '',
    'export interface SmallRecord {',
    '  identifier: string;',
    '  weight: number;',
    '}',
    '',
    'export const smallRecord: SmallRecord = {',
    "  identifier: 'first',",
    '  weight: 1,',
    '};',
    '',
    'export function describeSmallRecord(record: SmallRecord): string {',
    '  return `${record.identifier}:${record.weight}`;',
    '}',
    '',
  ].join('\n'),
);

const hugeFilePath = join(directory, 'huge.ts');
const hugeFile = Bun.file(hugeFilePath);
const writer = hugeFile.writer();
let widestLineIndex = 0;
let widestLineWidth = 0;
let runnerUpLineWidth = 0;
let runnerUpLineCount = 0;

for (
  let chunkStart = 0;
  chunkStart < lineCount;
  chunkStart += CHUNK_LINE_COUNT
) {
  const chunkEnd = Math.min(chunkStart + CHUNK_LINE_COUNT, lineCount);
  const chunkLines: string[] = [];
  for (let lineIndex = chunkStart; lineIndex < chunkEnd; lineIndex += 1) {
    const line = generateLine(lineIndex);
    if (line.length > widestLineWidth) {
      runnerUpLineWidth = widestLineWidth;
      widestLineWidth = line.length;
      widestLineIndex = lineIndex;
    } else if (line.length > runnerUpLineWidth) {
      runnerUpLineWidth = line.length;
    }
    if (line.length === runnerUpLineWidth) runnerUpLineCount += 1;
    chunkLines.push(line);
  }
  writer.write(`${chunkLines.join('\n')}\n`);
  await writer.flush();
}
await writer.end();

const byteLength = Bun.file(hugeFilePath).size;
const kilobytes = Math.round(byteLength / 1024);

process.stdout.write(
  [
    `workspace:   ${directory}`,
    `huge.ts:     ${lineCount.toLocaleString()} lines, ` +
      `${(byteLength / (1024 * 1024)).toFixed(1)} MB (${kilobytes} KB)`,
    `widest line: ${widestLineIndex + 1} at ${widestLineWidth} columns ` +
      `(sole champion, search WIDEST-LINE-CHAMPION)`,
    `runner-up:   ${runnerUpLineWidth} columns, ${runnerUpLineCount} lines tied`,
    `small.ts:    ${Bun.file(join(directory, 'small.ts')).size} bytes`,
    '',
    `Open it:     bun run start ${directory}`,
    '',
  ].join('\n'),
);
