/**
 * Mine the 307 MB session transcript for the detail the task ledger is missing.
 *
 * Streams line-by-line — the file is never loaded whole. For every task number that
 * has a thin ledger entry, collects every passage that is ABOUT that task.
 *
 * Ranking is by FOCUS, not length. The first pass ranked by length and every bucket
 * filled with the same cross-cutting lesson lists, which name a dozen task numbers and
 * say almost nothing about any one of them. A passage naming eight tasks is a passage
 * about none of them.
 *
 * Two units are extracted:
 *   - the whole paragraph, when it names at most 3 distinct task numbers;
 *   - the single bullet line, when it sits inside a list that names more.
 * A per-task bullet inside a status list ("#186 DONE — 500k max-width rescan") is real
 * detail; the list around it is not.
 *
 * Anchors strictly on the declared number `#NNN`. No fuzzy matching: a wrong mapping
 * files real evidence under the wrong task, which is worse than leaving one thin.
 */
import { createReadStream, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';

const transcriptPath =
  '/home/parallels/.claude/projects/-home-parallels-dev-ibr/faf7e858-c256-4735-9bbd-ba8dca8023dd.jsonl';
const outputDirectory = process.argv[2];
if (outputDirectory === undefined) {
  console.error(
    'usage: mine-transcript-for-task-detail.ts <output-directory> <task-number>...',
  );
  process.exit(2);
}
const wantedNumbers = new Set(process.argv.slice(3));
mkdirSync(outputDirectory, { recursive: true });

interface Passage {
  text: string;
  focusScore: number;
}

const passagesByNumber = new Map<string, Map<string, Passage>>();
for (const number of wantedNumbers) passagesByNumber.set(number, new Map());

let linesRead = 0;
let parseFailures = 0;

function collectText(content: unknown, sink: string[]): void {
  if (typeof content === 'string') {
    sink.push(content);
    return;
  }
  if (!Array.isArray(content)) return;
  for (const block of content as Array<Record<string, unknown>>) {
    if (block === null || typeof block !== 'object') continue;
    if (typeof block.text === 'string') sink.push(block.text);
    if (typeof block.thinking === 'string') sink.push(block.thinking);
    if (
      block.type === 'tool_use' &&
      block.input &&
      typeof block.input === 'object'
    ) {
      for (const value of Object.values(
        block.input as Record<string, unknown>,
      )) {
        if (typeof value === 'string' && value.length > 40) sink.push(value);
      }
    }
  }
}

function distinctNumbers(text: string): Set<string> {
  const found = new Set<string>();
  for (const token of text.match(/#(\d{2,3})\b/g) ?? [])
    found.add(token.slice(1));
  return found;
}

function offer(number: string, text: string, focusScore: number): void {
  const bucket = passagesByNumber.get(number);
  if (bucket === undefined) return;
  const trimmed = text.trim();
  if (trimmed.length < 60 || trimmed.length > 6000) return;
  const existing = bucket.get(trimmed);
  if (existing === undefined || focusScore > existing.focusScore) {
    bucket.set(trimmed, { text: trimmed, focusScore });
  }
}

const readline = createInterface({
  input: createReadStream(transcriptPath, { encoding: 'utf8' }),
  crlfDelay: Number.POSITIVE_INFINITY,
});

for await (const line of readline) {
  linesRead++;
  if (line.trim().length === 0) continue;
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line) as Record<string, unknown>;
  } catch {
    parseFailures++;
    continue;
  }

  const texts: string[] = [];
  const message = record.message as Record<string, unknown> | undefined;
  if (message && typeof message === 'object')
    collectText(message.content, texts);
  if (typeof record.summary === 'string') texts.push(record.summary);

  for (const text of texts) {
    if (!text.includes('#')) continue;
    for (const paragraph of text.split(/\n{2,}/)) {
      const numbersHere = distinctNumbers(paragraph);
      if (numbersHere.size === 0) continue;

      if (numbersHere.size <= 3) {
        // Focused passage: the whole paragraph is about these tasks.
        const score = 100 - numbersHere.size * 10;
        for (const number of numbersHere) offer(number, paragraph, score);
        continue;
      }

      // A cross-cutting list. Only the individual line that names the task is about it.
      for (const listLine of paragraph.split('\n')) {
        const lineNumbers = distinctNumbers(listLine);
        if (lineNumbers.size === 0 || lineNumbers.size > 3) continue;
        for (const number of lineNumbers)
          offer(number, listLine, 40 - lineNumbers.size * 5);
      }
    }
  }

  if (linesRead % 20000 === 0) process.stderr.write(`  ${linesRead} lines…\n`);
}

let tasksWithEvidence = 0;
const empty: string[] = [];
for (const [number, passages] of [...passagesByNumber].sort(
  (left, right) => Number(left[0]) - Number(right[0]),
)) {
  if (passages.size === 0) {
    empty.push(number);
    continue;
  }
  tasksWithEvidence++;
  const ordered = [...passages.values()].sort(
    (left, right) =>
      right.focusScore - left.focusScore ||
      right.text.length - left.text.length,
  );
  writeFileSync(
    `${outputDirectory}/${number}.md`,
    ordered
      .map(
        (passage, index) =>
          `--- [${index + 1}] focus=${passage.focusScore} ---\n${passage.text}`,
      )
      .join('\n\n'),
  );
}

console.log(`lines read ${linesRead}, parse failures ${parseFailures}`);
console.log(
  `evidence for ${tasksWithEvidence}/${wantedNumbers.size} task numbers`,
);
console.log(`NO EVIDENCE (${empty.length}): ${empty.join(' ')}`);
