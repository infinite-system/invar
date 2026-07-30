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

test('one kind glyph carries structure semantics and line numbers are opt-in', () => {
  const outline = makeOutline();
  outline.rows.value = [
    {
      depth: 0,
      name: 'privateValue',
      symbolClass: 'value',
      line: 42,
      column: 0,
      endLine: 42,
      visibility: 'private',
    },
  ];
  outline.status.value = 'ready';
  const valueMark = ThemeIcons.Class.symbolMarksFor('unicode').value;

  for (const palette of [ThemePalettes.Class.DARK, ThemePalettes.Class.LIGHT]) {
    const rendered = StructurePaneRenderer.Class.render({
      outline,
      structureFocused: false,
      palette,
      symbolMarks: ThemeIcons.Class.symbolMarksFor('unicode'),
      structureMarks: ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode'),
      defaultDepth: 1,
      height: 5,
      innerWidth: 40,
      viewportWidth: 39,
    });
    const text = renderedText(rendered);
    expect(text).toContain(`${valueMark} privateValue`);
    expect(text).not.toContain(':43');
    expect(text).not.toContain(' 43');
    expect(foregroundOfText(rendered, valueMark)).toEqual(
      fg(palette.warning)(valueMark).fg,
    );
  }

  const withLineNumber = StructurePaneRenderer.Class.render({
    outline,
    structureFocused: false,
    palette: ThemePalettes.Class.DARK,
    symbolMarks: ThemeIcons.Class.symbolMarksFor('unicode'),
    structureMarks: ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode'),
    defaultDepth: 1,
    showLineNumbers: true,
    height: 5,
    innerWidth: 40,
    viewportWidth: 39,
  });
  expect(renderedText(withLineNumber)).toContain(
    `${valueMark} privateValue 43`,
  );
  expect(renderedText(withLineNumber)).not.toContain(':43');
  expect(foregroundOfText(withLineNumber, ' 43')).toEqual(
    fg(ThemePalettes.Class.DARK.dim)(' 43').fg,
  );
  outline.dispose();
});

test('semantic classes color or emphasize the one kind glyph in both themes', () => {
  const semantics = [
    { name: 'publicValue', visibility: 'public' as const, color: 'added' },
    {
      name: 'protectedValue',
      visibility: 'protected' as const,
      color: 'modified',
    },
    { name: 'privateValue', visibility: 'private' as const, color: 'warning' },
    { name: 'getterValue', accessor: 'getter' as const, color: 'info' },
    { name: 'setterValue', accessor: 'setter' as const, color: 'info' },
    { name: 'cachedValue', cached: true, color: 'type' },
    { name: 'overrideValue', override: true, color: 'modified' },
  ] as const;
  const valueMark = ThemeIcons.Class.symbolMarksFor('unicode').value;

  for (const palette of [ThemePalettes.Class.DARK, ThemePalettes.Class.LIGHT]) {
    for (const semantic of semantics) {
      const outline = makeOutline();
      outline.rows.value = [
        {
          depth: 0,
          name: semantic.name,
          symbolClass: 'value',
          line: 0,
          column: 0,
          endLine: 0,
          visibility:
            'visibility' in semantic ? semantic.visibility : undefined,
          accessor: 'accessor' in semantic ? semantic.accessor : undefined,
          cached: 'cached' in semantic ? semantic.cached : undefined,
          override: 'override' in semantic ? semantic.override : undefined,
        },
      ];
      outline.status.value = 'ready';
      const rendered = StructurePaneRenderer.Class.render({
        outline,
        structureFocused: false,
        palette,
        symbolMarks: ThemeIcons.Class.symbolMarksFor('unicode'),
        structureMarks: ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode'),
        defaultDepth: 1,
        height: 2,
        innerWidth: 40,
        viewportWidth: 39,
      });
      expect(renderedText(rendered)).toContain(`${valueMark} ${semantic.name}`);
      expect(foregroundOfText(rendered, valueMark)).toEqual(
        fg(palette[semantic.color])(valueMark).fg,
      );
      outline.dispose();
    }
  }
});

test('structure row starts advance one cell at every nested level', () => {
  const outline = makeOutline();
  outline.rows.value = Array.from({ length: 4 }, (_unusedValue, depth) => ({
    depth,
    name: `level${depth}`,
    symbolClass: 'value' as const,
    line: depth,
    column: 0,
    endLine: depth,
  }));
  outline.status.value = 'ready';
  const rendered = StructurePaneRenderer.Class.render({
    outline,
    structureFocused: false,
    palette: ThemePalettes.Class.DARK,
    symbolMarks: ThemeIcons.Class.symbolMarksFor('unicode'),
    structureMarks: ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode'),
    defaultDepth: 4,
    height: 4,
    innerWidth: 30,
    viewportWidth: 29,
  });
  const rows = renderedText(rendered).split('\n').slice(1);
  const valueMark = ThemeIcons.Class.symbolMarksFor('unicode').value;

  expect(rows.map((row) => row.indexOf(valueMark))).toEqual([3, 4, 5, 6]);
  outline.dispose();
});
