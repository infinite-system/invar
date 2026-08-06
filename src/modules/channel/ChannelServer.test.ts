import { expect, test } from 'bun:test';
import { ChannelFrame } from './ChannelFrame';
import { ChannelServer } from './ChannelServer';

test('server negotiates version 1 and rejects an unknown capability', async () => {
  const output: Uint8Array[] = [];
  const server = new ChannelServer.Class((bytes) => output.push(bytes.slice()));
  await server.receive(
    ChannelFrame.Class.encode(ChannelFrame.Class.FRAME_KIND.Hello, {
      versions: ['1.0'],
      capabilities: [],
    }),
  );
  await server.receive(
    ChannelFrame.Class.encode(ChannelFrame.Class.FRAME_KIND.Request, {
      requestId: 'unknown',
      method: 'fs.read',
      parameters: {},
    }),
  );
  const decoder = new ChannelFrame.Class();
  const frames = output.flatMap((bytes) => decoder.push(bytes));
  expect(frames[0]?.kind).toBe(ChannelFrame.Class.FRAME_KIND.Welcome);
  expect(frames[1]?.header).toEqual({
    requestId: 'unknown',
    error: { code: 'METHOD_NOT_FOUND', message: 'Unsupported method fs.read' },
  });
});
