import { expect, test } from 'bun:test';
import { DocumentLifecycle } from '../workspace/DocumentLifecycle';
import { TextDocument } from '../text/TextDocument';
import type { Workspace } from '../workspace/Workspace';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import { StructureOutline } from './StructureOutline';
import type {
  StructureOutlineResult,
  StructureSource,
} from './StructureSource.interface';

interface EditorCalls {
  placeCursor: Array<{ line: number; column: number }>;
  revealCursor: number;
}

function makeWorkspace(document: TextDocument.Instance | null) {
  const editorCalls: EditorCalls = { placeCursor: [], revealCursor: 0 };
  const calls = {
    editorCalls,
    recordCurrentLocation: 0,
    focusEditor: 0,
  };
  const workspace = {
    providers: new ProviderRegistry.Class(),
    documentLifecycle: new DocumentLifecycle.Class(),
    activeDocumentHandle: document ? { document } : null,
    editor: {
      placeCursor: (line: number, column: number) => {
        editorCalls.placeCursor.push({ line, column });
      },
      revealCursor: () => {
        editorCalls.revealCursor += 1;
      },
    },
    focusEditor: () => {
      calls.focusEditor += 1;
    },
    recordCurrentLocation: () => {
      calls.recordCurrentLocation += 1;
    },
  };
  return {
    workspace: workspace as unknown as Workspace.Model,
    calls,
    setDocument(next: TextDocument.Instance | null) {
      (
        workspace as unknown as {
          activeDocumentHandle: { document: TextDocument.Instance } | null;
        }
      ).activeDocumentHandle = next ? { document: next } : null;
    },
  };
}

function makeDocument(path: string, text = 'class A {}\n') {
  const document = new TextDocument.Class();
  document.loadFromText(text, path);
  return document;
}

function makeSource(
  result: StructureOutlineResult | null,
  overrides: Partial<StructureSource> = {},
): StructureSource & { requests: number } {
  const source = {
    requests: 0,
    supportsDocument: () => true,
    documentSymbols: async () => {
      source.requests += 1;
      return result;
    },
    structureNotice: () => null as string | null,
    ...overrides,
  };
  return source;
}

const READY_RESULT: StructureOutlineResult = {
  truncated: false,
  symbols: [
    {
      name: 'Beta',
      symbolClass: 'type',
      line: 4,
      column: 6,
      endLine: 9,
      children: [
        {
          name: 'method',
          symbolClass: 'callable',
          line: 5,
          column: 2,
          endLine: 6,
          children: [],
        },
      ],
    },
    {
      name: 'alpha',
      symbolClass: 'callable',
      line: 0,
      column: 9,
      endLine: 2,
      children: [],
    },
  ],
};

const DEEP_RESULT: StructureOutlineResult = {
  truncated: false,
  symbols: [
    {
      name: 'Widget',
      symbolClass: 'type',
      line: 0,
      column: 6,
      endLine: 12,
      children: [
        {
          name: 'render',
          symbolClass: 'callable',
          line: 2,
          column: 2,
          endLine: 10,
          children: [
            {
              name: 'innerTask',
              symbolClass: 'callable',
              line: 4,
              column: 4,
              endLine: 6,
              children: [],
            },
          ],
        },
      ],
    },
    {
      name: 'helper',
      symbolClass: 'callable',
      line: 14,
      column: 0,
      endLine: 16,
      children: [],
    },
  ],
};

test('a refresh projects the symbol tree at the default depth in document order', async () => {
  const context = makeWorkspace(makeDocument('/tmp/a.ts'));
  const source = makeSource(READY_RESULT);
  const dispose = context.workspace.providers.register('structure', source);
  const outline = new StructureOutline.Class(context.workspace, () => true);
  try {
    await outline.refresh();
    expect(outline.status.value).toBe('ready');
    expect(outline.requestCount.value).toBe(1);
    expect(
      outline.rows.value.map((row) => [row.name, row.depth, row.line]),
    ).toEqual([
      ['alpha', 0, 0],
      ['Beta', 0, 4],
      ['method', 1, 5],
    ]);
    expect(outline.notice.value).toBeNull();
  } finally {
    dispose();
    outline.dispose();
  }
});

