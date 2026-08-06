import { expect, test } from 'bun:test';
import { SshClient } from './SshClient';

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
