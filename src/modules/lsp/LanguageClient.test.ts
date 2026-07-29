import { test, expect } from 'bun:test';
import { LanguageClient } from './LanguageClient';
import { TextDocument } from '../text/TextDocument';
import { StatusChannel } from '../system/StatusChannel';
import { FakeLspProcess, FakeProvider, flush } from './lsp.fakes.test';

const ROOT = '/tmp/fake-lsp-root';

function makeClient(fake: FakeLspProcess): LanguageClient.Instance {
  return new LanguageClient.Class({
    rootPath: ROOT,
    providers: [new FakeProvider()],
    processFactory: () => fake,
  });
}

function makeDocument(
  path: string,
  text = 'const x = 1\n',
): TextDocument.Instance {
  const document = new TextDocument.Class();
  document.loadFromText(text, path);
  return document;
}

test('the server is not started until a supported document or semantic feature is requested', async () => {
  const fake = new FakeLspProcess(5001);
  const client = makeClient(fake);
  try {
    // Just constructing the client starts nothing.
    expect(fake.startCalled).toBe(false);
    expect(client.status.value).toBe('idle');

    // Opening an UNSUPPORTED file must not start a server either.
    client.openDocument(makeDocument(`${ROOT}/readme.txt`));
    await flush();
    expect(fake.startCalled).toBe(false);
    expect(client.status.value).toBe('idle');
  } finally {
    await client.dispose();
  }
});

test('opening a supported document lazily starts the server and reaches ready', async () => {
  const fake = new FakeLspProcess(5002);
  const client = makeClient(fake);
  try {
    client.openDocument(makeDocument(`${ROOT}/a.ts`));
    const ready = await client.whenStarted();

    expect(ready).toBe(true);
    expect(fake.startCalled).toBe(true);
    expect(client.status.value).toBe('ready');
    // The server received the initialize handshake and the didOpen sync.
    const methods = fake.received.map((message) =>
      'method' in message ? message.method : null,
    );
    expect(methods).toContain('initialize');
    expect(methods).toContain('initialized');
    expect(methods).toContain('textDocument/didOpen');
    // The live subprocess pid is published on the status channel.
    expect(StatusChannel.Class.snapshot.subprocessPids).toContain(5002);
  } finally {
    await client.dispose();
  }
});

test('a semantic command with no prior openDocument still starts the server lazily', async () => {
  const fake = new FakeLspProcess(5003);
  fake.responders.set('textDocument/hover', () => ({ contents: 'ok' }));
  const client = makeClient(fake);
  try {
    expect(fake.startCalled).toBe(false);
    const document = makeDocument(`${ROOT}/b.ts`);
    const hover = await client.hover(document, { line: 0, column: 0 });
    expect(fake.startCalled).toBe(true);
    expect(hover?.contents).toBe('ok');
  } finally {
    await client.dispose();
  }
});

test('completion maps the wire response and server trigger characters to the provider contract', async () => {
  const fake = new FakeLspProcess(5005);
  fake.onInitialize = () => ({
    capabilities: {
      completionProvider: { triggerCharacters: ['.', ':'] },
    },
  });
  fake.responders.set('textDocument/completion', () => ({
    isIncomplete: true,
    items: [
      {
        label: 'property',
        kind: 10,
        insertText: 'property',
        sortText: '01',
        filterText: 'property',
        textEdit: {
          range: {
            start: { line: 0, character: 5 },
            end: { line: 0, character: 6 },
          },
          newText: 'property',
        },
      },
    ],
  }));
  const client = makeClient(fake);
  try {
    const document = makeDocument(`${ROOT}/completion.ts`, 'this.p\n');
    const result = await client.completion(
      document,
      { line: 0, column: 6 },
      { triggerKind: 'triggerCharacter', triggerCharacter: '.' },
    );

    expect(client.completionTriggerCharacters).toEqual(['.', ':']);
    expect(result).toEqual({
      isIncomplete: true,
      items: [
        {
          label: 'property',
          symbolClass: 'value',
          insertText: 'property',
          sortText: '01',
          filterText: 'property',
          textEdit: {
            range: {
              start: { line: 0, column: 5 },
              end: { line: 0, column: 6 },
            },
            newText: 'property',
          },
        },
      ],
    });
    const request = fake.received.find(
      (message) =>
        'method' in message && message.method === 'textDocument/completion',
    ) as { params?: unknown } | undefined;
    expect(request?.params).toMatchObject({
      position: { line: 0, character: 6 },
      context: { triggerKind: 2, triggerCharacter: '.' },
    });
  } finally {
    await client.dispose();
  }
});

