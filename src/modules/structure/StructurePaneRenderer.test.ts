import { expect, test } from 'bun:test';
import { DocumentLifecycle } from '../workspace/DocumentLifecycle';
import type { Workspace } from '../workspace/Workspace';
import { StructureOutline } from './StructureOutline';
import { StructurePaneRenderer } from './StructurePaneRenderer';
import { ThemeIcons } from '../theme/ThemeIcons';
import { ThemePalettes } from '../theme/ThemePalettes';

function makeOutline(): StructureOutline.Model {
  const workspace = {
    documentLifecycle: new DocumentLifecycle.Class(),
    activeDocumentHandle: null,
  } as unknown as Workspace.Model;
  return new StructureOutline.Class(workspace, () => true);
}

function renderedText(styled: { chunks: unknown }): string {
  return (styled.chunks as { text: string }[])
    .map((chunk) => chunk.text)
    .join('');
}

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
      height: 10,
      innerWidth: 30,
      viewportWidth: 28,
    }),
  );
  expect(rendered).toContain('No structure available.');
  expect(rendered).toContain('Ctrl+Shift+X');
  outline.dispose();
});
