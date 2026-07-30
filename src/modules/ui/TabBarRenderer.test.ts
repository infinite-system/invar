import { expect, test } from 'bun:test';
import { TextCoordinates } from '../text/TextCoordinates';
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
