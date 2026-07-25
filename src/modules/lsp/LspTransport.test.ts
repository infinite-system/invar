import { expect, test } from 'bun:test';
import { LspTransport } from './LspTransport';
import { FakeLspProcess } from './lsp.fakes.test';

test('requests traverse the framed transport and settle their response', async () => {
  const process = new FakeLspProcess();
  process.start({ command: 'fake-lsp', args: ['--stdio'] }, '/tmp');
  const transport = new LspTransport.Class(process);

  expect(transport.start()).toBe(true);
  expect(
    await transport.request<{ capabilities: Record<string, never> }>(
      'initialize',
      {},
    ),
  ).toEqual({ capabilities: {} });

  transport.dispose();
  process.dispose();
  expect(transport.running).toBe(false);
});
