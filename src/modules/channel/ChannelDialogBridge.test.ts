import { afterEach, expect, test } from 'bun:test';
import { createServer, type Server } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChannelDialogBridge } from './ChannelDialogBridge';

const originalSocketPath = process.env.INVAR_CHANNEL_SOCKET;

afterEach(() => {
  if (originalSocketPath === undefined) delete process.env.INVAR_CHANNEL_SOCKET;
  else process.env.INVAR_CHANNEL_SOCKET = originalSocketPath;
});

test('dialog bridge is unavailable without an iv ssh channel', async () => {
  delete process.env.INVAR_CHANNEL_SOCKET;
  await expect(ChannelDialogBridge.Class.pickFile()).resolves.toEqual({
    available: false,
    path: null,
  });
});

test('dialog bridge requests a picked dropzone path over its session socket', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'invar-dialog-bridge-'));
  const socketPath = join(directory, 'channel.sock');
  let server: Server | null = null;
  try {
    server = createServer((socket) => {
      socket.once('data', () =>
        socket.end(`${JSON.stringify({ path: '/dropzone/picked.ts' })}\n`),
      );
    });
    await new Promise<void>((resolve) => server!.listen(socketPath, resolve));
    process.env.INVAR_CHANNEL_SOCKET = socketPath;
    await expect(ChannelDialogBridge.Class.pickFile()).resolves.toEqual({
      available: true,
      path: '/dropzone/picked.ts',
    });
  } finally {
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
