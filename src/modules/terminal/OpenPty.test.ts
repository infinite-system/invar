import { expect, test } from 'bun:test';
import { OpenPty } from './OpenPty';

test('the PTY resource publishes its plain construction seam', () => {
  expect(OpenPty.Class).toBe(OpenPty.$Class);
});

test('a saturated PTY write leaves the event loop responsive', async () => {
  const childSource = String.raw`
      import { OpenPty } from './src/modules/terminal/OpenPty';

      const openPty = new OpenPty.Class();
      const echoChild = Bun.spawn(
        ['bash', '-c', 'stty raw -echo; cat'],
        {
          stdio: [
            openPty.slaveFileDescriptor,
            openPty.slaveFileDescriptor,
            openPty.slaveFileDescriptor,
          ],
        },
      );
      openPty.releaseSlaveFileDescriptor();
      await Bun.sleep(100);
      const responsivenessResult = new Promise<void>((resolveResponsive) => {
        setTimeout(() => {
          console.log('EVENT_LOOP_RESPONSIVE');
          echoChild.kill();
          openPty.close();
          resolveResponsive();
        }, 50);
      });
      openPty.write(new Uint8Array(64 * 1024 * 1024));
      console.log('WRITE_ENQUEUED');
      await responsivenessResult;
      await echoChild.exited;
    `;
  const child = Bun.spawn([process.execPath, '--eval', childSource], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const completionResult = await Promise.race([
    child.exited.then((exitCode) => ({ kind: 'exit' as const, exitCode })),
    Bun.sleep(3_000).then(() => ({ kind: 'timeout' as const })),
  ]);
  if (completionResult.kind === 'timeout') {
    child.kill();
    await child.exited;
  }
  const standardOutput = await new Response(child.stdout).text();
  const standardError = await new Response(child.stderr).text();

  expect(completionResult.kind, standardError).toBe('exit');
  if (completionResult.kind === 'exit') {
    expect(completionResult.exitCode, standardError).toBe(0);
  }
  expect(standardOutput).toContain('WRITE_ENQUEUED');
  expect(standardOutput).toContain('EVENT_LOOP_RESPONSIVE');
}, 5_000);

test('a genuine asynchronous PTY write failure names its errno', async () => {
  const childSource = String.raw`
    import { closeSync } from 'node:fs';
    import { OpenPty } from './src/modules/terminal/OpenPty';

    class BrokenDescriptorOpenPty extends OpenPty.$Class {
      protected establishNonBlockingWriteState(): void {}

      breakMasterDescriptor(): void {
        closeSync(this.masterFileDescriptor);
      }
    }

    const openPty = new BrokenDescriptorOpenPty();
    process.once('uncaughtException', (error) => {
      console.log(error instanceof Error ? error.message : String(error));
      process.exit(0);
    });
    openPty.breakMasterDescriptor();
    openPty.write('failure');
    setTimeout(() => process.exit(2), 1_000);
  `;
  const child = Bun.spawn([process.execPath, '--eval', childSource], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await child.exited;
  const standardOutput = await new Response(child.stdout).text();
  const standardError = await new Response(child.stderr).text();

  expect(exitCode, standardError).toBe(0);
  expect(standardOutput).toContain('PTY write failed with errno 9');
});
