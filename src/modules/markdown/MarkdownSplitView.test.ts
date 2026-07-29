import { expect, test } from 'bun:test';
import { ref } from 'vue';
import { ThemeIcons } from '../theme/ThemeIcons';
import { MarkdownSplitView } from './MarkdownSplitView';

test('source pane geometry reads the overridable extent seam', () => {
  class CustomMarkdownSplitView extends MarkdownSplitView.$Class {
    protected override paneExtentWidth(): number {
      return 100;
    }

    sourcePaneWidthForTest(): number {
      return this.sourcePaneWidth();
    }
  }

  const splitView = Object.create(
    CustomMarkdownSplitView.prototype,
  ) as CustomMarkdownSplitView;
  Object.defineProperty(splitView, 'options', {
    value: {
      settings: {
        markdownSplitRatio: { value: 0.3 },
      },
    },
  });
  Object.defineProperty(splitView, 'splitRatioSetting', {
    value: {
      value: ref(0.3),
      save() {},
      dispose() {},
    },
  });

  expect(splitView.sourcePaneWidthForTest()).toBe(30);
});

test('unchanged frames do not materialize the whole preview document', () => {
  let wholePreviewMaterializationCount = 0;
  class $MeasuredMarkdownSplitView extends MarkdownSplitView.$Class {
    protected override previewViewportWidth(): number {
      return 40;
    }

    synchronizeForTest(): boolean {
      return this.synchronizeRenderedPreviewDocument();
    }
  }

  const splitView = Object.create(
    $MeasuredMarkdownSplitView.prototype,
  ) as $MeasuredMarkdownSplitView;
  const previewState = {
    parsedRevision: 7,
    allRows: () => {
      wholePreviewMaterializationCount++;
      return [];
    },
    textForRow: () => '',
  };
  const tableBorders = ThemeIcons.Class.tableBordersFor('unicode');
  Object.defineProperties(splitView, {
    preview: { value: previewState },
    theme: { value: { tableBorders } },
    renderedPreviewText: { value: '', writable: true },
    renderedPreviewRevision: { value: 7, writable: true },
    renderedPreviewWidth: { value: 40, writable: true },
    renderedPreviewBorderSignature: {
      value: Object.values(tableBorders).join(''),
      writable: true,
    },
    previewTextBuffer: {
      value: {
        replaceText() {},
      },
    },
    options: {
      value: {
        findBar: {
          engineFor: () => null,
        },
      },
    },
    selectionRevision: { value: ref(0) },
  });

  expect(splitView.synchronizeForTest()).toBe(false);
  expect(wholePreviewMaterializationCount).toBe(0);

  previewState.parsedRevision = 8;
  splitView.synchronizeForTest();
  expect(wholePreviewMaterializationCount).toBe(1);
});

// invariant: A Markdown file offers a live source preview split (src/modules/markdown/markdown.invariants.md)
test('a source reveal waits for the preview revision that matches the source', () => {
  class $ProbedMarkdownSplitView extends MarkdownSplitView.$Class {
    queueSourceRevealForTest(lineIndex: number): void {
      this.pendingSourceRevealLine = lineIndex;
    }

    applySourceRevealForTest(): void {
      this.applyPendingSourceReveal();
    }

    protected override previewViewportWidth(): number {
      return 40;
    }

    protected override previewViewportHeight(): number {
      return 15;
    }
  }

  const revealedLines: number[] = [];
  const previewState = {
    parsedRevision: 6,
    revealSourceLine: (lineIndex: number) => {
      revealedLines.push(lineIndex);
      return true;
    },
  };
  const splitView = Object.create(
    $ProbedMarkdownSplitView.prototype,
  ) as $ProbedMarkdownSplitView;
  Object.defineProperties(splitView, {
    preview: { value: previewState },
    options: {
      value: {
        source: {
          revision: ref(7),
        },
      },
    },
    pendingSourceRevealLine: { value: null, writable: true },
  });

  splitView.queueSourceRevealForTest(24);
  splitView.applySourceRevealForTest();
  expect(revealedLines).toEqual([]);

  previewState.parsedRevision = 7;
  splitView.applySourceRevealForTest();
  expect(revealedLines).toEqual([24]);
});

