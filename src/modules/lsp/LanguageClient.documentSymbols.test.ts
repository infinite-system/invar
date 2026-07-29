import { test, expect } from 'bun:test';
import { LanguageClient } from './LanguageClient';
import { TextDocument } from '../text/TextDocument';
import { FakeLspProcess, FakeProvider } from './lsp.fakes.test';

const ROOT = '/tmp/fake-lsp-root';

function makeClient(
  fake: FakeLspProcess,
  maxDocumentSymbolsPerDocument?: number,
): LanguageClient.Instance {
  return new LanguageClient.Class({
    rootPath: ROOT,
    providers: [new FakeProvider()],
    processFactory: () => fake,
    maxDocumentSymbolsPerDocument,
  });
}

function makeDocument(
  path: string,
  text = 'class Widget {\n  render() {}\n}\n',
): TextDocument.Instance {
  const document = new TextDocument.Class();
  document.loadFromText(text, path);
  return document;
}

function range(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
) {
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  };
}

test('hierarchical DocumentSymbol results map to nested structure symbols', async () => {
  const fake = new FakeLspProcess(5301);
  fake.onInitialize = () => ({
    capabilities: { documentSymbolProvider: true },
  });
  fake.responders.set('textDocument/documentSymbol', () => [
    {
      name: 'Widget',
      kind: 5, // Class
      range: range(0, 0, 2, 1),
      selectionRange: range(0, 6, 0, 12),
      children: [
        {
          name: 'render',
          kind: 6, // Method
          range: range(1, 2, 1, 13),
          selectionRange: range(1, 2, 1, 8),
        },
      ],
    },
  ]);
  const client = makeClient(fake);
  try {
    const result = await client.documentSymbols(
      makeDocument(`${ROOT}/widget.ts`),
    );
    expect(result).toEqual({
      truncated: false,
      symbols: [
        {
          name: 'Widget',
          symbolClass: 'type',
          line: 0,
          column: 6,
          endLine: 2,
          children: [
            {
              name: 'render',
              symbolClass: 'callable',
              line: 1,
              column: 2,
              endLine: 1,
              children: [],
            },
          ],
        },
      ],
    });
  } finally {
    await client.dispose();
  }
});

test('flat SymbolInformation results map with location.range serving both ranges', async () => {
  const fake = new FakeLspProcess(5302);
  fake.onInitialize = () => ({
    capabilities: { documentSymbolProvider: true },
  });
  fake.responders.set('textDocument/documentSymbol', () => [
    {
      name: 'greet',
      kind: 12, // Function
      location: { uri: `file://${ROOT}/flat.ts`, range: range(0, 0, 2, 1) },
    },
  ]);
  const client = makeClient(fake);
  try {
    const result = await client.documentSymbols(
      makeDocument(`${ROOT}/flat.ts`),
    );
    expect(result?.symbols).toEqual([
      {
        name: 'greet',
        symbolClass: 'callable',
        line: 0,
        column: 0,
        endLine: 2,
        children: [],
      },
    ]);
  } finally {
    await client.dispose();
  }
});

test('a server that never advertised documentSymbolProvider is never asked', async () => {
  const fake = new FakeLspProcess(5303);
  fake.onInitialize = () => ({ capabilities: {} });
  fake.responders.set('textDocument/documentSymbol', () => [
    { name: 'ghost', kind: 12, location: { range: range(0, 0, 0, 1) } },
  ]);
  const client = makeClient(fake);
  try {
    const result = await client.documentSymbols(
      makeDocument(`${ROOT}/no-support.ts`),
    );
    expect(result).toBeNull();
    const methods = fake.received.map((message) =>
      'method' in message ? message.method : null,
    );
    expect(methods).not.toContain('textDocument/documentSymbol');
  } finally {
    await client.dispose();
  }
});

test('the symbol cap keeps a bounded count and STATES the truncation', async () => {
  const fake = new FakeLspProcess(5304);
  fake.onInitialize = () => ({
    capabilities: { documentSymbolProvider: true },
  });
  fake.responders.set('textDocument/documentSymbol', () => [
    {
      name: 'outer',
      kind: 5,
      range: range(0, 0, 9, 1),
      selectionRange: range(0, 0, 0, 5),
      children: [
        {
          name: 'nestedOne',
          kind: 6,
          range: range(1, 0, 1, 9),
          selectionRange: range(1, 0, 1, 9),
        },
        {
          name: 'nestedTwo',
          kind: 6,
          range: range(2, 0, 2, 9),
          selectionRange: range(2, 0, 2, 9),
        },
      ],
    },
    {
      name: 'dropped',
      kind: 12,
      range: range(5, 0, 5, 7),
      selectionRange: range(5, 0, 5, 7),
    },
  ]);
  // Cap of 3 counts NESTED nodes too: outer + two children exhaust it.
  const client = makeClient(fake, 3);
  try {
    const result = await client.documentSymbols(
      makeDocument(`${ROOT}/capped.ts`),
    );
    expect(result?.truncated).toBe(true);
    expect(result?.symbols.map((symbol) => symbol.name)).toEqual(['outer']);
    expect(result?.symbols[0]?.children.map((symbol) => symbol.name)).toEqual([
      'nestedOne',
      'nestedTwo',
    ]);
  } finally {
    await client.dispose();
  }
});

test('symbol columns cross the UTF-16 boundary back to grapheme columns', async () => {
  const fake = new FakeLspProcess(5305);
  fake.onInitialize = () => ({
    capabilities: { documentSymbolProvider: true },
  });
  // '👨‍👩‍👧' is one grapheme but 8 UTF-16 units; the const name starts after "const 👨‍👩‍👧" + space.
  const text = 'const 👨‍👩‍👧 = 1; const after = 2;\n';
  const utf16NameStart = 'const 👨‍👩‍👧 = 1; const '.length;
  fake.responders.set('textDocument/documentSymbol', () => [
    {
      name: 'after',
      kind: 13,
      range: range(0, utf16NameStart, 0, utf16NameStart + 5),
      selectionRange: range(0, utf16NameStart, 0, utf16NameStart + 5),
    },
  ]);
  const client = makeClient(fake);
  try {
    const result = await client.documentSymbols(
      makeDocument(`${ROOT}/emoji.ts`, text),
    );
    // Grapheme column: 'const ' (6) + emoji (1) + ' = 1; const ' (12) = 19.
    expect(result?.symbols[0]?.line).toBe(0);
    expect(result?.symbols[0]?.column).toBe(19);
  } finally {
    await client.dispose();
  }
});

test('a result for text the document has moved past is discarded', async () => {
  const fake = new FakeLspProcess(5306);
  fake.onInitialize = () => ({
    capabilities: { documentSymbolProvider: true },
  });
  const document = makeDocument(`${ROOT}/stale.ts`);
  fake.responders.set('textDocument/documentSymbol', () => {
    // The edit lands while the request is in flight.
    document.insertInline(0, 0, 'x');
    return [
      {
        name: 'Widget',
        kind: 5,
        range: range(0, 0, 2, 1),
        selectionRange: range(0, 6, 0, 12),
      },
    ];
  });
  const client = makeClient(fake);
  try {
    expect(await client.documentSymbols(document)).toBeNull();
  } finally {
    await client.dispose();
  }
});
