import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:net';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChannelClient } from './ChannelClient';
import { ChannelServer } from './ChannelServer';
import { ChannelDialogBridge } from './ChannelDialogBridge';

test('client and server negotiate then stream an upload', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'invar-channel-client-'));
  const sourcePath = join(directory, 'source.txt');
  const dropzonePath = join(directory, 'dropzone');
  writeFileSync(sourcePath, 'channel cargo');
  const originalDropzone = process.env.INVAR_DROPZONE_DIRECTORY;
  process.env.INVAR_DROPZONE_DIRECTORY = dropzonePath;
  let client: ChannelClient.Model;
  const server = new ChannelServer.Class((bytes) =>
    queueMicrotask(() => client.receive(bytes)),
  );
  client = new ChannelClient.Class((bytes) =>
    queueMicrotask(() => void server.receive(bytes)),
  );
  try {
    const result = await client.upload(sourcePath);
    expect(await Bun.file(result.path).text()).toBe('channel cargo');
    expect(result.size).toBe(13);
  } finally {
    if (originalDropzone === undefined)
      delete process.env.INVAR_DROPZONE_DIRECTORY;
    else process.env.INVAR_DROPZONE_DIRECTORY = originalDropzone;
  }
});

test('server sends dialog.request to the client and returns its selected path', async () => {
  class DialogChannelServer extends ChannelServer.$Class {
    openDialogSocket(socketPath: string): Promise<Server> {
      return this.listenForDialogRequests(socketPath);
    }

    closeDialogSocket(server: Server, socketPath: string): Promise<void> {
      return this.closeDialogServer(server, socketPath);
    }
  }

  const directory = mkdtempSync(join(tmpdir(), 'invar-channel-dialog-'));
  const socketPath = join(tmpdir(), `${basename(directory)}.sock`);
  const originalSocketPath = process.env.INVAR_CHANNEL_SOCKET;
  let client: ChannelClient.Model;
  const server = new DialogChannelServer((bytes) =>
    queueMicrotask(() => client.receive(bytes)),
  );
  client = new ChannelClient.Class(
    (bytes) => queueMicrotask(() => void server.receive(bytes)),
    async (method) => {
      expect(method).toBe('dialog.request');
      return { path: '/dropzone/from-client.ts' };
    },
  );
  const dialogServer = await server.openDialogSocket(socketPath);
  process.env.INVAR_CHANNEL_SOCKET = socketPath;
  try {
    await client.negotiate();
    const result = await ChannelDialogBridge.Class.pickFile();
    expect(result).toEqual({
      available: true,
      path: '/dropzone/from-client.ts',
    });
    expect(result.path).not.toBe('/dropzone/planted-wrong-path.ts');
  } finally {
    await server.closeDialogSocket(dialogServer, socketPath);
    if (originalSocketPath === undefined)
      delete process.env.INVAR_CHANNEL_SOCKET;
    else process.env.INVAR_CHANNEL_SOCKET = originalSocketPath;
    rmSync(directory, { recursive: true, force: true });
  }
});
