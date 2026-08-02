import { expect, test } from 'bun:test';
import { OpenPty } from './OpenPty';

test('the PTY resource publishes its plain construction seam', () => {
  expect(OpenPty.Class).toBe(OpenPty.$Class);
});

// The regression this pins: queueing every write behind `setTimeout(…, 0)` put
// a whole clamped millisecond between a keystroke and the bytes leaving the
// process, on both the integrated-terminal and harness PTY write paths. An
// empty queue on return is the observable form of "no timer turn was needed".
test('a keystroke write needs no timer turn', async () => {
  const childSource = String.raw`
    import { OpenPty } from './src/modules/terminal/OpenPty';

    class QueueObservingOpenPty extends OpenPty.$Class {
      get pendingWriteCount(): number {
        return this.writeQueue.length;
      }
    }

    const openPty = new QueueObservingOpenPty();
    const echoChild = Bun.spawn(['bash', '-c', 'stty raw -echo; cat'], {
      stdio: [
        openPty.slaveFileDescriptor,
        openPty.slaveFileDescriptor,
        openPty.slaveFileDescriptor,
      ],
    });
    openPty.releaseSlaveFileDescriptor();
    await Bun.sleep(100);
    openPty.write('\x1b[C');
    console.log('PENDING_AFTER_WRITE=' + openPty.pendingWriteCount);
    echoChild.kill();
    openPty.close();
    await echoChild.exited;
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
  expect(standardOutput).toContain('PENDING_AFTER_WRITE=0');
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

test('a normal master read-stream close resumes bytes from the live PTY', async () => {
  const childSource = String.raw`
    import { OpenPty } from './src/modules/terminal/OpenPty';

    class InterruptibleOpenPty extends OpenPty.$Class {
      readStartCount = 0;

      protected override startMasterRead(callback: (bytes: Uint8Array) => void): void {
        this.readStartCount += 1;
        super.startMasterRead(callback);
      }

      interruptMasterRead(): void {
        this.readStream?.destroy();
      }
    }

    const openPty = new InterruptibleOpenPty();
    let receivedText = '';
    let resolveAfterRestart: (() => void) | null = null;
    const afterRestart = new Promise<void>((resolve) => {
      resolveAfterRestart = resolve;
    });
    openPty.onData((bytes) => {
      receivedText += new TextDecoder().decode(bytes);
      if (receivedText.includes('AFTER_RESTART')) resolveAfterRestart?.();
    });
    const echoChild = Bun.spawn(['bash', '-c', 'stty raw -echo; cat'], {
      stdio: [
        openPty.slaveFileDescriptor,
        openPty.slaveFileDescriptor,
        openPty.slaveFileDescriptor,
      ],
    });
    openPty.releaseSlaveFileDescriptor();
    openPty.interruptMasterRead();
    while (openPty.readStartCount < 2) await Bun.sleep(1);
    openPty.write('AFTER_RESTART');
    await afterRestart;
    console.log('READ_RESTARTED=' + openPty.readStartCount);
    echoChild.kill();
    openPty.close();
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
  expect(standardOutput).toContain('READ_RESTARTED=2');
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

test('a failed PTY window resize names the ioctl and errno', async () => {
  const childSource = String.raw`
    import { closeSync } from 'node:fs';
    import { OpenPty } from './src/modules/terminal/OpenPty';

    class BrokenResizeOpenPty extends OpenPty.$Class {
      breakMasterDescriptor(): void {
        closeSync(this.masterFileDescriptor);
      }
    }

    const openPty = new BrokenResizeOpenPty();
    openPty.releaseSlaveFileDescriptor();
    openPty.breakMasterDescriptor();
    try {
      openPty.resize(60, 25);
      process.exit(2);
    } catch (error) {
      console.log(error instanceof Error ? error.message : String(error));
    }
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
  expect(standardOutput).toContain(
    'OpenPty TIOCSWINSZ failed with errno 9 for 60x25',
  );
});