// invariant: The Markdown preview opens itself and sits on the configured side (src/modules/markdown/markdown.invariants.md)
test('the preview side defaults to left and follows the option', () => {
  const defaultSplitView = Object.create(
    MarkdownSplitView.$Class.prototype,
  ) as InstanceType<typeof MarkdownSplitView.$Class>;
  Object.defineProperty(defaultSplitView, 'options', { value: {} });
  expect(defaultSplitView.previewSide).toBe('left');

  const rightSplitView = Object.create(
    MarkdownSplitView.$Class.prototype,
  ) as InstanceType<typeof MarkdownSplitView.$Class>;
  Object.defineProperty(rightSplitView, 'options', {
    value: { previewSide: 'right' },
  });
  expect(rightSplitView.previewSide).toBe('right');
});

// invariant: An unresolvable Markdown link states why (src/modules/markdown/markdown.invariants.md)
test('an unresolved authored link stays a reference; unresolved backtick text does not', () => {
  class $ProbedMarkdownSplitView extends MarkdownSplitView.$Class {
    referenceAtForTest(screenColumn: number, screenRow: number) {
      return this.referenceAt(screenColumn, screenRow);
    }
  }
  const buildSplitView = (
    hit: { key: string; target: string; explicitLink: boolean } | null,
    resolvedPath: string | null,
  ) => {
    const splitView = Object.create(
      $ProbedMarkdownSplitView.prototype,
    ) as $ProbedMarkdownSplitView;
    Object.defineProperties(splitView, {
      previewRenderable: { value: { referenceAtCell: () => hit } },
      options: { value: { resolveReference: () => resolvedPath } },
    });
    return splitView;
  };

  const unresolvedLink = buildSplitView(
    { key: '0:0:4:5', target: 'https://example.com', explicitLink: true },
    null,
  ).referenceAtForTest(0, 0);
  expect(unresolvedLink?.hit.target).toBe('https://example.com');
  expect(unresolvedLink?.path).toBeNull();

  const unresolvedCode = buildSplitView(
    { key: '0:0:4:6', target: 'not a path', explicitLink: false },
    null,
  ).referenceAtForTest(0, 0);
  expect(unresolvedCode).toBeNull();

  const resolvedCode = buildSplitView(
    { key: '0:0:4:6', target: 'src/main.ts', explicitLink: false },
    '/root/src/main.ts',
  ).referenceAtForTest(0, 0);
  expect(resolvedCode?.path).toBe('/root/src/main.ts');
});

test('link resolution verdicts are cached for one parse revision', () => {
  let resolutionCount = 0;
  class $ProbedMarkdownSplitView extends MarkdownSplitView.$Class {
    referenceIsDeadForTest(target: string): boolean {
      return this.referenceIsDead(target);
    }
  }
  const preview = {
    parsedRevision: 7,
    referenceTargets: () => [
      'missing.md',
      'present.md',
      'https://example.com/docs',
      'missing.md',
    ],
  };
  const splitView = Object.create(
    $ProbedMarkdownSplitView.prototype,
  ) as $ProbedMarkdownSplitView;
  Object.defineProperties(splitView, {
    preview: { value: preview },
    referenceVerdictRevision: { value: -1, writable: true },
    referenceDeadByTarget: { value: new Map<string, boolean>() },
    options: {
      value: {
        referenceIsExternal: (target: string) => target.startsWith('https:'),
        resolveReference: (target: string) => {
          resolutionCount += 1;
          return target === 'present.md' ? '/workspace/present.md' : null;
        },
      },
    },
  });

  expect(splitView.referenceIsDeadForTest('missing.md')).toBe(true);
  expect(splitView.referenceIsDeadForTest('present.md')).toBe(false);
  expect(splitView.referenceIsDeadForTest('https://example.com/docs')).toBe(
    false,
  );
  expect(resolutionCount).toBe(2);

  expect(splitView.referenceIsDeadForTest('missing.md')).toBe(true);
  expect(resolutionCount).toBe(2);

  preview.parsedRevision = 8;
  expect(splitView.referenceIsDeadForTest('missing.md')).toBe(true);
  expect(resolutionCount).toBe(4);
});
