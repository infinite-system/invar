import { expect, test } from 'bun:test';
import { SshClient, type SshCommands } from './SshClient';

test('ssh arguments and remote Invar arguments stay on their own sides', () => {
  expect(
    SshClient.Class.parseArguments(['-p', '2222', 'host', '--', '/work tree']),
  ).toEqual({
    sshArguments: ['-p', '2222', 'host'],
    remoteArguments: ['/work tree'],
  });
  const commands = SshClient.Class.commands(
    '/tmp/control',
    ['-p', '2222', 'host'],
    ['/work tree'],
  );
  expect(commands.master).toContain('ControlPersist=no');
  expect(commands.channel.at(-1)).toBe("'iv' --channel-server");
  expect(commands.interactive.at(-1)).toBe("'iv' '/work tree'");
  expect(commands.interactive).toContain('-tt');

  const channelCommands = SshClient.Class.commands(
    '/tmp/control',
    ['host'],
    ['/workspace'],
    'iv',
    '/tmp/invar-channel-session.sock',
  );
  expect(channelCommands.channel.at(-1)).toBe(
    "INVAR_CHANNEL_SOCKET='/tmp/invar-channel-session.sock' 'iv' --channel-server",
  );
  expect(channelCommands.interactive.at(-1)).toBe(
    "INVAR_CHANNEL_SOCKET='/tmp/invar-channel-session.sock' 'iv' '/workspace'",
  );
});

// When the remote channel dies, the error must carry the remote's stderr — "Remote channel
// closed" alone cost a real diagnosis round (2026-08-10: the actual cause, a missing `iv` on the
// remote, was sitting unread in the piped stderr). Both arms: with stderr evidence the message
// names it; without evidence the bare message survives unchanged.
test('a dead channel reports the remote stderr when there is any', async () => {
  class ProbeSshClient extends SshClient.$Class {
    async probeReadChannel(
      stream: ReadableStream<Uint8Array>,
      client: Parameters<$ProbeReadChannel>[1],
      tail?: { text(): string },
    ) {
      return this.readChannel(stream, client, tail);
    }
  }
  type $ProbeReadChannel = ProbeSshClient['readChannel'];
  const client = new ProbeSshClient([], []);
  const emptyStream = () =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
  const closeErrors: unknown[] = [];
  const fakeChannelClient = {
    receive: () => {},
    close: (error: unknown) => closeErrors.push(error),
  } as never;

  await client.probeReadChannel(emptyStream(), fakeChannelClient, {
    text: () => 'bash: iv: command not found',
  });
  await client.probeReadChannel(emptyStream(), fakeChannelClient);

  expect(String(closeErrors[0])).toContain('bash: iv: command not found');
  expect(String(closeErrors[0])).toContain('INVAR_REMOTE_IV_COMMAND');
  expect(String(closeErrors[1])).toBe('Error: Remote channel closed');
});

// The macOS interactive-session helper, driven with a local command standing in for the ssh
// process. What this proves: the native PTY is allocated, the interactive child is attached
// through the `terminal` spawn option, its output reaches the registered sink, writes reach the
// child, and the session exits cleanly. The ssh connection itself (master, channel) is spawned by
// unchanged code above this helper. Cross-platform on purpose: `Bun.Terminal` runs everywhere, so
// the Linux gate exercises the darwin path too.
test('the native interactive session wires PTY output, input, and exit', async () => {
  class ProbeSshClient extends SshClient.$Class {
    probeNativeInteractive(commands: SshCommands) {
      return this.spawnNativeInteractive(commands, 100, 30);
    }
  }
  const client = new ProbeSshClient([], []);
  const commands: SshCommands = {
    master: [],
    channel: [],
    interactive: ['bash', '-c', 'stty size; stty raw -echo; cat'],
    close: [],
  };
  const written: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: Uint8Array | string) => {
    written.push(
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
    );
    return true;
  }) as typeof process.stdout.write;
  try {
    const { openPty, interactiveProcess } =
      client.probeNativeInteractive(commands);
    const outputArrived = async (needle: string) => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (written.join('').includes(needle)) return true;
        await Bun.sleep(100);
      }
      return false;
    };
    // `stty size` proves the 100x30 geometry reached the child through the native PTY.
    expect(await outputArrived('30 100')).toBe(true);
    openPty.write('ssh-round-trip\n');
    expect(await outputArrived('ssh-round-trip')).toBe(true);
    interactiveProcess.kill();
    await interactiveProcess.exited;
    openPty.close();
  } finally {
    process.stdout.write = originalWrite;
  }
});
