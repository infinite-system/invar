import { expect, test } from 'bun:test';
import { BunTerminalBackend } from './BunTerminalBackend';

// These drive the real native PTY (`Bun.Terminal`), the same path the app takes on macOS. They run
// on any platform Bun supports — the backend itself is only SELECTED on darwin, but its behavior is
// verifiable everywhere the gate runs. Each test tears the backend down so no live PTY keeps the
// bun-test event loop alive.

/** Collect emitted bytes as text until `predicate` is satisfied or the deadline passes. */
async function collectUntil(
  backend: BunTerminalBackend.Model,
  predicate: (text: string) => boolean,
  timeoutMilliseconds = 4000,
): Promise<string> {
  let text = '';
  const decoder = new TextDecoder();
  return await new Promise<string>((resolve) => {
    const deadline = setTimeout(() => resolve(text), timeoutMilliseconds);
    backend.onData((bytes) => {
      text += decoder.decode(bytes);
      if (predicate(text)) {
        clearTimeout(deadline);
        resolve(text);
      }
    });
  });
}

test('the native PTY backend constructs, applies its size, streams output, and exits', async () => {
  const backend = new BunTerminalBackend.Class({
    columns: 100,
    rows: 30,
    command: 'stty size; echo BACKEND_READY',
    cleanPrompt: false,
  });
  const exitCode = new Promise<number | null>((resolve) =>
    backend.onExit(resolve),
  );

  const output = await collectUntil(backend, (text) =>
    text.includes('BACKEND_READY'),
  );

  // `stty size` prints "<rows> <cols>" — proof the resize reached the child (the op that segfaults
  // through the FFI ioctl on macOS).
  expect(output).toContain('30 100');
  expect(output).toContain('BACKEND_READY');
  expect(await exitCode).toBe(0);
  backend.kill();
});

test('the native PTY backend forwards written bytes to the child', async () => {
  const backend = new BunTerminalBackend.Class({
    command: 'cat',
    cleanPrompt: false,
  });
  backend.write('round-trip\n');

  const output = await collectUntil(backend, (text) =>
    text.includes('round-trip'),
  );

  expect(output).toContain('round-trip');
  backend.kill();
});
