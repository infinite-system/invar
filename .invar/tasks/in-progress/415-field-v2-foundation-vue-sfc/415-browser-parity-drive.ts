/**
 * Drive the Invariance Field v2 through Chromium and verify its five migrated surfaces.
 *
 * Run: start `bun tools/invariant-field-v2/server.ts`, then run both:
 * `bun .invar/tasks/in-progress/415-field-v2-foundation-vue-sfc/415-browser-parity-drive.ts`
 * and
 * `bun .invar/tasks/in-progress/415-field-v2-foundation-vue-sfc/415-browser-parity-drive.ts 'http://localhost:4314/?snapshot=0'`.
 *
 * The final line reports field dots, record cards, opened fields, composition lighting,
 * filtered cards, selected-record calculation rows, and the timeline index. These counts show
 * what the real browser rendered and changed at each scale. A missing required response fails.
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
    const response = new Promise<unknown>((resolve, reject) => {
      this.pendingMessages.set(messageIdentifier, { resolve, reject });
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

  close(): void {
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
  const targetListUrl = `http://${debuggerAddress.host}/json/list`;
  for (let observationCount = 0; observationCount < 500; observationCount++) {
    const targets = (await fetch(targetListUrl).then((response) =>
      response.json(),
    )) as DevToolsTarget[];
    const pageTarget = targets.find((target) => target.type === 'page');
    if (pageTarget?.webSocketDebuggerUrl) {
      return pageTarget.webSocketDebuggerUrl;
    }
    await Bun.sleep(10);
  }
  throw new Error('Chromium did not publish a page target.');
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

const pageUrl = process.argv[2] ?? 'http://localhost:4314/';
const chromiumExecutable = Bun.which('chromium');
if (!chromiumExecutable) {
  throw new Error(
    'Chromium is not installed. Install it and run the drive again.',
  );
}
const chromiumProfileDirectory = mkdtempSync(
  join(tmpdir(), 'invariant-field-v2-browser-drive-'),
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
  const browserDebuggerUrl = await chromiumDebuggerUrl(chromiumProcess);
  connection = await DevToolsConnection.connect(
    await pageDebuggerUrl(browserDebuggerUrl),
  );
  await connection.send('Page.enable');
  await connection.send('Runtime.enable');
  await connection.send('Page.navigate', { url: pageUrl });
  await waitForDocumentContext(connection);
  await evaluate(
    connection,
    `(async () => {
      for (let observationCount = 0; observationCount < 500; observationCount++) {
        if (
          document.querySelectorAll('.record-dot').length > 0 &&
          document.querySelectorAll('.record-card').length > 0
        ) return true;
        await new Promise((resolveObservation) =>
          requestAnimationFrame(resolveObservation),
        );
      }
      throw new Error('The field and record list did not render.');
    })()`,
  );
  const facts = (await evaluate(
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

      const facts = {
        fieldDots: document.querySelectorAll('.record-dot').length,
        recordCards: document.querySelectorAll('.record-card').length,
        openedRecordFields: 0,
        compositionAvailable: false,
        compositionMembers: 0,
        mutedCompositionDots: 0,
        filteredRecordCards: 0,
        selectedCalculationRows: 0,
        timelineIndex: '',
        timelineMaximum: '',
        timelineTarget: '',
      };

      const firstDot = document.querySelector('.record-dot');
      firstDot.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitFor(
        () => document.querySelectorAll('.record-dot-selected').length === 1,
        'one selected field dot',
      );

      const calculationDetails =
        document.querySelectorAll('.formula-panel details')[1];
      calculationDetails.querySelector('summary').click();
      await waitFor(
        () => calculationDetails.open && Boolean(calculationDetails.querySelector('h3')),
        'the selected-record calculation accordion',
      );
      facts.selectedCalculationRows =
        calculationDetails.querySelectorAll('tbody tr').length;

      const firstRecordCard = document.querySelector('.record-card');
      firstRecordCard.querySelector('summary').click();
      await waitFor(() => firstRecordCard.open, 'the first record accordion');
      facts.openedRecordFields =
        firstRecordCard.querySelectorAll('.record-field').length;

      const compositionSelect = document.querySelector(
        '.field-panel select',
      );
      facts.compositionAvailable = compositionSelect.options.length > 1;
      if (facts.compositionAvailable) {
        compositionSelect.value = compositionSelect.options[1].value;
        compositionSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await waitFor(
          () =>
            document.querySelectorAll('.record-dot-composition').length > 0 &&
            document.querySelectorAll('.record-dot-muted').length > 0 &&
            document.querySelectorAll('.record-card').length < facts.recordCards,
          'composition lighting and record filtering',
        );
        facts.compositionMembers = document.querySelectorAll(
          '.record-dot-composition',
        ).length;
        facts.mutedCompositionDots =
          document.querySelectorAll('.record-dot-muted').length;
        facts.filteredRecordCards =
          document.querySelectorAll('.record-card').length;
      }

      const timelineInput = document.querySelector(
        'input[aria-label="Contract history snapshot"]',
      );
      const originalTimelineTitle =
        document.querySelector('.snapshot-title').textContent;
      facts.timelineTarget = String(
        Number(timelineInput.value) === 0
          ? 1
          : Number(timelineInput.value) - 1,
      );
      timelineInput.value = facts.timelineTarget;
      timelineInput.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(
        () =>
          document.querySelector('.snapshot-title').textContent !==
          originalTimelineTitle,
        'the previous history snapshot',
      );
      facts.timelineIndex = timelineInput.value;
      facts.timelineMaximum = timelineInput.max;
      return facts;
    })()`,
  )) as BrowserParityFacts;

  if (
    facts.fieldDots === 0 ||
    facts.recordCards === 0 ||
    facts.openedRecordFields === 0 ||
    (facts.compositionAvailable &&
      (facts.compositionMembers === 0 ||
        facts.mutedCompositionDots === 0 ||
        facts.filteredRecordCards === 0)) ||
    facts.selectedCalculationRows === 0 ||
    facts.timelineIndex !== facts.timelineTarget
  ) {
    throw new Error(
      `The browser returned incomplete facts: ${JSON.stringify(facts)}`,
    );
  }
  console.log(
    'BROWSER_PARITY ' +
      Object.entries(facts)
        .map(([factName, factValue]) => `${factName}=${factValue}`)
        .join(' '),
  );
} finally {
  connection?.close();
  chromiumProcess.kill();
  await chromiumProcess.exited;
  rmSync(chromiumProfileDirectory, { recursive: true, force: true });
}

interface BrowserParityFacts {
  fieldDots: number;
  recordCards: number;
  openedRecordFields: number;
  compositionAvailable: boolean;
  compositionMembers: number;
  mutedCompositionDots: number;
  filteredRecordCards: number;
  selectedCalculationRows: number;
  timelineIndex: string;
  timelineMaximum: string;
  timelineTarget: string;
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
  url: string;
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
