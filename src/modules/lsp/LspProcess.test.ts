import { expect, test } from 'bun:test';
import { Processes } from '../system/Processes';
import { LspProcess } from './LspProcess';

class MissingExecutableLspProcess extends LspProcess.$Class {
  protected override get Processes(): typeof Processes.Class {
    return {
      spawn: () => {
        throw new Error('missing language server');
      },
    } as unknown as typeof Processes.Class;
  }
}

test('a spawn failure is contained as process error state', () => {
  const process = new MissingExecutableLspProcess();

  expect(
    process.start(
      { command: 'missing-language-server', args: ['--stdio'] },
      '/tmp',
    ),
  ).toBe(false);
  expect(process.running).toBe(false);
  expect(process.error).toContain('missing language server');
  expect(process.pid).toBeNull();
});
