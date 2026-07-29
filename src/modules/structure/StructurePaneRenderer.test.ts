import { fg } from '@opentui/core';
import { expect, test } from 'bun:test';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import { DocumentLifecycle } from '../workspace/DocumentLifecycle';
import type { Workspace } from '../workspace/Workspace';
import { StructureOutline } from './StructureOutline';
import { StructurePaneRenderer } from './StructurePaneRenderer';
import { ThemeIcons } from '../theme/ThemeIcons';
import { ThemePalettes } from '../theme/ThemePalettes';

function makeOutline(): StructureOutline.Model {
  const workspace = {
    documentLifecycle: new DocumentLifecycle.Class(),
    providers: new ProviderRegistry.Class(),
    activeDocumentHandle: null,
  } as unknown as Workspace.Model;
  return new StructureOutline.Class(workspace, () => true);
}

function renderedText(styled: { chunks: unknown }): string {
  return (styled.chunks as { text: string }[])
    .map((chunk) => chunk.text)
    .join('');
}

function foregroundOfText(
  styled: ReturnType<typeof StructurePaneRenderer.Class.render>,
  text: string,
): unknown {
  return styled.chunks.find((chunk) => chunk.text.includes(text))?.fg;
}

test('the structure search mark keeps one leading cell', () => {
  const outline = makeOutline();
  outline.filterInput.setValue('needle');
  const rendered = renderedText(
    StructurePaneRenderer.Class.render({
      outline,
      structureFocused: true,
      palette: ThemePalettes.Class.DARK,
      symbolMarks: ThemeIcons.Class.symbolMarksFor('ascii'),
      structureMarks: ThemeIcons.Class.interfaceGlyphVocabularyFor('ascii'),
      searchGlyph: '/',
      defaultDepth: 1,
      height: 5,
      innerWidth: 30,
      viewportWidth: 29,
    }),
  );
  expect(rendered.split('\n')[0]).toStartWith(' / needle');
  outline.dispose();
});

test('renders only the visible window of a large outline', () => {
  const outline = makeOutline();
  outline.rows.value = Array.from({ length: 5_000 }, (_, index) => ({
    depth: 0,
    name: `symbol${index}`,
    symbolClass: 'callable' as const,
    line: index,
    column: 0,
    endLine: index,
  }));
  outline.status.value = 'ready';
  outline.viewportHeight.value = 5;
  outline.scrollTop.value = 2_000;
  const rendered = renderedText(
    StructurePaneRenderer.Class.render({
      outline,
      structureFocused: false,
      palette: ThemePalettes.Class.DARK,
      symbolMarks: ThemeIcons.Class.symbolMarksFor('ascii'),
      structureMarks: ThemeIcons.Class.interfaceGlyphVocabularyFor('ascii'),
      defaultDepth: 1,
      height: 5,
      innerWidth: 30,
      viewportWidth: 29,
    }),
  );
  expect(rendered).toContain('symbol2000');
  expect(rendered).toContain('symbol2004');
  expect(rendered).not.toContain('symbol2005');
  expect(rendered).not.toContain('symbol0 ');
  outline.dispose();
});

test('a rows-absent outline paints its stated reason and wraps the notice', () => {
  const outline = makeOutline();
  outline.status.value = 'unavailable';
  outline.notice.value =
    'No structure source is installed. ' +
    'Enable Language Intelligence in Extensions (Ctrl+Shift+X).';
  const rendered = renderedText(
    StructurePaneRenderer.Class.render({
      outline,
      structureFocused: true,
      palette: ThemePalettes.Class.DARK,
      symbolMarks: ThemeIcons.Class.symbolMarksFor('unicode'),
      structureMarks: ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode'),
      defaultDepth: 1,
      height: 10,
      innerWidth: 30,
      viewportWidth: 28,
    }),
  );
  expect(rendered).toContain('No structure available.');
  expect(rendered).toContain('Ctrl+Shift+X');
  outline.dispose();
});

test('semantic marks stay in fixed columns and getters carry the information color in both themes', () => {
  const outline = makeOutline();
  outline.rows.value = [
    {
      depth: 0,
      name: '$cachedGetter',
      symbolClass: 'value',
      line: 0,
      column: 0,
      endLine: 0,
      visibility: 'private',
      cached: true,
      override: true,
      accessor: 'getter',
    },
  ];
  outline.status.value = 'ready';
  const structureMarks =
    ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode');

  for (const palette of [ThemePalettes.Class.DARK, ThemePalettes.Class.LIGHT]) {
    const rendered = StructurePaneRenderer.Class.render({
      outline,
      structureFocused: false,
      palette,
      symbolMarks: ThemeIcons.Class.symbolMarksFor('unicode'),
      structureMarks,
      defaultDepth: 1,
      height: 5,
      innerWidth: 40,
      viewportWidth: 39,
    });
    const text = renderedText(rendered);
    expect(text).toContain(
      `${structureMarks.structurePrivate}` +
        `${structureMarks.structureGetter}` +
        `${structureMarks.structureCached}` +
        `${structureMarks.structureOverride} $cachedGetter`,
    );
    expect(foregroundOfText(rendered, structureMarks.structurePrivate)).toEqual(
      fg(palette.warning)(structureMarks.structurePrivate).fg,
    );
    expect(foregroundOfText(rendered, structureMarks.structureGetter)).toEqual(
      fg(palette.info)(structureMarks.structureGetter).fg,
    );
    expect(foregroundOfText(rendered, '$cachedGetter')).toEqual(
      fg(palette.info)('$cachedGetter').fg,
    );
  }
  outline.dispose();
});
