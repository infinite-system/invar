import { expect, test } from 'bun:test';
import { NativeTerminalPty } from './NativeTerminalPty';

// Drives the real native PTY (`Bun.Terminal`) — the macOS allocator. Runs on any platform Bun
// supports; the allocator is only SELECTED on darwin, but its behavior is verifiable everywhere.

/** Collect emitted bytes as text until `predicate` is satisfied or the deadline passes. */
async function collectUntil(
  pty: NativeTerminalPty.Model,
  predicate: (text: string) => boolean,
  timeoutMilliseconds = 4000,
): Promise<string> {
  let text = '';
  const decoder = new TextDecoder();
  return await new Promise<string>((resolve) => {
    const deadline = setTimeout(() => resolve(text), timeoutMilliseconds);
    pty.onData((bytes) => {
      text += decoder.decode(bytes);
      if (predicate(text)) {
        clearTimeout(deadline);
        resolve(text);
      }
    });
  });
}

test('the native allocator applies its size and streams child output', async () => {
  const pty = new NativeTerminalPty.Class(100, 30);
  const child = Bun.spawn(['bash', '-c', 'stty size; echo PTY_READY'], {
    terminal: pty.terminal,
  });

  const output = await collectUntil(pty, (text) => text.includes('PTY_READY'));

  // `stty size` prints "<rows> <cols>" — proof the constructor size reached the child (the op that
  // segfaults through the FFI ioctl on macOS).
  expect(output).toContain('30 100');
  expect(await child.exited).toBe(0);
  pty.close();
});

test('the native allocator forwards writes and buffers pre-registration output', async () => {
  const pty = new NativeTerminalPty.Class();
  const child = Bun.spawn(['bash', '-c', 'stty raw -echo; cat'], {
    terminal: pty.terminal,
  });
  // Write BEFORE onData registration; the echo must arrive via the pending buffer flush.
  pty.write('round-trip\n');
  await Bun.sleep(300);

  const output = await collectUntil(pty, (text) => text.includes('round-trip'));

  expect(output).toContain('round-trip');
  child.kill();
  pty.close();
});

test('writes after close are silently dropped and close is idempotent', () => {
  const pty = new NativeTerminalPty.Class();
  pty.close();
  pty.write('after close');
  pty.resize(10, 10);
  pty.close();
  expect(true).toBe(true);
});
