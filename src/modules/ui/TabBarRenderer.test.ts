import { expect, test } from 'bun:test';
import { TextCoordinates } from '../text/TextCoordinates';
import { ThemeIcons } from '../theme/ThemeIcons';
import { ThemePalettes } from '../theme/ThemePalettes';
import { TabBarRenderer } from './TabBarRenderer';
import { TabStrip } from './TabStrip';

test('tab bar rendering remains available through its static class seam', () => {
  expect(TabBarRenderer.Class.renderBuffer).toBeFunction();
});

test('breadcrumb keeps editor actions right-aligned outside the path area', () => {
  const strip = new TabStrip.Class('horizontal', () => [
    {
      identifier: '/project/a/very/long/path/README.md',
      label: 'README.md',
      active: true,
    },
  ]);
  const editorTitleActions = [
    {
      commandId: 'markdown.togglePreview',
      title: 'Markdown: Toggle Preview',
      icon: '◫',
      toggled: true,
    },
  ];
  const projection = TabBarRenderer.Class.renderBreadcrumb({
    strip,
    palette: ThemePalettes.Class.DARK,
    barWidth: 24,
    projectRoot: '/project',
    hoveredSourceIndex: null,
    hover: null,
    pressedTitleActionIndex: null,
    editorTitleActions,
    navigationBackGlyph: '❮',
    navigationForwardGlyph: '❯',
    canGoBack: false,
    canGoForward: false,
  });
  const renderedText = projection.text.chunks
    .map((chunk) => chunk.text)
    .join('');
  const action = projection.segments.find(
    (segment) => segment.kind === 'titleAction',
  );

  expect(TextCoordinates.Class.lineWidth(renderedText)).toBe(24);
  expect(renderedText.endsWith(' ◫ ')).toBe(true);
  expect(action).toEqual({
    kind: 'titleAction',
    index: 0,
    start: 21,
    end: 24,
  });
  expect(
    projection.segments
      .filter((segment) => segment.kind === 'crumb')
      .every((segment) => segment.end <= 21),
  ).toBe(true);
});

test('breadcrumb history owns two padded three-cell targets without an open file', () => {
  const projection = TabBarRenderer.Class.renderBreadcrumb({
    strip: new TabStrip.Class('horizontal', () => []),
    palette: ThemePalettes.Class.DARK,
    barWidth: 20,
    projectRoot: '/project',
    hoveredSourceIndex: null,
    hover: { kind: 'historyBack' },
    pressedTitleActionIndex: null,
    editorTitleActions: [],
    navigationBackGlyph: '❮',
    navigationForwardGlyph: '❯',
    canGoBack: false,
    canGoForward: false,
  });
  const text = projection.text.chunks.map((chunk) => chunk.text).join('');

  expect(text).toBe(' ❮  ❯ '.padEnd(20, ' '));
  expect(projection.segments).toEqual([
    { kind: 'historyBack', start: 0, end: 3 },
    { kind: 'historyForward', start: 3, end: 6 },
  ]);
});

test('buffer tab row does not render editor title actions', () => {
  const strip = new TabStrip.Class('horizontal', () => [
    {
      identifier: '/project/README.md',
      label: 'README.md',
      active: true,
      closable: true,
    },
  ]);
  const projection = TabBarRenderer.Class.renderBuffer({
    strip,
    palette: ThemePalettes.Class.DARK,
    barWidth: 40,
    projectRoot: '/project',
    separatorGlyph: '❯',
    closeGlyph: '×',
    tabMarkerGlyph: '●',
    hover: null,
    closePressed: null,
    arrowPressed: null,
    lastRevealedIndex: -1,
  });
  const renderedText = projection.text.chunks
    .map((chunk) => chunk.text)
    .join('');

  expect(renderedText.includes('◫')).toBe(false);
});

test('tab marker uses the tiered theme slot in every tab strip', () => {
  const workspaceItems = [
    {
      identifier: '/project',
      label: 'project',
      detailLabel: 'main',
      active: true,
    },
  ];
  const bufferStrip = new TabStrip.Class('horizontal', () => [
    {
      identifier: '/project/README.md',
      label: 'README.md',
      active: true,
      dirty: true,
      closable: true,
    },
  ]);

  for (const glyphLevel of ['nerd', 'unicode', 'ascii'] as const) {
    const tabMarkerGlyph = ThemeIcons.Class.glyphFor(
      glyphLevel,
      'tabDirtyMarker',
    );
    const workspaceRenderContext = {
      palette: ThemePalettes.Class.DARK,
      hover: null,
      lastRevealedIndex: -1,
      barWidthValue: 40,
      barHeightValue: 8,
      rendererWidth: 80,
      rendererHeight: 24,
      closeGlyph: ThemeIcons.Class.glyphFor(glyphLevel, 'panelClose'),
      tabMarkerGlyph,
    } as const;
    const horizontalWorkspaceText = TabBarRenderer.Class.renderWorkspace({
      ...workspaceRenderContext,
      strip: new TabStrip.Class('horizontal', () => workspaceItems),
    })
      .text.chunks.map((chunk) => chunk.text)
      .join('');
    const verticalWorkspaceText = TabBarRenderer.Class.renderWorkspace({
      ...workspaceRenderContext,
      strip: new TabStrip.Class('vertical', () => workspaceItems),
    })
      .text.chunks.map((chunk) => chunk.text)
      .join('');
    const bufferText = TabBarRenderer.Class.renderBuffer({
      strip: bufferStrip,
      palette: ThemePalettes.Class.DARK,
      barWidth: 40,
      projectRoot: '/project',
      separatorGlyph: ThemeIcons.Class.tabSeparatorFor(glyphLevel),
      closeGlyph: ThemeIcons.Class.glyphFor(glyphLevel, 'panelClose'),
      tabMarkerGlyph,
      hover: null,
      closePressed: null,
      arrowPressed: null,
      lastRevealedIndex: -1,
    })
      .text.chunks.map((chunk) => chunk.text)
      .join('');

    expect(horizontalWorkspaceText.includes(tabMarkerGlyph)).toBe(true);
    expect(verticalWorkspaceText.includes(tabMarkerGlyph)).toBe(true);
    expect(bufferText.includes(tabMarkerGlyph)).toBe(true);
  }
});
