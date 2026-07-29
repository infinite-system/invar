import { expect, test } from 'bun:test';
import { EditorColumnDefault } from './EditorColumnDefault';
import type {
  EditorColumnDefaultContext,
  EditorColumnDefaultProvider,
} from './EditorColumnDefault';
import type { PaneContent } from './PaneContent.interface';

function stubContext(): EditorColumnDefaultContext {
  return {
    hostCapability: () => null,
  } as unknown as EditorColumnDefaultContext;
}

function stubContent(identifier: string, disposals: string[]): PaneContent {
  return {
    id: identifier,
    kind: 'source-text',
    title: identifier,
    capability: () => null,
    render: () => '' as never,
    handleKey: () => false,
    onResize: () => {},
    onFocus: () => {},
    onBlur: () => {},
    dispose: () => disposals.push(identifier),
  } as unknown as PaneContent;
}

function stubProvider(
  identifier: string,
  built: string[],
  disposals: string[],
): EditorColumnDefaultProvider {
  return {
    identifier,
    create: () => {
      built.push(identifier);
      return stubContent(identifier, disposals);
    },
  };
}

// invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
test('the column stays empty until a provider registers and the view attaches', () => {
  const built: string[] = [];
  const disposals: string[] = [];
  const column = new EditorColumnDefault.Class();

  // No provider and no host: an honest empty column, not a throw and not a placeholder.
  expect(column.content).toBeNull();
  expect(column.providerIdentifier).toBeNull();

  column.register(stubProvider('editor', built, disposals));
  // Registered, but the view has not attached the slot yet — plugins activate before it exists.
  expect(column.providerIdentifier).toBe('editor');
  expect(column.content).toBeNull();
  expect(built).toEqual([]);

  column.attachHost(stubContext());
  expect(column.content?.id).toBe('editor');
  // Built ONCE and cached: a per-frame read must not rebuild the content it reads.
  void column.content;
  void column.content;
  expect(built).toEqual(['editor']);
});

// invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
test('one default occupies the column and a second registration is refused by name', () => {
  const built: string[] = [];
  const disposals: string[] = [];
  const column = new EditorColumnDefault.Class();
  column.register(stubProvider('editor', built, disposals));

  expect(() =>
    column.register(stubProvider('other-editor', built, disposals)),
  ).toThrow(
    /already has the default content provider "editor".*"other-editor"/,
  );
  expect(column.providerIdentifier).toBe('editor');
});

// invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
test('withdrawal releases nothing on its own, so a forgotten release is visible', () => {
  const built: string[] = [];
  const disposals: string[] = [];
  const column = new EditorColumnDefault.Class();
  const port = column.register(stubProvider('editor', built, disposals));
  column.attachHost(stubContext());
  void column.content;

  // The contribution withdraws WITHOUT releasing: the content is still mounted and still painting.
  port.dispose();
  expect(disposals).toEqual([]);
  expect(column.content?.id).toBe('editor');
  expect(column.providerIdentifier).toBeNull();

  // The release is the contribution's own duty, and it disposes what the content built.
  port.releaseContent();
  expect(disposals).toEqual(['editor']);
  expect(column.content).toBeNull();
});

// invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
test('a released column rebuilds its content when the provider is still registered', () => {
  const built: string[] = [];
  const disposals: string[] = [];
  const column = new EditorColumnDefault.Class();
  const port = column.register(stubProvider('editor', built, disposals));
  column.attachHost(stubContext());
  void column.content;

  port.releaseContent();
  expect(disposals).toEqual(['editor']);
  expect(column.content?.id).toBe('editor');
  expect(built).toEqual(['editor', 'editor']);
});

// invariant: The editor column's default occupant is a contribution (src/modules/ui/ui.invariants.md)
test('a content that paints no renderables of its own publishes no native surface', () => {
  const built: string[] = [];
  const disposals: string[] = [];
  const column = new EditorColumnDefault.Class();
  column.register(stubProvider('editor', built, disposals));
  column.attachHost(stubContext());

  // The stub projects cells through `render`, so the host reads no surface region or caret from it.
  expect(column.nativeSurface).toBeNull();
  expect(column.content?.id).toBe('editor');
});
