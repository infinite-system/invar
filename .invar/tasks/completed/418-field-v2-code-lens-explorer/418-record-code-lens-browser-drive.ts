/**
 * Drive the Field v2 record explorer and code lenses through real Chromium.
 *
 * Run: start `bun tools/invariant-field-v2/server.ts --port=4418`, then run
 * `bun .invar/tasks/in-progress/418-field-v2-code-lens-explorer/418-record-code-lens-browser-drive.ts`.
 *
 * The final line reports the full-field record count, selected record field
 * count, rank rows, relationship groups, annotation focus line, both dead
 * citation outcomes, TypeScript and Vue token counts, and outside-root HTTP
 * status. Nonzero counts prove each rendered surface exists. Status 403
 * proves the endpoint refused the outside-root request.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

class DevToolsConnection {
  protected nextMessageIdentifier = 1;
  protected pendingMessages = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(reason: unknown): void;
    }
  >();

  protected constructor(protected webSocket: WebSocket) {
    webSocket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as DevToolsMessage;
      if (!message.id) return;
      const pendingMessage = this.pendingMessages.get(message.id);
      if (!pendingMessage) return;
      this.pendingMessages.delete(message.id);
      if (message.error) {
        pendingMessage.reject(new Error(message.error.message));
      } else {
        pendingMessage.resolve(message.result);
      }
    });
  }

  static async connect(webSocketUrl: string): Promise<DevToolsConnection> {
    const webSocket = new WebSocket(webSocketUrl);
    await new Promise<void>((resolveConnection, rejectConnection) => {
      webSocket.addEventListener('open', () => resolveConnection(), {
        once: true,
      });
      webSocket.addEventListener(
        'error',
        () => rejectConnection(new Error('Chromium rejected the CDP socket.')),
        { once: true },
      );
    });
    return new DevToolsConnection(webSocket);
  }

  async send(
    method: string,
    parameters: Record<string, unknown> = {},
  ): Promise<unknown> {
    const messageIdentifier = this.nextMessageIdentifier++;
    const response = new Promise<unknown>((resolveResponse, rejectResponse) => {
      this.pendingMessages.set(messageIdentifier, {
        resolve: resolveResponse,
        reject: rejectResponse,
      });
    });
    this.webSocket.send(
      JSON.stringify({
        id: messageIdentifier,
        method,
        params: parameters,
      }),
    );
    return response;
  }

  close() {
    this.webSocket.close();
  }
}

async function chromiumDebuggerUrl(
  chromiumProcess: ReturnType<typeof Bun.spawn>,
): Promise<string> {
  const standardErrorReader = chromiumProcess.stderr.getReader();
  let standardError = '';
  while (true) {
    const nextChunk = await standardErrorReader.read();
    if (nextChunk.done) {
      throw new Error(
        `Chromium stopped before publishing DevTools.\n${standardError}`,
      );
    }
    standardError += new TextDecoder().decode(nextChunk.value);
    const debuggerMatch = /DevTools listening on (ws:\/\/[^\s]+)/.exec(
      standardError,
    );
    if (debuggerMatch) return debuggerMatch[1]!;
  }
}

async function pageDebuggerUrl(browserDebuggerUrl: string): Promise<string> {
  const debuggerAddress = new URL(browserDebuggerUrl);
  const targets = (await fetch(`http://${debuggerAddress.host}/json/list`).then(
    (response) => response.json(),
  )) as DevToolsTarget[];
  const pageTarget = targets.find((target) => target.type === 'page');
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error('Chromium did not publish a page target.');
  }
  return pageTarget.webSocketDebuggerUrl;
}

async function evaluate(
  connection: DevToolsConnection,
  expression: string,
): Promise<unknown> {
  const response = (await connection.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })) as RuntimeEvaluationResponse;
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text,
    );
  }
  return response.result.value;
}

async function waitForDocumentContext(
  connection: DevToolsConnection,
): Promise<void> {
  for (let observationCount = 0; observationCount < 500; observationCount++) {
    try {
      if (await evaluate(connection, 'document.readyState === "complete"')) {
        return;
      }
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes('Execution context was destroyed')
      ) {
        throw error;
      }
    }
    await Bun.sleep(10);
  }
  throw new Error('Chromium did not publish a complete document context.');
}

const pageUrl = process.argv[2] ?? 'http://localhost:4418/';
const chromiumExecutable = Bun.which('chromium');
if (!chromiumExecutable) {
  throw new Error('Chromium is not installed.');
}
const chromiumProfileDirectory = mkdtempSync(
  join(tmpdir(), 'invariant-field-418-browser-drive-'),
);
const chromiumProcess = Bun.spawn({
  cmd: [
    chromiumExecutable,
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=0',
    `--user-data-dir=${chromiumProfileDirectory}`,
    'about:blank',
  ],
  stdout: 'ignore',
  stderr: 'pipe',
});

let connection: DevToolsConnection | null = null;
try {
  connection = await DevToolsConnection.connect(
    await pageDebuggerUrl(await chromiumDebuggerUrl(chromiumProcess)),
  );
  await connection.send('Page.enable');
  await connection.send('Runtime.enable');
  await connection.send('Page.navigate', { url: pageUrl });
  await waitForDocumentContext(connection);
  const facts = await evaluate(
    connection,
    `(async () => {
      const waitFor = async (predicate, description) => {
        for (let observationCount = 0; observationCount < 500; observationCount++) {
          if (predicate()) return;
          await new Promise((resolveObservation) =>
            requestAnimationFrame(resolveObservation),
          );
        }
        throw new Error('The browser did not reach: ' + description);
      };
      const recordRow = (name) =>
        [...document.querySelectorAll('.record-row')].find(
          (row) => row.querySelector('.record-essence strong')?.textContent === name,
        );
      const selectRecord = async (name) => {
        const row = recordRow(name);
        if (!row) throw new Error('The browser has no record row for ' + name);
        row.click();
        await waitFor(
          () =>
            document.querySelector('.record-lens-title-row h2')?.textContent ===
            name,
          'the record lens for ' + name,
        );
      };
      const closeCodeLens = async () => {
        document.querySelector('.code-lens-popup header button').click();
        await waitFor(
          () => !document.querySelector('.code-lens-popup'),
          'the closed code lens',
        );
      };
      const openDeadCitation = async (recordName, path) => {
        await selectRecord(recordName);
        const reference = [...document.querySelectorAll('.code-reference')].find(
          (button) => button.querySelector('strong')?.textContent === path + ':1',
        );
        if (!reference) throw new Error('The dead citation is absent: ' + path);
        if (reference.querySelector('small')?.textContent !== 'Does not resolve') {
          throw new Error('The dead citation is not marked unresolved: ' + path);
        }
        reference.click();
        await waitFor(
          () =>
            document.querySelector('.code-lens-error')?.textContent?.includes(
              'does not resolve',
            ),
          'the honest unresolved popup for ' + path,
        );
        const message = document.querySelector('.code-lens-error').textContent;
        await closeCodeLens();
        return message;
      };

      await waitFor(
        () => document.querySelectorAll('.record-row').length > 0,
        'the record rows',
      );
      const snapshotIndex = Number(
        document.querySelector('input[aria-label="Contract history snapshot"]').value,
      );
      const snapshot = await fetch('/api/snapshots/' + snapshotIndex).then(
        (response) => response.json(),
      );
      const selectedName = 'Cost tracks the actively observed set';
      await selectRecord(selectedName);
      const selectedRecord = snapshot.records.find(
        (record) => record.name === selectedName,
      );
      if (!selectedRecord) throw new Error('The selected record is absent from the API.');
      const expectedAccordionCount =
        Object.keys(selectedRecord.fields).length - 1;
      const fieldAccordionCount = document.querySelectorAll(
        '.record-field-accordion',
      ).length;
      if (fieldAccordionCount !== expectedAccordionCount) {
        throw new Error(
          'The full record has ' +
            fieldAccordionCount +
            ' accordions, expected ' +
            expectedAccordionCount,
        );
      }

      const calculationDetails = document.querySelectorAll(
        '.record-lens .formula-panel details',
      )[1];
      calculationDetails.querySelector('summary').click();
      await waitFor(
        () => calculationDetails.querySelectorAll('tbody tr').length === 10,
        'the ten rank component rows',
      );
      const rankRows = calculationDetails.querySelectorAll('tbody tr').length;
      const relationshipGroups = document.querySelectorAll(
        '.relationships-section .relationship-group',
      ).length;
      const dependencyGroup = [...document.querySelectorAll('.relationship-group')].find(
        (group) => group.querySelector('h3')?.textContent === 'Depends on',
      );
      if (!dependencyGroup) {
        throw new Error('The selected record has no directed dependency group.');
      }
      const dependencyButton = dependencyGroup.querySelector('button');
      const dependencyName = dependencyButton.textContent.trim();
      dependencyButton.click();
      await waitFor(
        () =>
          document.querySelector('.record-lens-title-row h2')?.textContent ===
          dependencyName,
        'dependency navigation',
      );
      await selectRecord(selectedName);

      const annotationReference = [...document.querySelectorAll('.code-reference')].find(
        (button) =>
          button.querySelector('span')?.textContent === 'Enforcement annotation',
      );
      if (!annotationReference) {
        throw new Error('The selected record has no annotation lens.');
      }
      annotationReference.click();
      await waitFor(
        () => Boolean(document.querySelector('.code-lens-focus-line')),
        'the highlighted annotation focus line',
      );
      const annotationFocusLine = Number(
        document.querySelector('.code-lens-focus-line').dataset.line,
      );
      const annotationText =
        document.querySelector('.code-lens-focus-line').textContent;
      if (!annotationText.includes('invariant:')) {
        throw new Error(
          'The annotation focus line does not show the invariant comment.',
        );
      }
      const annotationTokenCount = document.querySelectorAll(
        '.code-lens-focus-line span[style*="color"]',
      ).length;
      await closeCodeLens();

      const firstDeadMessage = await openDeadCitation(
        'Appearance is data with a capability fallback',
        'src/modules/ui/PanelHeading.ts',
      );
      const secondDeadMessage = await openDeadCitation(
        'Undo records deltas not whole-document snapshots',
        'src/modules/editor/TextDocument.ts',
      );

      const codeLensRequest = async (path, line) =>
        fetch(
          '/api/code?' +
            new URLSearchParams({
              path,
              line: String(line),
              commit: snapshot.commit,
            }),
        ).then((response) => response.json());
      const typescriptLens = await codeLensRequest(
        'tools/invariant-field-v2/CodeLens.ts',
        20,
      );
      const vueLens = await codeLensRequest(
        'tools/invariant-field-v2/ui/InvariantField.vue',
        1,
      );
      const outsideResponse = await fetch(
        '/api/code?path=../../etc/passwd&line=1&commit=' + snapshot.commit,
      );
      const typescriptTokenCount =
        (typescriptLens.highlightedHtml.match(/style="color:/g) ?? []).length;
      const vueTokenCount =
        (vueLens.highlightedHtml.match(/style="color:/g) ?? []).length;
      if (!typescriptLens.resolved || typescriptTokenCount === 0) {
        throw new Error('The TypeScript source was not syntax highlighted.');
      }
      if (!vueLens.resolved || vueTokenCount === 0) {
        throw new Error('The Vue source was not syntax highlighted.');
      }
      if (outsideResponse.status !== 403) {
        throw new Error('The outside-root request was not refused.');
      }

      return {
        recordRows: document.querySelectorAll('.record-row').length,
        fieldAccordions: fieldAccordionCount,
        rankRows,
        relationshipGroups,
        dependencyNavigation: dependencyName,
        annotationFocusLine,
        annotationTokenCount,
        firstDeadCitation: firstDeadMessage,
        secondDeadCitation: secondDeadMessage,
        typescriptTokenCount,
        vueTokenCount,
        outsideStatus: outsideResponse.status,
      };
    })()`,
  );
  console.log(
    'FIELD_CODE_LENS ' +
      Object.entries(facts as Record<string, unknown>)
        .map(
          ([factName, factValue]) => `${factName}=${JSON.stringify(factValue)}`,
        )
        .join(' '),
  );
} finally {
  connection?.close();
  chromiumProcess.kill();
  await chromiumProcess.exited;
  rmSync(chromiumProfileDirectory, { recursive: true, force: true });
}

interface DevToolsMessage {
  id?: number;
  error?: {
    message: string;
  };
  result?: unknown;
}

interface DevToolsTarget {
  type: string;
  webSocketDebuggerUrl?: string;
}

interface RuntimeEvaluationResponse {
  result: {
    value?: unknown;
  };
  exceptionDetails?: {
    text: string;
    exception?: {
      description?: string;
    };
  };
}