test('depth is session-scoped per file, defaults to one, and reset rejoins the setting', async () => {
  const firstDocument = makeDocument('/tmp/depth-first.ts');
  const secondDocument = makeDocument('/tmp/depth-second.ts');
  const context = makeWorkspace(firstDocument);
  const source = makeSource(DEEP_RESULT);
  const dispose = context.workspace.providers.register('structure', source);
  let defaultDepth = 1;
  const outline = new StructureOutline.Class(
    context.workspace,
    () => true,
    () => defaultDepth,
  );
  try {
    await outline.refresh();
    expect(outline.rows.value.map((row) => row.name)).toEqual([
      'Widget',
      'render',
      'helper',
    ]);
    expect(outline.depth).toBe(1);
    expect(outline.depthIsOverridden).toBe(false);

    outline.setDepthForActiveFile(2);
    expect(outline.rows.value.map((row) => row.name)).toEqual([
      'Widget',
      'render',
      'innerTask',
      'helper',
    ]);
    expect(outline.depthIsOverridden).toBe(true);

    context.setDocument(secondDocument);
    await outline.refresh();
    expect(outline.depth).toBe(1);
    expect(outline.depthIsOverridden).toBe(false);
    outline.setDepthForActiveFile(0);
    expect(outline.rows.value.map((row) => row.name)).toEqual([
      'Widget',
      'helper',
    ]);

    context.setDocument(firstDocument);
    await outline.refresh();
    expect(outline.depth).toBe(2);
    outline.resetDepthForActiveFile();
    expect(outline.depth).toBe(1);
    expect(outline.depthIsOverridden).toBe(false);

    defaultDepth = 0;
    outline.refreshProjection();
    expect(outline.rows.value.map((row) => row.name)).toEqual([
      'Widget',
      'helper',
    ]);
  } finally {
    dispose();
    outline.dispose();
  }
});

test('row folds override the depth projection without changing the file depth', async () => {
  const context = makeWorkspace(makeDocument('/tmp/folds.ts'));
  const source = makeSource(DEEP_RESULT);
  const dispose = context.workspace.providers.register('structure', source);
  const outline = new StructureOutline.Class(context.workspace, () => true);
  try {
    await outline.refresh();
    expect(outline.rows.value[0]?.childrenVisible).toBe(true);
    expect(outline.toggleSelectedFold()).toBe(true);
    expect(outline.rows.value.map((row) => row.name)).toEqual([
      'Widget',
      'helper',
    ]);
    expect(outline.depth).toBe(1);

    expect(outline.toggleSelectedFold()).toBe(true);
    expect(outline.rows.value.map((row) => row.name)).toEqual([
      'Widget',
      'render',
      'helper',
    ]);
    outline.setSelection(1);
    expect(outline.rows.value[1]?.childrenVisible).toBe(false);
    expect(outline.toggleSelectedFold()).toBe(true);
    expect(outline.rows.value.map((row) => row.name)).toEqual([
      'Widget',
      'render',
      'innerTask',
      'helper',
    ]);
  } finally {
    dispose();
    outline.dispose();
  }
});

test('filtering uses the shared fuzzy score across hidden depths and Escape restores depth', async () => {
  const context = makeWorkspace(makeDocument('/tmp/filter.ts'));
  const source = makeSource(DEEP_RESULT);
  const dispose = context.workspace.providers.register('structure', source);
  const outline = new StructureOutline.Class(context.workspace, () => true);
  try {
    await outline.refresh();
    expect(outline.rows.value.some((row) => row.name === 'innerTask')).toBe(
      false,
    );

    outline.insertFilterText('ik');
    expect(outline.filterInput.value).toBe('ik');
    expect(outline.rows.value.map((row) => row.name)).toEqual(['innerTask']);
    expect(outline.rows.value[0]?.childrenVisible).toBe(false);
    expect(outline.toggleSelectedFold()).toBe(false);

    expect(outline.clearFilter()).toBe(true);
    expect(outline.rows.value.map((row) => row.name)).toEqual([
      'Widget',
      'render',
      'helper',
    ]);
    expect(outline.clearFilter()).toBe(false);

    outline.insertFilterText('ik');
    context.setDocument(makeDocument('/tmp/filter-second.ts'));
    await outline.refresh();
    expect(outline.filterInput.value).toBe('');
  } finally {
    dispose();
    outline.dispose();
  }
});

