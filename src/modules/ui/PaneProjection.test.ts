// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
import { expect, test } from 'bun:test';
import { StyledText, fg } from '@opentui/core';
import { PaneProjection } from './PaneProjection';
import type {
  PaneContent,
  PaneNativeSurfacePort,
  PaneRenderContext,
} from './PaneContent.interface';

const region = {
  width: 40,
  height: 10,
  palette: {} as PaneRenderContext['palette'],
  glyphLevel: 'nerd',
  colorDepth: 'truecolor',
  focused: true,
} as PaneRenderContext;

function cells(text: string): StyledText {
  return new StyledText([fg('#ffffff')(text)]);
}

/** A content of the ordinary kind: it returns cells and the host paints them. */
function createCellsContent(): PaneContent & { renderCount: number } {
  return {
    id: 'cells',
    title: 'Cells',
    renderCount: 0,
    renderRevision: { value: 0 } as PaneContent['renderRevision'],
    render(context: PaneRenderContext) {
      this.renderCount += 1;
      return cells(`w${context.width}`);
    },
    handleKey: () => false,
    onResize: () => {},
    onFocus: () => {},
    onBlur: () => {},
    dispose: () => {},
  };
}

/** A content that owns its renderables: it paints itself and the host assigns nothing. */
function createNativeContent(): PaneContent & { paintCount: number } {
  const port: PaneNativeSurfacePort = {
    paint: () => {
      content.paintCount += 1;
    },
    caretAnchor: () => ({ column: 3, row: 4 }),
    surfaceRegion: () => ({ column: 1, row: 2, columns: 30, rows: 8 }),
  };
  const content: PaneContent & { paintCount: number } = {
    id: 'native',
    title: 'Native',
    paintCount: 0,
    renderRevision: { value: 0 } as PaneContent['renderRevision'],
    capability<Port>(identifier: string): Port | null {
      return identifier === 'native-surface' ? (port as unknown as Port) : null;
    },
    handleKey: () => false,
    onResize: () => {},
    onFocus: () => {},
    onBlur: () => {},
    dispose: () => {},
  };
  return content;
}

test('a cells content is painted by the host from what render returned', () => {
  const content = createCellsContent();

  const painted = PaneProjection.Class.paint(content, region);

  expect(content.renderCount).toBe(1);
  expect(painted?.chunks[0]?.text).toBe('w40');
  expect(PaneProjection.Class.nativeSurface(content)).toBeNull();
});

test('a native content paints itself and hands the host no cells', () => {
  const content = createNativeContent();

  const painted = PaneProjection.Class.paint(content, region);

  expect(content.paintCount).toBe(1);
  // Null is the whole point: the host assigns nothing into a body it does not own.
  expect(painted).toBeNull();
});

test('the native capability, not the class, answers where the caret and the region are', () => {
  const surface = PaneProjection.Class.requireNativeSurface(
    createNativeContent(),
  );

  expect(surface.caretAnchor()).toEqual({ column: 3, row: 4 });
  expect(surface.surfaceRegion()).toEqual({
    column: 1,
    row: 2,
    columns: 30,
    rows: 8,
  });
});

test('a content that projects through NEITHER surface is named, not silently blank', () => {
  const content = createCellsContent() as PaneContent;
  delete (content as { render?: unknown }).render;

  expect(() => PaneProjection.Class.paint(content, region)).toThrow(
    /pane content "cells" projects through neither/,
  );
  expect(() => PaneProjection.Class.requireNativeSurface(content)).toThrow(
    /must publish the native-surface capability/,
  );
});

test('a cells content never reaches the native branch even with other capabilities', () => {
  const content: PaneContent = {
    ...createCellsContent(),
    capability: <Port>(identifier: string): Port | null =>
      identifier === 'text-selection' ? ({} as Port) : null,
  };

  expect(PaneProjection.Class.nativeSurface(content)).toBeNull();
  expect(PaneProjection.Class.paint(content, region)).not.toBeNull();
});
