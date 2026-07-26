import { expect, test } from 'bun:test';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import { ThemeIcons } from '../theme/ThemeIcons';
import { CompletionItemKinds } from './CompletionItemKinds';

const glyphLevels = ['nerd', 'unicode', 'ascii'] as const;
const everyCompletionItemKind = Array.from(
  { length: 25 },
  (_unusedValue, index) => index + 1,
);

test('every completion kind in the protocol classifies and resolves to a mark', () => {
  for (const completionItemKind of everyCompletionItemKind) {
    const symbolClass =
      CompletionItemKinds.Class.symbolClassFor(completionItemKind);
    for (const glyphLevel of glyphLevels) {
      const mark = ThemeIcons.Class.symbolMarkFor(glyphLevel, symbolClass);
      expect(mark.length).toBeGreaterThan(0);
      expect(EditorCoordinates.Class.lineWidth(mark)).toBe(1);
    }
  }
});

test('a missing kind and a kind from a newer protocol both classify', () => {
  expect(CompletionItemKinds.Class.symbolClassFor(null)).toBe('unclassified');
  expect(CompletionItemKinds.Class.symbolClassFor(99)).toBe('unclassified');
  expect(CompletionItemKinds.Class.symbolClassFor(0)).toBe('unclassified');
});

// The families are the feature. A member access returns methods AND properties, and the whole point
// of the mark is that those two do not look alike while the three callable kinds do.
test('kinds group into families: callables share a mark, a value does not', () => {
  const methodKind = 2;
  const functionKind = 3;
  const constructorKind = 4;
  const propertyKind = 10;
  const classKind = 7;
  const moduleKind = 9;
  const keywordKind = 14;
  const symbolClassFor = (completionItemKind: number): string =>
    CompletionItemKinds.Class.symbolClassFor(completionItemKind);

  expect(symbolClassFor(methodKind)).toBe(symbolClassFor(functionKind));
  expect(symbolClassFor(methodKind)).toBe(symbolClassFor(constructorKind));
  expect(
    new Set([
      symbolClassFor(methodKind),
      symbolClassFor(propertyKind),
      symbolClassFor(classKind),
      symbolClassFor(moduleKind),
      symbolClassFor(keywordKind),
    ]).size,
  ).toBe(5);
});

// The reduction, stated as a claim that can fail: a File or Folder completion is marked by the SAME
// authority that marks the tree row it would open. The tree's mark is fetched through the tree's own
// entry point (`iconFor`), so if a second resolver ever appears these two stop agreeing.
test('a path completion carries the mark the file tree paints for that path', () => {
  const fileKind = 17;
  const folderKind = 19;

  for (const glyphLevel of glyphLevels) {
    expect(
      ThemeIcons.Class.symbolMarkFor(
        glyphLevel,
        CompletionItemKinds.Class.symbolClassFor(fileKind),
      ),
    ).toBe(ThemeIcons.Class.iconFor(glyphLevel, 'notes.unknown', false));
    expect(
      ThemeIcons.Class.symbolMarkFor(
        glyphLevel,
        CompletionItemKinds.Class.symbolClassFor(folderKind),
      ),
    ).toBe(ThemeIcons.Class.iconFor(glyphLevel, 'source', true, false));
  }
});