test('every rows-absent state carries a stated reason, never a blank', async () => {
  // No document open.
  const noDocument = makeWorkspace(null);
  const bareOutline = new StructureOutline.Class(
    noDocument.workspace,
    () => true,
  );
  await bareOutline.refresh();
  expect(bareOutline.status.value).toBe('no-document');
  bareOutline.dispose();

  // No source installed.
  const noSource = makeWorkspace(makeDocument('/tmp/b.ts'));
  const sourcelessOutline = new StructureOutline.Class(
    noSource.workspace,
    () => true,
  );
  await sourcelessOutline.refresh();
  expect(sourcelessOutline.status.value).toBe('unavailable');
  expect(sourcelessOutline.notice.value).toContain('Extensions');
  sourcelessOutline.dispose();

  // A source that does not support the file.
  const unsupported = makeWorkspace(makeDocument('/tmp/c.txt'));
  const unsupportedSource = makeSource(READY_RESULT, {
    supportsDocument: () => false,
  });
  const disposeUnsupported = unsupported.workspace.providers.register(
    'structure',
    unsupportedSource,
  );
  const unsupportedOutline = new StructureOutline.Class(
    unsupported.workspace,
    () => true,
  );
  await unsupportedOutline.refresh();
  expect(unsupportedOutline.status.value).toBe('unavailable');
  expect(unsupportedOutline.notice.value).toContain('file type');
  expect(unsupportedOutline.requestCount.value).toBe(0);
  disposeUnsupported();
  unsupportedOutline.dispose();

  // A source that declines with its own notice (the size budget shape).
  const declined = makeWorkspace(makeDocument('/tmp/d.ts'));
  const decliningSource = makeSource(null, {
    structureNotice: () => 'Large file — language features off',
  });
  const disposeDeclined = declined.workspace.providers.register(
    'structure',
    decliningSource,
  );
  const declinedOutline = new StructureOutline.Class(
    declined.workspace,
    () => true,
  );
  await declinedOutline.refresh();
  expect(declinedOutline.status.value).toBe('unavailable');
  expect(declinedOutline.notice.value).toContain('Large file');
  disposeDeclined();
  declinedOutline.dispose();
});

test('a truncated result states the cap instead of presenting a shorter outline', async () => {
  const context = makeWorkspace(makeDocument('/tmp/e.ts'));
  const source = makeSource({ ...READY_RESULT, truncated: true });
  const dispose = context.workspace.providers.register('structure', source);
  const outline = new StructureOutline.Class(context.workspace, () => true);
  try {
    await outline.refresh();
    expect(outline.truncated.value).toBe(true);
    expect(outline.notice.value).toContain('truncated');
  } finally {
    dispose();
    outline.dispose();
  }
});

