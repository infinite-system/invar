import { expect, test } from 'bun:test';
import { ProviderRegistry } from '../plugins/ProviderRegistry';
import { DocumentLifecycle } from '../workspace/DocumentLifecycle';
import { TextDocument } from '../text/TextDocument';
import type { Workspace } from '../workspace/Workspace';
import { StructureWorkspace } from './StructureWorkspace';

function makeWorkspaceStub() {
  const placedCursors: Array<{ line: number; column: number }> = [];
  const document = new TextDocument.Class();
  document.loadFromText('function alpha() {}\n', '/tmp/momentum.ts');
  const workspace = {
    documentLifecycle: new DocumentLifecycle.Class(),
    providers: new ProviderRegistry.Class(),
    activeDocumentHandle: { document },
    editor: {
      placeCursor: (line: number, column: number) => {
        placedCursors.push({ line, column });
      },
      revealCursor: () => {},
    },
    revealSourceLocation: (line: number, column: number) => {
      placedCursors.push({ line, column });
    },
    focusEditor: () => {},
    recordCurrentViewState: () => {},
  } as unknown as Workspace.Model;
  return { workspace, placedCursors };
}

test('wheel impulses glide the outline through the shared Momentum seam', () => {
  const { workspace } = makeWorkspaceStub();
  const structureWorkspace = new StructureWorkspace.Class(
    workspace,
    () => true,
  );
  const outline = structureWorkspace.outline;
  outline.rows.value = Array.from({ length: 100 }, (_, index) => ({
    depth: 0,
    name: `symbol${index}`,
    symbolClass: 'callable' as const,
    line: index,
    column: 0,
    endLine: index,
  }));
  outline.viewportHeight.value = 10;

  structureWorkspace.impulseVerticalScroll(3);
  // The impulse queues into momentum; ticking converts it into row motion.
  let moving = true;
  for (let frame = 0; frame < 120 && moving; frame += 1) {
    moving = structureWorkspace.tickScroll(1 / 60);
  }
  expect(outline.scrollTop.value).toBeGreaterThan(0);

  // A halt freezes the glide where it is.
  structureWorkspace.impulseVerticalScroll(5);
  structureWorkspace.haltVerticalScroll();
  const haltedTop = outline.scrollTop.value;
  expect(structureWorkspace.tickScroll(1 / 60)).toBe(false);
  expect(outline.scrollTop.value).toBe(haltedTop);
  structureWorkspace.disposed();
});

test('activation halts the glide and jumps, and disposal releases the outline', () => {
  const { workspace, placedCursors } = makeWorkspaceStub();
  const structureWorkspace = new StructureWorkspace.Class(
    workspace,
    () => true,
  );
  const outline = structureWorkspace.outline;
  outline.rows.value = [
    {
      depth: 0,
      name: 'alpha',
      symbolClass: 'callable',
      line: 0,
      column: 9,
      endLine: 0,
    },
  ];
  structureWorkspace.impulseVerticalScroll(4);
  expect(structureWorkspace.activateSelected()).toBe(true);
  expect(placedCursors).toEqual([{ line: 0, column: 9 }]);
  expect(structureWorkspace.tickScroll(1 / 60)).toBe(false);
  structureWorkspace.disposed();
});
