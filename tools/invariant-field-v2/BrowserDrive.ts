/**
 * Drive any local page through real headless Chromium over the DevTools
 * protocol, and give the caller one `evaluate` function plus one `screenshot`
 * function.
 *
 * This module is a library. It runs no page by itself. Import
 * `driveChromiumPage` from a sibling drive script:
 *
 *   import { driveChromiumPage } from './BrowserDrive';
 *   await driveChromiumPage('http://localhost:4314/', async (page) => {
 *     console.log(await page.evaluate('document.title'));
 *     await page.screenshot('/tmp/field.png');
 *   });
 *
 * `evaluate` returns the value of the expression, awaiting promises. It throws
 * the browser exception text when the expression fails, so a failed drive is
 * loud instead of quiet. `screenshot` writes a PNG of the current viewport.
 * The helper always kills Chromium and removes its private profile directory.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface DevToolsMessage {
  id?: number;
  error?: { message: string };
  result?: unknown;
}

interface DevToolsTarget {
  type: string;
  webSocketDebuggerUrl?: string;
}

interface RuntimeEvaluationResponse {
  result: { value: unknown };
  exceptionDetails?: {
    text: string;
    exception?: { description?: string };
  };
}

class DevToolsConnection {
  protected nextMessageIdentifier = 1;
  protected pendingMessages = new Map<
    number,
    { resolve(value: unknown): void; reject(reason: unknown): void }
  >();

  protected constructor(protected webSocket: WebSocket) {
    webSocket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as DevToolsMessage;
      if (!message.id) return;
      const pendingMessage = this.pendingMessages.get(message.id);
      if (!pendingMessage) return;
      this.pendingMessages.delete(message.id);
      if (message.error)
        pendingMessage.reject(new Error(message.error.message));
      else pendingMessage.resolve(message.result);
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
      JSON.stringify({ id: messageIdentifier, method, params: parameters }),
    );
    return response;
  }

  close() {
    this.webSocket.close();
  }
}

async function chromiumDebuggerUrl(
  standardErrorStream: ReadableStream<Uint8Array>,
): Promise<string> {
  const standardErrorReader = standardErrorStream.getReader();
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

export interface DrivenPage {
  evaluate(expression: string): Promise<unknown>;
  navigate(url: string): Promise<void>;
  screenshot(outputPath: string): Promise<void>;
}

export interface DriveOptions {
  viewportWidth?: number;
  viewportHeight?: number;
}

export async function driveChromiumPage<Result>(
  pageUrl: string,
  drive: (page: DrivenPage) => Promise<Result>,
  options: DriveOptions = {},
): Promise<Result> {
  const viewportWidth = options.viewportWidth ?? 1600;
  const viewportHeight = options.viewportHeight ?? 1200;
  const chromiumExecutable = Bun.which('chromium');
  if (!chromiumExecutable) throw new Error('Chromium is not installed.');
  const chromiumProfileDirectory = mkdtempSync(
    join(tmpdir(), 'invariant-field-browser-drive-'),
  );
  const chromiumProcess = Bun.spawn({
    cmd: [
      chromiumExecutable,
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      `--window-size=${viewportWidth},${viewportHeight}`,
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
      await pageDebuggerUrl(
        await chromiumDebuggerUrl(
          chromiumProcess.stderr as ReadableStream<Uint8Array>,
        ),
      ),
    );
    const openConnection = connection;
    await openConnection.send('Page.enable');
    await openConnection.send('Runtime.enable');
    const evaluate = async (expression: string): Promise<unknown> => {
      const response = (await openConnection.send('Runtime.evaluate', {
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
    };
    const waitForDocumentContext = async () => {
      for (
        let observationCount = 0;
        observationCount < 800;
        observationCount++
      ) {
        try {
          if (await evaluate('document.readyState === "complete"')) return;
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
    };
    const navigate = async (url: string) => {
      await openConnection.send('Page.navigate', { url });
      await waitForDocumentContext();
    };
    await navigate(pageUrl);
    return await drive({
      evaluate,
      navigate,
      async screenshot(outputPath: string) {
        const capture = (await openConnection.send('Page.captureScreenshot', {
          format: 'png',
        })) as { data: string };
        writeFileSync(outputPath, Buffer.from(capture.data, 'base64'));
      },
    });
  } finally {
    connection?.close();
    chromiumProcess.kill();
    await chromiumProcess.exited;
    rmSync(chromiumProfileDirectory, { recursive: true, force: true });
  }
}
