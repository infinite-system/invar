/**
 * Generate a deeply nested JSON fixture that STRESSES THE FOLD ARCHITECTURE, which the flat
 * `make-scale-workspace.ts` fixture cannot do.
 *
 * huge.ts is one long list of sibling declarations: every fold region is tiny, no region spans a
 * block boundary, and collapsing one hides a handful of rows. So it exercises size but not
 * STRUCTURE, and a fold projection that degrades with region size would still measure clean on it.
 *
 * The design target is the two boundaries the wrap index is built around:
 *
 *   the VIEWPORT (~50 rows)     — a region larger than this cannot be judged by eye in one screen
 *   the BLOCK (4096 lines)      — `EditorWrap.BLOCK_SHIFT`; the row-count tier is summed per block,
 *                                 so a region that spans MANY blocks is the case where a collapse
 *                                 must invalidate a run of block sums rather than one.
 *
 * Region sizes therefore straddle both, spanning four orders of magnitude in one file: the biggest
 * regions cross hundreds of blocks, the smallest sit well inside a single one. A design that only
 * handles sub-block regions fails visibly here instead of silently.
 *
 * Emitted as .json rather than .ts on purpose: JSON folding is driven purely by bracket nesting,
 * so the fixture tests the fold generator without also depending on TypeScript syntax rules.
 *
 * Usage:
 *   bun scripts/make-nested-fold-fixture.ts --lines 500000 --output /path/nested.json
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_LINE_COUNT = 500_000;
const DEFAULT_OUTPUT_PATH =
  '/home/parallels/dev/tui-editor/tmp/invar-scale-test/nested.json';

/**
 * Lines per emitted chunk. Bounds peak string size while writing so generating a 78 MB fixture
 * never holds the whole document in memory — the same reason make-scale-workspace.ts chunks.
 */
const CHUNK_LINE_COUNT = 20_000;

/**
 * Nesting fan-out per level, outermost first. Each level's region size is the product of the
 * levels below it, so this ladder is what places regions on both sides of the 4096-line block:
 * with the default 500k budget the outermost groups span tens of thousands of lines (hundreds of
 * blocks) and the innermost span a few dozen (deep inside one block).
 */
const CHILDREN_PER_LEVEL = [10, 5, 5, 4, 4, 4] as const;

/** Leaf scalar entries per innermost object — the only level that emits no nested brackets. */
const LEAF_ENTRY_COUNT = 6;

function parseArguments(argumentList: string[]): {
  lineCount: number;
  outputPath: string;
} {
  let lineCount = DEFAULT_LINE_COUNT;
  let outputPath = DEFAULT_OUTPUT_PATH;
  for (let index = 0; index < argumentList.length; index += 2) {
    const name = argumentList[index];
    const value = argumentList[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${name}`);
    if (name === '--output') outputPath = value;
    else if (name === '--lines') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`--lines expects a positive integer, got ${value}`);
      }
      lineCount = parsed;
    } else throw new Error(`Unknown argument ${name}`);
  }
  return { lineCount, outputPath };
}

/**
 * Lines emitted by one subtree rooted at `level`, counting its own opening and closing brace.
 * Computed rather than measured so the generator can report each level's REGION SIZE up front —
 * the numbers a reader needs to know the fixture actually straddles the block boundary.
 */
function subtreeLineCount(level: number): number {
  if (level >= CHILDREN_PER_LEVEL.length) {
    // A leaf object: `"key": {`, one line per scalar, then `}`.
    return LEAF_ENTRY_COUNT + 2;
  }
  const childCount = CHILDREN_PER_LEVEL[level] ?? 1;
  return childCount * subtreeLineCount(level + 1) + 2;
}

const { lineCount: requestedLineCount, outputPath } = parseArguments(
  process.argv.slice(2),
);

mkdirSync(dirname(outputPath), { recursive: true });

const writer = Bun.file(outputPath).writer();
let pendingLines: string[] = [];
let emittedLineCount = 0;

function emitLine(text: string): void {
  pendingLines.push(text);
  emittedLineCount++;
  if (pendingLines.length >= CHUNK_LINE_COUNT) {
    writer.write(`${pendingLines.join('\n')}\n`);
    pendingLines = [];
  }
}

/**
 * Emit one object subtree. `lastSibling` controls the trailing comma so the result is STRICTLY
 * VALID JSON — an invalid fixture would let a fold generator fail for parse reasons and be
 * mistaken for a scale finding.
 */
function emitObject(
  keyName: string,
  level: number,
  indentText: string,
  lastSibling: boolean,
): void {
  const comma = lastSibling ? '' : ',';
  emitLine(`${indentText}"${keyName}": {`);
  const childIndentText = `${indentText}  `;
  if (level >= CHILDREN_PER_LEVEL.length) {
    for (let entry = 0; entry < LEAF_ENTRY_COUNT; entry++) {
      const lastEntry = entry === LEAF_ENTRY_COUNT - 1;
      emitLine(
        `${childIndentText}"field${String(entry).padStart(2, '0')}": ` +
          `"value-${keyName}-${entry}"${lastEntry ? '' : ','}`,
      );
    }
  } else {
    const childCount = CHILDREN_PER_LEVEL[level] ?? 1;
    for (let child = 0; child < childCount; child++) {
      emitObject(
        `${keyName}_${String(child).padStart(2, '0')}`,
        level + 1,
        childIndentText,
        child === childCount - 1,
      );
    }
  }
  emitLine(`${indentText}}${comma}`);
}

// How many top-level groups fit the requested budget. Each group is a full subtree, so the file
// lands on a whole number of groups rather than truncating mid-structure and emitting broken JSON.
const groupLineCount = subtreeLineCount(0);
const groupCount = Math.max(
  1,
  Math.round((requestedLineCount - 2) / groupLineCount),
);

emitLine('{');
for (let group = 0; group < groupCount; group++) {
  emitObject(
    `group${String(group).padStart(4, '0')}`,
    0,
    '  ',
    group === groupCount - 1,
  );
}
emitLine('}');

if (pendingLines.length > 0) writer.write(`${pendingLines.join('\n')}\n`);
await writer.end();

const byteCount = Bun.file(outputPath).size;
const blockSize = 4096;
console.log(`${outputPath}`);
console.log(
  `  ${emittedLineCount.toLocaleString()} lines, ` +
    `${(byteCount / 1024 / 1024).toFixed(1)} MB, ${groupCount} top-level groups`,
);
console.log(`  nesting depth: ${CHILDREN_PER_LEVEL.length + 1} object levels`);
console.log('  FOLD REGION SIZE BY LEVEL (the point of this fixture):');
for (let level = 0; level <= CHILDREN_PER_LEVEL.length; level++) {
  const regionLineCount = subtreeLineCount(level);
  const blockSpan = regionLineCount / blockSize;
  const relation =
    regionLineCount > blockSize
      ? `spans ${blockSpan.toFixed(1)} blocks — MULTI-BLOCK`
      : `inside one ${blockSize}-line block`;
  console.log(
    `    level ${level}: ${regionLineCount.toLocaleString().padStart(9)} lines — ${relation}`,
  );
}
