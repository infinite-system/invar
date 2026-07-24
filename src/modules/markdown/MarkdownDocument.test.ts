import { test, expect } from 'bun:test';
import { Reactive } from 'ivue';
import { ref } from 'vue';
import { MarkdownDocument } from './MarkdownDocument';
import type { BlockRecord, MarkdownParseResult, MarkdownParser } from './MarkdownParser';

const waitForTaskTurn = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

const createParagraphBlock = (text: string): BlockRecord => ({
  kind: 'paragraph',
  text,
  spans: [],
  links: [],
  range: { startLine: 0, endLine: 1, startOffset: 0, endOffset: text.length },
});

/** A parser whose async results are resolved by hand, so revision races are deterministic. */
class DeferredParser {
  readonly pending: {
    revision: number;
    resolve: (result: MarkdownParseResult) => void;
  }[] = [];
  parseCount = 0;
  disposeCount = 0;
  parse(_sourceText: string, revision = 0): MarkdownParseResult {
    return { revision, blocks: [] };
  }
  parseAsync(_sourceText: string, revision: number): Promise<MarkdownParseResult> {
    this.parseCount++;
    return new Promise((resolve) => this.pending.push({ revision, resolve }));
  }
  settle(revision: number, blocks: BlockRecord[]): void {
    this.pending.find((entry) => entry.revision === revision)!.resolve({ revision, blocks });
  }
  dispose(): void {
    this.disposeCount++;
  }
}

// Exercises the createParser() construction seam (Construction goes through overridable seams).
class $TestDocument extends MarkdownDocument.$Class {
  parserCreated = 0;
  lastParser: DeferredParser | null = null;
  protected override createParser() {
    this.parserCreated++;
    this.lastParser = new DeferredParser();
    return this.lastParser as unknown as MarkdownParser.Model;
  }
}
const TestDocument = Reactive($TestDocument);

const createSource = (initialRevision = 1) => {
  const revision = ref(initialRevision);
  const state = { text: 'seed' };
  return { revision, state, text: () => state.text };
};

test('empty blocks remain an overridable late-bound seam', () => {
  const replacementEmptyBlocks = Object.freeze([
    createParagraphBlock('replacement'),
  ]);
  class $CustomMarkdownDocument extends MarkdownDocument.$Class {
    protected static override get $emptyBlocks(): readonly BlockRecord[] {
      return replacementEmptyBlocks;
    }
  }
  const CustomMarkdownDocument = Reactive($CustomMarkdownDocument);

  const document = new CustomMarkdownDocument(createSource());
  expect(document.blocks.value).toBe(replacementEmptyBlocks);
});

// invariant: Parsing starts only after opening (src/modules/markdown/markdown.invariants.md)
test('does not parse or allocate a parser before open', async () => {
  const source = createSource();
  const document = new TestDocument(source, { debounceMs: 0 });

  expect(document.opened.value).toBe(false);
  expect(document.revision.value).toBe(-1);
  expect(document.blocks.value).toHaveLength(0);
  expect(document.parserCreated).toBe(0);

  // mutating the source before open must not arm any parse (no watcher exists yet)
  source.revision.value = 5;
  await waitForTaskTurn();
  expect(document.parserCreated).toBe(0);
  expect(document.revision.value).toBe(-1);
});

// invariant: Parsing starts only after opening (src/modules/markdown/markdown.invariants.md)
test('parses the source after open', async () => {
  const source = createSource(3);
  const document = new TestDocument(source, { debounceMs: 0 });
  document.open();
  expect(document.parserCreated).toBe(1);
  await waitForTaskTurn();
  document.lastParser!.settle(3, [createParagraphBlock('hello')]);
  await waitForTaskTurn();
  expect(document.revision.value).toBe(3);
  expect(document.blocks.value.map((block) => block.text)).toEqual(['hello']);
});

// invariant: Applied blocks match the current revision (src/modules/markdown/markdown.invariants.md)
test('discards a stale parse whose revision no longer matches the source', async () => {
  const source = createSource(1);
  const document = new TestDocument(source, { debounceMs: 0 });
  document.open();
  await waitForTaskTurn(); // startParse(rev 1) is now awaiting the deferred parser

  // source advances to revision 2 while the rev-1 parse is still in flight
  source.state.text = 'updated';
  source.revision.value = 2; // sync watch → schedules parse(rev 2)
  await waitForTaskTurn(); // startParse(rev 2) now awaiting

  // the STALE result (rev 1) resolves first — it must be dropped, never applied
  document.lastParser!.settle(1, [createParagraphBlock('STALE')]);
  await waitForTaskTurn();
  expect(document.revision.value).toBe(-1); // nothing applied yet
  expect(document.blocks.value).toHaveLength(0);

  // the current result (rev 2) resolves and IS applied
  document.lastParser!.settle(2, [createParagraphBlock('FRESH')]);
  await waitForTaskTurn();
  expect(document.revision.value).toBe(2);
  expect(document.blocks.value.map((block) => block.text)).toEqual(['FRESH']);
  // the stale block never reached the model
  expect(document.blocks.value.some((block) => block.text === 'STALE')).toBe(false);
});

// invariant: Closing releases all preview work (src/modules/markdown/markdown.invariants.md)
test('close disposes the parser stops effects and resets state', async () => {
  const source = createSource(4);
  const document = new TestDocument(source, { debounceMs: 0 });
  document.open();
  await waitForTaskTurn();
  document.lastParser!.settle(4, [createParagraphBlock('body')]);
  await waitForTaskTurn();
  expect(document.blocks.value).toHaveLength(1);

  const parser = document.lastParser!;
  document.close();
  expect(document.opened.value).toBe(false);
  expect(document.revision.value).toBe(-1);
  expect(document.blocks.value).toHaveLength(0);
  expect(parser.disposeCount).toBe(1);

  // after close the source watcher is gone: further edits arm no parse
  const parsesBefore = parser.parseCount;
  source.state.text = 'ignored';
  source.revision.value = 99;
  await waitForTaskTurn();
  expect(parser.parseCount).toBe(parsesBefore);
  expect(document.parserCreated).toBe(1); // no new parser materialized
});
