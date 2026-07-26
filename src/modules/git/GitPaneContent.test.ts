import { afterEach, expect, test } from 'bun:test';
import { createTestRenderer, type TestRenderer } from '@opentui/core/testing';
import { GitPaneContent } from './GitPaneContent';

let renderer: TestRenderer | null = null;

afterEach(() => {
  renderer?.destroy();
  renderer = null;
});

// Assert the class seam, never `Class.prototype.<member>`: ivue rewrites prototype methods into
// accessors that cache `method.bind(f(this))` and stamp the raw marker on whatever `this` was, so
// reading a member off the prototype makes every LATER instance resolve its methods bound to the
// prototype instead of itself. The pointer-routing test below constructs a real instance.
test('source control pane implements the shared pane surface', () => {
  expect(GitPaneContent.Class).toBeDefined();
});

test('horizontal wheel routes to the pane row under the pointer', async () => {
  const routedDeltas = { changes: [] as number[], log: [] as number[] };
  const workspace = {
    splitRatio: 0.5,
    setSplit: () => {},
    persistSplit: () => {},
    impulseChangesHorizontal: (columnDelta: number) =>
      routedDeltas.changes.push(columnDelta),
    impulseLogHorizontal: (columnDelta: number) =>
      routedDeltas.log.push(columnDelta),
  };
  // The pane builds its split divider in the constructor, so it needs a real render context.
  const setup = await createTestRenderer({ width: 80, height: 24 });
  renderer = setup.renderer;
  const pane = new GitPaneContent.$Class(
    { renderer } as never,
    () => workspace as never,
  );
  (
    pane as unknown as {
      geometry: { dividerRow: number };
    }
  ).geometry = { dividerRow: 10 };
  const modifiers = { alt: true, shift: false, ctrl: false };

  pane.onHorizontalWheel(3, { column: 4, row: 5, modifiers });
  pane.onHorizontalWheel(-2, { column: 4, row: 15, modifiers });

  expect(routedDeltas).toEqual({ changes: [3], log: [-2] });
});
