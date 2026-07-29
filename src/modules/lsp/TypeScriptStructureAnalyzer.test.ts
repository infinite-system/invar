import { afterEach, expect, test } from 'bun:test';
import { Files } from '../system/Files';
import { TextDocument } from '../text/TextDocument';
import type {
  StructureOutlineResult,
  StructureSymbol,
} from '../structure/StructureSource.interface';
import { TypeScriptStructureAnalyzer } from './TypeScriptStructureAnalyzer';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    Files.Class.removeDirectory(path);
  }
});

function documentFor(path: string, text: string): TextDocument.Instance {
  const document = new TextDocument.Class();
  document.loadFromText(text, path);
  return document;
}

function symbolAt(
  lines: readonly string[],
  line: number,
  name: string,
  children: readonly StructureSymbol[] = [],
): StructureSymbol {
  const column = lines[line]?.indexOf(name) ?? -1;
  if (column < 0) throw new Error(`Fixture line ${line + 1} lacks ${name}`);
  return {
    name,
    symbolClass: children.length > 0 ? 'type' : 'value',
    line,
    column,
    endLine: line,
    children: [...children],
  };
}

function resultWith(
  symbols: readonly StructureSymbol[],
): StructureOutlineResult {
  return { symbols: [...symbols], truncated: false };
}

test('every TypeScript-served extension removes import declarations at the analyzer boundary', async () => {
  const text =
    "import { dependency } from './dependency';\nconst answer = 42;\n";
  const lines = text.split('\n');
  const sourceResult = resultWith([
    symbolAt(lines, 0, 'dependency'),
    symbolAt(lines, 1, 'answer'),
  ]);

  for (const extension of [
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
  ]) {
    const refined = await TypeScriptStructureAnalyzer.Class.refine(
      documentFor(`/tmp/structure-refinement${extension}`, text),
      sourceResult,
    );
    expect(
      refined.symbols.map((symbol) => symbol.name),
      extension,
    ).toEqual(['answer']);
  }
});

test('source syntax supplies visibility cache accessor override metadata and removes heritage rows', async () => {
  const text = [
    'class Parent {',
    '  inheritedMember() {}',
    '}',
    'class Child extends Parent {',
    '  public visibleMember() {}',
    '  protected protectedMember() {}',
    '  private hiddenMember() {}',
    '  #secretMember = 1;',
    '  get $cachedValue() { return 1; }',
    '  set writableValue(value: number) {}',
    '  inheritedMember() {}',
    '}',
    '',
  ].join('\n');
  const lines = text.split('\n');
  const parent = symbolAt(lines, 0, 'Parent', [
    symbolAt(lines, 1, 'inheritedMember'),
  ]);
  const child = symbolAt(lines, 3, 'Child', [
    symbolAt(lines, 3, 'Parent'),
    symbolAt(lines, 4, 'visibleMember'),
    symbolAt(lines, 5, 'protectedMember'),
    symbolAt(lines, 6, 'hiddenMember'),
    symbolAt(lines, 7, '#secretMember'),
    symbolAt(lines, 8, '$cachedValue'),
    symbolAt(lines, 9, 'writableValue'),
    symbolAt(lines, 10, 'inheritedMember'),
  ]);

  const refined = await TypeScriptStructureAnalyzer.Class.refine(
    documentFor('/tmp/structure-semantics.ts', text),
    resultWith([parent, child]),
  );
  const members = new Map(
    refined.symbols[1]?.children.map((symbol) => [symbol.name, symbol]),
  );

  expect(members.has('Parent')).toBe(false);
  expect(members.get('visibleMember')).toMatchObject({
    visibility: 'public',
    cached: false,
    override: false,
    accessor: null,
  });
  expect(members.get('protectedMember')?.visibility).toBe('protected');
  expect(members.get('hiddenMember')?.visibility).toBe('private');
  expect(members.get('#secretMember')?.visibility).toBe('private');
  expect(members.get('$cachedValue')).toMatchObject({
    visibility: 'public',
    cached: true,
    accessor: 'getter',
  });
  expect(members.get('writableValue')?.accessor).toBe('setter');
  expect(members.get('inheritedMember')?.override).toBe(true);
});

test('an ivue namespace parent in another file contributes inherited member names', async () => {
  const directory = Files.Class.createTemporaryDirectory(
    'invar-structure-inheritance-',
  );
  temporaryDirectories.push(directory);
  const parentPath = `${directory}/Parent.ts`;
  const childPath = `${directory}/Child.ts`;
  Files.Class.write(
    parentPath,
    [
      'export class $Parent {',
      '  inheritedAcrossFile() {}',
      '}',
      'export namespace Parent {',
      '  export const $Class = $Parent;',
      '}',
      '',
    ].join('\n'),
  );
  const childText = [
    "import { Parent } from './Parent';",
    'class Child extends Parent.$Class {',
    '  inheritedAcrossFile() {}',
    '}',
    '',
  ].join('\n');
  const lines = childText.split('\n');
  const child = symbolAt(lines, 1, 'Child', [
    symbolAt(lines, 2, 'inheritedAcrossFile'),
  ]);

  const refined = await TypeScriptStructureAnalyzer.Class.refine(
    documentFor(childPath, childText),
    resultWith([child]),
  );

  expect(refined.symbols[0]?.children[0]?.override).toBe(true);
});
