import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChannelClient } from './ChannelClient';
import { ChannelServer } from './ChannelServer';

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