test('dispose kills the subprocess, stops the transport, and drops the published pid', async () => {
  const fake = new FakeLspProcess(5004);
  const client = makeClient(fake);
  client.openDocument(makeDocument(`${ROOT}/c.ts`));
  await client.whenStarted();
  expect(fake.running).toBe(true);
  expect(StatusChannel.Class.snapshot.subprocessPids).toContain(5004);

  await client.dispose();

  expect(fake.killed).toBe(true);
  expect(fake.running).toBe(false);
  expect(client.status.value).toBe('disposed');
  const exitCode = await fake.exited; // no orphan — the child has exited
  expect(exitCode).toBe(0);
  expect(StatusChannel.Class.snapshot.subprocessPids).not.toContain(5004);
});

test('a missing server executable degrades to unavailable without throwing', async () => {
  // A provider that resolves nothing models a machine with no language server installed.
  const client = new LanguageClient.Class({
    rootPath: ROOT,
    providers: [
      {
        id: 'none',
        capabilities: {
          diagnostics: true,
          definition: true,
          hover: true,
          references: true,
          completion: true,
          documentSymbols: true,
        },
        supportsPath: (path: string) => path.endsWith('.ts'),
        resolve: async () => null,
      },
    ],
  });
  try {
    client.openDocument(makeDocument(`${ROOT}/d.ts`));
    const ready = await client.whenStarted();
    expect(ready).toBe(false);
    expect(client.status.value).toBe('unavailable');
    // Semantic requests just return empty — they never throw into the editor.
    expect(
      await client.hover(makeDocument(`${ROOT}/d.ts`), { line: 0, column: 0 }),
    ).toBeNull();
  } finally {
    await client.dispose();
  }
});

test('a document over the size budget answers no requests and never starts the server', async () => {
  const fake = new FakeLspProcess(5099);
  // Register real answers for every request. WITHOUT these the expectations below would pass
  // vacuously — null because nothing responds, not because the guard declined — and the test
  // could never fail in the direction it exists to check.
  fake.responders.set('textDocument/hover', () => ({ contents: 'ok' }));
  fake.responders.set('textDocument/definition', () => ({
    uri: `file://${ROOT}/huge.ts`,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  }));
  fake.responders.set('textDocument/references', () => [
    {
      uri: `file://${ROOT}/huge.ts`,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ]);
  fake.responders.set('textDocument/completion', () => ({
    isIncomplete: false,
    items: [{ label: 'filler' }],
  }));
  const client = new LanguageClient.Class({
    rootPath: ROOT,
    providers: [new FakeProvider()],
    processFactory: () => fake,
    // A one-kilobyte budget, so the document below is comfortably over it.
    fileSizeLimitKb: () => 1,
  });
  try {
    const overBudget = makeDocument(
      `${ROOT}/huge.ts`,
      'const filler = 1\n'.repeat(200),
    );

    // Every request path must decline. `hover` is the one a user reaches first.
    expect(await client.hover(overBudget, { line: 0, column: 0 })).toBeNull();
    expect(
      await client.definition(overBudget, { line: 0, column: 0 }),
    ).toBeNull();
    expect(await client.references(overBudget, { line: 0, column: 0 })).toEqual(
      [],
    );
    expect(
      await client.completion(
        overBudget,
        { line: 0, column: 0 },
        {
          triggerKind: 'invoked',
        },
      ),
    ).toEqual({ items: [], isIncomplete: false });

    // THE load-bearing assertion. A guard placed after `ensureStarted` would let every
    // expectation above pass while a subprocess had already been spawned and handed the
    // workspace root — which is how language features stayed alive on a suppressed file.
    await flush();
    expect(fake.startCalled).toBe(false);
    expect(client.isSizeSuppressed(overBudget)).toBe(true);
    expect(client.sizeSuppressionNotice(overBudget)).toContain(
      'language features off',
    );
  } finally {
    await client.dispose();
  }
});

test('a document UNDER the same budget still starts the server and answers hover', async () => {
  const fake = new FakeLspProcess(5100);
  fake.responders.set('textDocument/hover', () => ({ contents: 'ok' }));
  const client = new LanguageClient.Class({
    rootPath: ROOT,
    providers: [new FakeProvider()],
    processFactory: () => fake,
    fileSizeLimitKb: () => 1,
  });
  try {
    // The other half of the control: a guard that silences everything is not a fix.
    const underBudget = makeDocument(`${ROOT}/small.ts`, 'const x = 1\n');
    const hover = await client.hover(underBudget, { line: 0, column: 0 });

    expect(hover?.contents).toBe('ok');
    expect(fake.startCalled).toBe(true);
    expect(client.isSizeSuppressed(underBudget)).toBe(false);
    expect(client.sizeSuppressionNotice(underBudget)).toBeNull();
  } finally {
    await client.dispose();
  }
});
