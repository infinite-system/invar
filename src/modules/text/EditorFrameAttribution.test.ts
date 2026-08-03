import { expect, test } from 'bun:test';
import { EditorFrameAttribution } from './EditorFrameAttribution';

test('attributes editor work to one completed frame and cumulative totals', () => {
  const attribution = new EditorFrameAttribution.Class();
  const document = {
    lineCount: 2,
    revision: { value: 1 },
    line(lineIndex: number): string {
      return ['first', 'second'][lineIndex] ?? '';
    },
  };
  const attributedDocument = attribution.attributedDocument(document);

  attribution.beginFrame();
  expect(attributedDocument.line(0)).toBe('first');
  attribution.recordFoldProjectionLookup();
  attribution.recordWrapProjectionLookup();
  attribution.recordLayoutComputation();
  attribution.completeFrame();

  attribution.beginFrame();
  expect(attributedDocument.line(1)).toBe('second');
  attribution.recordFoldProjectionLookup();
  attribution.completeFrame();

  expect(attribution.snapshot).toEqual({
    latestFrame: {
      documentLineReads: 1,
      foldProjectionLookups: 1,
      wrapProjectionLookups: 0,
      layoutComputations: 0,
    },
    totals: {
      completedFrameCount: 2,
      documentLineReads: 2,
      foldProjectionLookups: 2,
      wrapProjectionLookups: 1,
      layoutComputations: 1,
    },
  });
});

test('reuses one attributed document without counting outside a frame', () => {
  const attribution = new EditorFrameAttribution.Class();
  const document = {
    lineCount: 1,
    revision: { value: 1 },
    line(): string {
      return 'line';
    },
  };

  const firstAttributedDocument = attribution.attributedDocument(document);
  expect(attribution.attributedDocument(document)).toBe(
    firstAttributedDocument,
  );
  expect(firstAttributedDocument.line(0)).toBe('line');
  attribution.recordLayoutComputation();
  expect(attribution.snapshot.totals).toEqual({
    completedFrameCount: 0,
    documentLineReads: 0,
    foldProjectionLookups: 0,
    wrapProjectionLookups: 0,
    layoutComputations: 0,
  });
});

test('forwards the document change fact through the attribution boundary', () => {
  const attribution = new EditorFrameAttribution.Class();
  const lastLineChange = {
    deletedLineCount: 1,
    insertedLineCount: 1,
    revision: 2,
    startLineIndex: 500_000,
  };
  const document = {
    lineCount: 1_000_000,
    revision: { value: 2 },
    lastLineChange,
    line(): string {
      return 'line';
    },
  };

  const attributedDocument = attribution.attributedDocument(document);
  expect(attributedDocument.lastLineChange).toBe(lastLineChange);
  lastLineChange.startLineIndex = 500_001;
  expect(attributedDocument.lastLineChange?.startLineIndex).toBe(500_001);
});