test('with several sources installed, the newest one that supports the document answers', async () => {
  const context = makeWorkspace(makeDocument('/tmp/multi.md'));
  const codeSource = makeSource(READY_RESULT, {
    supportsDocument: (document) => document.path.endsWith('.ts'),
  });
  const markdownResult: StructureOutlineResult = {
    truncated: false,
    symbols: [
      {
        name: 'Heading',
        symbolClass: 'module',
        line: 0,
        column: 0,
        endLine: 3,
        children: [],
      },
    ],
  };
  const markdownSource = makeSource(markdownResult, {
    supportsDocument: (document) => document.path.endsWith('.md'),
  });
  const disposeCode = context.workspace.providers.register(
    'structure',
    codeSource,
  );
  const disposeMarkdown = context.workspace.providers.register(
    'structure',
    markdownSource,
  );
  const outline = new StructureOutline.Class(context.workspace, () => true);
  try {
    // The .md document routes past the code source to the markdown source.
    await outline.refresh();
    expect(outline.status.value).toBe('ready');
    expect(outline.rows.value.map((row) => row.name)).toEqual(['Heading']);
    expect(codeSource.requests).toBe(0);
    expect(markdownSource.requests).toBe(1);

    // The .ts document still reaches the earlier-registered code source.
    context.setDocument(makeDocument('/tmp/multi.ts'));
    await outline.refresh();
    expect(outline.status.value).toBe('ready');
    expect(codeSource.requests).toBe(1);

    // A document neither source supports states the file-type affordance.
    context.setDocument(makeDocument('/tmp/multi.css'));
    await outline.refresh();
    expect(outline.status.value).toBe('unavailable');
    expect(outline.notice.value).toContain('file type');
  } finally {
    disposeCode();
    disposeMarkdown();
    outline.dispose();
  }
});

test('an unobserved outline issues no request at any document size', async () => {
  const context = makeWorkspace(makeDocument('/tmp/f.ts'));
  const source = makeSource(READY_RESULT);
  const dispose = context.workspace.providers.register('structure', source);
  const outline = new StructureOutline.Class(context.workspace, () => false);
  try {
    await outline.refresh();
    expect(source.requests).toBe(0);
    expect(outline.requestCount.value).toBe(0);
  } finally {
    dispose();
    outline.dispose();
  }
});

test('an answer for text the document moved past is discarded and the rows keep', async () => {
  const document = makeDocument('/tmp/g.ts');
  const context = makeWorkspace(document);
  let resultToServe: StructureOutlineResult = READY_RESULT;
  const source = makeSource(READY_RESULT, {
    documentSymbols: async () => resultToServe,
  });
  const dispose = context.workspace.providers.register('structure', source);
  const outline = new StructureOutline.Class(context.workspace, () => true);
  try {
    await outline.refresh();
    expect(outline.rows.value.length).toBe(3);
    const versionBefore = outline.version.value;
    // The next answer arrives AFTER the document advanced: it must be dropped.
    resultToServe = { truncated: false, symbols: [] };
    const staleRefresh = (async () => {
      const refresh = outline.refresh();
      document.insertInline(0, 0, 'x');
      await refresh;
    })();
    await staleRefresh;
    expect(outline.rows.value.length).toBe(3);
    expect(outline.version.value).toBe(versionBefore);
  } finally {
    dispose();
    outline.dispose();
  }
});

test('selection moves clamped, stays visible, and jumps through the view contract', async () => {
  const context = makeWorkspace(makeDocument('/tmp/h.ts'));
  const source = makeSource(READY_RESULT);
  const dispose = context.workspace.providers.register('structure', source);
  const outline = new StructureOutline.Class(context.workspace, () => true);
  try {
    await outline.refresh();
    outline.viewportHeight.value = 2;
    outline.moveSelection(1);
    outline.moveSelection(1);
    outline.moveSelection(1); // clamped at the last row
    expect(outline.selectedIndex.value).toBe(2);
    // The third row scrolled into view.
    expect(outline.scrollTop.value).toBe(1);
    expect(outline.activateSelected()).toBe(true);
    // 'method' is row 2: the jump lands on its name through placeCursor/revealCursor,
    // focus returns to the editor, and both endpoints are recorded for Back/Forward.
    expect(context.calls.editorCalls.placeCursor).toEqual([
      { line: 5, column: 2 },
    ]);
    expect(context.calls.editorCalls.revealCursor).toBe(1);
    expect(context.calls.focusEditor).toBe(1);
    expect(context.calls.recordCurrentLocation).toBe(2);
    // With no rows there is nothing to activate.
    context.setDocument(null);
    await outline.refresh();
    expect(outline.activateSelected()).toBe(false);
  } finally {
    dispose();
    outline.dispose();
  }
});
