#!/usr/bin/env bun
// Drive `iv ssh` through a real local PTY and a spawned localhost sshd. The first arm uploads the
// shared small and 100,000-line scale files, pastes each remote dropzone path into a focused remote
// terminal, closes that pane while an independently gated upload is live, and drives the remote Open
// control through a stub client dialog. The race arm releases the upload only after the graph proves
// that the pane closed, then sends the same notification the ssh wrapper would send.
// The second arm sends the keyboard invariant's pass-through byte set to the existing raw-byte
// reporter through the same wrapper. A deliberately wrong byte expectation is the assertion's
// positive control.
//
// Run: bun scripts/harness/smoke-ssh-channel-harness.ts
// Read: every arm prints PASS; `ALL-PASS` means focused routing, PTY, resize, picker request,
// upload, notification, scale, and byte fidelity held through one OpenSSH control-master connection.
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { HarnessInput } from './HarnessInput';
import { GraphClient } from './GraphClient';
import { pass, requireCondition } from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import {
  ChannelClient,
  type ChannelUploadResult,
} from '../../src/modules/channel/ChannelClient';
import { ChannelDropNotification } from '../../src/modules/channel/ChannelDropNotification';
import { ChannelFrame } from '../../src/modules/channel/ChannelFrame';

const repositoryRoot = process.cwd();
const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-ssh-channel-'));
const sshDirectory = join(fixtureRoot, 'ssh');
const workspaceDirectory = join(fixtureRoot, 'workspace');
const scaleDirectory = join(fixtureRoot, 'scale');
const dialogBinaryDirectory = join(fixtureRoot, 'dialog-bin');
const dropzoneDirectory = join(fixtureRoot, 'dropzone');
const homeDirectory = join(fixtureRoot, 'home');
const receivedBytesPath = join(fixtureRoot, 'received-key-bytes.txt');
const remoteStatusPath = join(fixtureRoot, 'remote-status.json');
const binaryPath = join(fixtureRoot, 'iv');
const remoteExecutablePath = join(fixtureRoot, 'remote-iv');
const sshDaemonLogPath = join(fixtureRoot, 'sshd.log');
const userName = process.env.USER ?? '';

function run(argumentVector: string[]): void {
  const result = Bun.spawnSync(argumentVector, {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  requireCondition(
    result.exitCode === 0,
    `${argumentVector[0]} succeeds: ${result.stderr.toString()}`,
  );
}

async function freePort(): Promise<number> {
  const listener = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: { data() {} },
  });
  const port = listener.port;
  listener.stop(true);
  return port;
}

async function awaitPort(port: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const socket = await Bun.connect({
        hostname: '127.0.0.1',
        port,
        socket: { data() {} },
      });
      socket.end();
      return;
    } catch {
      await Bun.sleep(20);
    }
  }
  throw new Error(`localhost sshd did not listen on port ${port}`);
}

async function awaitFile(
  description: string,
  predicate: (text: string) => boolean,
): Promise<string> {
  const deadline = Date.now() + 15_000;
  let text = '';
  while (Date.now() < deadline) {
    try {
      text = readFileSync(receivedBytesPath, 'utf8');
    } catch {
      text = '';
    }
    if (predicate(text)) return text;
    await Bun.sleep(10);
  }
  throw new Error(`${description}; received file was ${JSON.stringify(text)}`);
}

async function awaitRemoteSize(width: number, height: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  let observedStatus = '';
  while (Date.now() < deadline) {
    try {
      observedStatus = readFileSync(remoteStatusPath, 'utf8');
      const status = JSON.parse(observedStatus) as {
        width?: unknown;
        height?: unknown;
      };
      if (status.width === width && status.height === height) return;
    } catch {
      // The atomic status file does not exist yet or is between publications.
    }
    await Bun.sleep(10);
  }
  throw new Error(
    `remote Invar status did not reach ${width}x${height}; last status was ${observedStatus}`,
  );
}

async function awaitRemoteStatus(
  description: string,
  predicate: (status: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 15_000;
  let observedStatus = '';
  while (Date.now() < deadline) {
    try {
      observedStatus = readFileSync(remoteStatusPath, 'utf8');
      const status = JSON.parse(observedStatus) as Record<string, unknown>;
      if (predicate(status)) return status;
    } catch {
      // The atomic status file does not exist yet or is between publications.
    }
    await Bun.sleep(10);
  }
  throw new Error(`${description}; last status was ${observedStatus}`);
}

async function requireRemoteGraphValue(
  path: string,
  expectedValue: unknown,
): Promise<void> {
  const response = await GraphClient.Class.query(
    remoteStatusPath,
    path,
    'settle',
  );
  requireCondition(
    JSON.stringify(response.value) === JSON.stringify(expectedValue),
    `remote graph ${path} is ${JSON.stringify(expectedValue)} after the driven step; ` +
      `received ${JSON.stringify(response.value)}`,
  );
}

function beginGatedIndependentUpload(
  sshArgumentVector: readonly string[],
  localPath: string,
): {
  readonly firstDataFrameWritten: Promise<void>;
  readonly release: () => void;
  readonly result: Promise<ChannelUploadResult>;
} {
  const channelProcess = Bun.spawn(
    [
      'ssh',
      ...sshArgumentVector,
      '--',
      remoteExecutablePath,
      '--channel-server',
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  let releaseUpload = (): void => {};
  const uploadRelease = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  let publishFirstDataFrame = (): void => {};
  const firstDataFrameWritten = new Promise<void>((resolve) => {
    publishFirstDataFrame = resolve;
  });
  let firstDataFrameSeen = false;
  let writeChain = Promise.resolve();
  const channelClient = new ChannelClient.Class((bytes) => {
    const ownedBytes = bytes.slice();
    writeChain = writeChain.then(async () => {
      channelProcess.stdin.write(ownedBytes);
      if (
        !firstDataFrameSeen &&
        ownedBytes[6] === ChannelFrame.Class.FRAME_KIND.StreamData
      ) {
        firstDataFrameSeen = true;
        publishFirstDataFrame();
        await uploadRelease;
      }
    });
  });
  const channelRead = (async (): Promise<void> => {
    for await (const bytes of channelProcess.stdout)
      channelClient.receive(new Uint8Array(bytes));
  })();
  const result = (async (): Promise<ChannelUploadResult> => {
    try {
      const uploadResult = await channelClient.upload(localPath);
      await writeChain;
      channelProcess.stdin.end();
      const exitCode = await channelProcess.exited;
      requireCondition(
        exitCode === 0,
        `independent upload channel exits cleanly: ${await new Response(channelProcess.stderr).text()}`,
      );
      await channelRead;
      return uploadResult;
    } finally {
      channelClient.close();
      channelProcess.kill();
    }
  })();
  return { firstDataFrameWritten, release: releaseUpload, result };
}

function uploadedPath(localPath: string): string {
  const sha256 = new Bun.CryptoHasher('sha256')
    .update(readFileSync(localPath))
    .digest('hex');
  return join(dropzoneDirectory, `${sha256}-${basename(localPath)}`);
}

function byteLines(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => /^[0-9a-f]{2}(?: [0-9a-f]{2})*$/u.test(line));
}

function sshArguments(port: number, identityPath: string): string[] {
  return [
    '-p',
    String(port),
    '-i',
    identityPath,
    '-o',
    'BatchMode=yes',
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    'LogLevel=ERROR',
    '-o',
    `SetEnv=INVAR_DROPZONE_DIRECTORY=${dropzoneDirectory}`,
    '-o',
    `SetEnv=XDG_CONFIG_HOME=${join(fixtureRoot, 'config')}`,
    '-o',
    'SetEnv=INVAR_AGENT_BACKEND=echo',
    '-o',
    'SetEnv=INVAR_HARNESS_DIRECT_QUIT=1',
    '-o',
    `SetEnv=TUI_STATUS_PATH=${remoteStatusPath}`,
    '127.0.0.1',
  ];
}

let sshDaemon: ReturnType<typeof Bun.spawn> | null = null;
try {
  run(['mkdir', '-p', sshDirectory, workspaceDirectory, homeDirectory]);
  writeFileSync(join(workspaceDirectory, 'start.txt'), 'REMOTE-START\n');
  run([
    'bun',
    'scripts/make-scale-workspace.ts',
    '--lines',
    '100000',
    '--directory',
    scaleDirectory,
  ]);
  run(['mkdir', '-p', dialogBinaryDirectory]);
  const pickerPath = join(scaleDirectory, 'picker.ts');
  writeFileSync(pickerPath, 'export const CLIENT_PICKER_CONTENT = true;\n');
  const dialogBinaryPath = join(dialogBinaryDirectory, 'zenity');
  writeFileSync(
    dialogBinaryPath,
    '#!/usr/bin/env bash\nprintf \'%s\\n\' "$INVAR_DIALOG_PICK_PATH"\n',
  );
  chmodSync(dialogBinaryPath, 0o700);
  run([
    'bun',
    'build',
    '--compile',
    '--minify',
    '--external',
    'web-tree-sitter',
    'src/main.ts',
    '--outfile',
    binaryPath,
  ]);
  run([
    'ssh-keygen',
    '-q',
    '-t',
    'ed25519',
    '-N',
    '',
    '-f',
    join(sshDirectory, 'host-key'),
  ]);
  run([
    'ssh-keygen',
    '-q',
    '-t',
    'ed25519',
    '-N',
    '',
    '-f',
    join(sshDirectory, 'user-key'),
  ]);
  writeFileSync(
    join(sshDirectory, 'authorized_keys'),
    readFileSync(join(sshDirectory, 'user-key.pub')),
  );
  writeFileSync(
    remoteExecutablePath,
    [
      '#!/usr/bin/env bash',
      `export INVAR_DROPZONE_DIRECTORY='${dropzoneDirectory}'`,
      `export XDG_CONFIG_HOME='${join(fixtureRoot, 'config')}'`,
      "export INVAR_AGENT_BACKEND='echo'",
      "export INVAR_HARNESS_DIRECT_QUIT='1'",
      `export TUI_STATUS_PATH='${remoteStatusPath}'`,
      'if [ "$1" = "--channel-server" ]; then',
      `  exec '${binaryPath}' --channel-server`,
      'fi',
      'if [ "$1" = "byte-reporter" ]; then',
      `  exec '${process.execPath}' '${join(repositoryRoot, 'scripts/harness/report-received-key-bytes.ts')}' "$2"`,
      'fi',
      'if [ "$1" = "exit-23" ]; then exit 23; fi',
      'if [ "$1" = "osc52" ]; then printf \'\\033]52;c;cmVtb3RlLWNvcHk=\\007\'; exit 0; fi',
      `exec '${binaryPath}' "$@"`,
      '',
    ].join('\n'),
  );
  chmodSync(remoteExecutablePath, 0o700);
  const port = await freePort();
  const sshDaemonConfigPath = join(sshDirectory, 'sshd_config');
  writeFileSync(
    sshDaemonConfigPath,
    [
      `Port ${port}`,
      'ListenAddress 127.0.0.1',
      `HostKey ${join(sshDirectory, 'host-key')}`,
      `PidFile ${join(sshDirectory, 'sshd.pid')}`,
      `AuthorizedKeysFile ${join(sshDirectory, 'authorized_keys')}`,
      'StrictModes no',
      'PasswordAuthentication no',
      'KbdInteractiveAuthentication no',
      'PubkeyAuthentication yes',
      'UsePAM no',
      'PrintMotd no',
      'PermitUserEnvironment no',
      'AcceptEnv INVAR_DROPZONE_DIRECTORY XDG_CONFIG_HOME INVAR_AGENT_BACKEND INVAR_HARNESS_DIRECT_QUIT TUI_STATUS_PATH',
      `AllowUsers ${userName}`,
      '',
    ].join('\n'),
  );
  sshDaemon = Bun.spawn(
    ['/usr/sbin/sshd', '-D', '-e', '-f', sshDaemonConfigPath],
    {
      stdout: 'ignore',
      stderr: Bun.file(sshDaemonLogPath),
    },
  );
  await awaitPort(port);
  pass('spawned localhost sshd accepts the isolated key');

  const commonSshArguments = sshArguments(port, join(sshDirectory, 'user-key'));
  console.log('== iv ssh: small and large drop upload ==');
  const applicationDriver = new PtyTestDriver.Class({
    workspaceRoot: workspaceDirectory,
    repositoryRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    command: [
      binaryPath,
      'ssh',
      ...commonSshArguments,
      '--',
      workspaceDirectory,
    ],
    environment: {
      INVAR_REMOTE_IV_COMMAND: remoteExecutablePath,
      INVAR_DIALOG_PICK_PATH: pickerPath,
      PATH: `${dialogBinaryDirectory}:${process.env.PATH ?? ''}`,
      DISPLAY: ':99',
    },
    retainFullOutput: true,
  });
  try {
    await applicationDriver.awaitSnapshot(
      (snapshot) => snapshot.findText('start.txt') !== null,
      30_000,
    );
    applicationDriver.sendKeys('Control+j');
    await awaitRemoteStatus(
      'the remote terminal receives focus before the drop',
      (status) =>
        status.terminalFocused === true &&
        status.panelActiveContentKind === 'terminal' &&
        status.activeBuffer === null,
    );
    await requireRemoteGraphValue('panelHost.focused', true);
    await requireRemoteGraphValue('panelHost.focusedContent.kind', 'terminal');
    await requireRemoteGraphValue('workspaceSet.activeDocument', null);
    const smallPath = join(scaleDirectory, 'small.ts');
    const uploadedSmallPath = uploadedPath(smallPath);
    applicationDriver.sendText('set -- ');
    applicationDriver.sendPaste(smallPath);
    applicationDriver.sendText(
      `; if [ "$1" = '${uploadedSmallPath}' ]; then printf 'REMOTE_DROPZONE=YES\\n'; else printf 'REMOTE_DROPZONE=NO\\n'; fi`,
    );
    applicationDriver.sendKeys('Enter');
    await applicationDriver.awaitSnapshot(
      (snapshot) => snapshot.findText('REMOTE_DROPZONE=YES') !== null,
      30_000,
    );
    await requireRemoteGraphValue('panelHost.focused', true);
    await requireRemoteGraphValue('panelHost.focusedContent.kind', 'terminal');
    await requireRemoteGraphValue('workspaceSet.activeDocument', null);
    requireCondition(
      !applicationDriver.recordedOutput().includes(smallPath),
      'small local path never reached SSH output',
    );
    pass(
      'small file uploaded before its dropzone path reached the remote child',
    );

    const largePath = join(scaleDirectory, 'huge.ts');
    const uploadedLargePath = uploadedPath(largePath);
    applicationDriver.sendText('set -- ');
    applicationDriver.sendPaste(largePath);
    applicationDriver.sendText(
      `; if [ "$1" = '${uploadedLargePath}' ]; then printf 'REMOTE_LARGE_DROPZONE=YES\\n'; else printf 'REMOTE_LARGE_DROPZONE=NO\\n'; fi`,
    );
    applicationDriver.sendKeys('Enter');
    await applicationDriver.awaitSnapshot(
      (snapshot) => snapshot.findText('REMOTE_LARGE_DROPZONE=YES') !== null,
      60_000,
    );
    await requireRemoteGraphValue('panelHost.focused', true);
    await requireRemoteGraphValue('panelHost.focusedContent.kind', 'terminal');
    await requireRemoteGraphValue('workspaceSet.activeDocument', null);
    requireCondition(
      !applicationDriver.recordedOutput().includes(largePath),
      'large local path never reached SSH output',
    );
    pass(
      '100,000-line file uploaded before its dropzone path reached the remote child',
    );
    await awaitRemoteStatus(
      'the focused remote terminal keeps both drops out of the editor',
      (status) =>
        status.terminalFocused === true && status.activeBuffer === null,
    );
    pass('focused remote drops opened no editor buffer');

    console.log('== iv ssh: focused pane closes during upload ==');
    const gatedUpload = beginGatedIndependentUpload(
      commonSshArguments,
      largePath,
    );
    await gatedUpload.firstDataFrameWritten;
    await requireRemoteGraphValue('panelHost.focused', true);
    await requireRemoteGraphValue('panelHost.focusedContent.kind', 'terminal');
    await requireRemoteGraphValue('workspaceSet.activeDocument', null);
    applicationDriver.sendKeys('Control+j');
    await GraphClient.Class.awaitValue(
      remoteStatusPath,
      'panelHost.visible',
      false,
    );
    await requireRemoteGraphValue('panelHost.visible', false);
    await requireRemoteGraphValue('panelHost.focused', false);
    await requireRemoteGraphValue('workspaceSet.activeDocument', null);
    gatedUpload.release();
    const gatedUploadResult = await gatedUpload.result;
    requireCondition(
      gatedUploadResult.path === uploadedLargePath,
      'the gated upload resolved to the expected remote dropzone path',
    );
    applicationDriver.sendPaste(
      ChannelDropNotification.Class.encode(gatedUploadResult.path),
    );
    await GraphClient.Class.awaitValue(
      remoteStatusPath,
      'workspaceSet.activeDocument.path',
      gatedUploadResult.path,
      30_000,
    );
    await requireRemoteGraphValue('panelHost.visible', false);
    await requireRemoteGraphValue('panelHost.focused', false);
    await requireRemoteGraphValue(
      'workspaceSet.activeDocument.path',
      gatedUploadResult.path,
    );
    pass(
      'a pane closed during upload could not receive the later notification',
    );
    pass('the post-upload notification fell back to editor open-by-kind');

    const openFileGlyphs = (['nerd', 'unicode', 'ascii'] as const).map(
      (glyphLevel) => ThemeIcons.Class.glyphFor(glyphLevel, 'fileTreeOpen'),
    );
    const beforePicker = applicationDriver.snapshot();
    requireCondition(
      beforePicker.findText('CLIENT_PICKER_CONTENT') === null,
      'positive control starts before the client-picked file is visible',
    );
    const openFilePosition = openFileGlyphs
      .map((glyph) => beforePicker.findText(glyph))
      .find((position) => position !== null);
    if (!openFilePosition)
      throw new Error('Remote Open file control is absent');
    applicationDriver.sendMouse({
      kind: 'move',
      column: openFilePosition.column,
      row: openFilePosition.row,
      button: 'none',
    });
    await applicationDriver.awaitGridCondition(
      'the remote Open file control receives hover before click',
      (snapshot) =>
        snapshot.cell(openFilePosition.row, openFilePosition.column)
          ?.background !==
        beforePicker.cell(openFilePosition.row, openFilePosition.column)
          ?.background,
    );
    applicationDriver.sendMouseClick({
      column: openFilePosition.column,
      row: openFilePosition.row,
      button: 'left',
    });
    await applicationDriver.awaitGridCondition(
      'dialog.request uploads and opens the client-native selection',
      (snapshot) => snapshot.findText('CLIENT_PICKER_CONTENT') !== null,
      30_000,
    );
    pass('remote Open used the client-native picker and dropzone upload');

    applicationDriver.resize(96, 32);
    await awaitRemoteSize(96, 32);
    requireCondition(
      applicationDriver.snapshot().columns === 96 &&
        applicationDriver.snapshot().rows === 32,
      'SIGWINCH drive settled at 96x32',
    );
    pass('resize crossed the wrapper');
  } finally {
    await applicationDriver.dispose();
  }

  const exitDriver = new PtyTestDriver.Class({
    workspaceRoot: workspaceDirectory,
    repositoryRoot,
    homeDirectory: join(fixtureRoot, 'exit-home'),
    command: [binaryPath, 'ssh', ...commonSshArguments, '--', 'exit-23'],
    environment: { INVAR_REMOTE_IV_COMMAND: remoteExecutablePath },
  });
  requireCondition(
    (await exitDriver.exitCode()) === 23,
    'remote exit code 23 crossed the wrapper',
  );
  await exitDriver.dispose();
  pass('remote exit code 23 became local exit code 23');

  const clipboardDriver = new PtyTestDriver.Class({
    workspaceRoot: workspaceDirectory,
    repositoryRoot,
    homeDirectory: join(fixtureRoot, 'clipboard-home'),
    command: [binaryPath, 'ssh', ...commonSshArguments, '--', 'osc52'],
    environment: { INVAR_REMOTE_IV_COMMAND: remoteExecutablePath },
  });
  await clipboardDriver.awaitOutputCondition(
    'the remote OSC 52 reaches the local terminal',
    () =>
      clipboardDriver
        .recordedOutput()
        .includes('\u001b]52;c;cmVtb3RlLWNvcHk=\u0007'),
  );
  requireCondition(
    clipboardDriver
      .clipboardEmissions()
      .some((emission) => emission.decodedText === 'remote-copy'),
    'OSC 52 payload stayed exact through the wrapper',
  );
  await clipboardDriver.dispose();
  pass('remote OSC 52 reached the host terminal unchanged');

  console.log('== iv ssh: keyboard byte sweep ==');
  writeFileSync(receivedBytesPath, '');
  const byteDriver = new PtyTestDriver.Class({
    workspaceRoot: workspaceDirectory,
    repositoryRoot,
    columns: 120,
    rows: 40,
    homeDirectory: join(fixtureRoot, 'byte-home'),
    command: [
      binaryPath,
      'ssh',
      ...commonSshArguments,
      '--',
      'byte-reporter',
      receivedBytesPath,
    ],
    environment: { INVAR_REMOTE_IV_COMMAND: remoteExecutablePath },
  });
  try {
    await awaitFile('remote byte reporter becomes ready', (text) =>
      text.includes('ready\n'),
    );
    const keyNames = [
      'Control+a',
      'Control+b',
      'Control+e',
      'Control+k',
      'Control+l',
      'Control+r',
      'Control+u',
      'Control+w',
      'Control+z',
      'Tab',
      'Shift+Tab',
      'Enter',
      'Backspace',
      'Escape',
      'Space',
      'Up',
      'Down',
      'Right',
      'Left',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'Delete',
      'Insert',
      'Alt+b',
      'Alt+f',
      'Control+p',
      'Control+f',
      'Control+s',
    ];
    requireCondition(
      Buffer.from(HarnessInput.Class.key('Control+a')).toString('hex') !== 'ff',
      'positive control rejects a planted wrong byte expectation',
    );
    const expectedBytes: number[] = [];
    for (const keyName of keyNames) {
      expectedBytes.push(...Buffer.from(HarnessInput.Class.key(keyName)));
      byteDriver.sendRawInputWithoutFrameExpectation(
        HarnessInput.Class.key(keyName),
      );
    }
    const text = await awaitFile(
      'the complete keyboard sweep reaches the remote reporter',
      (candidate) =>
        byteLines(candidate).flatMap((line) => line.split(' ')).length >=
        expectedBytes.length,
    );
    const observedBytes = byteLines(text).flatMap((line) =>
      line.split(' ').map((byte) => Number.parseInt(byte, 16)),
    );
    requireCondition(
      Buffer.from(observedBytes).equals(Buffer.from(expectedBytes)),
      'the keyboard sweep stayed byte exact and ordered',
    );
    pass(
      `${keyNames.length} keyboard encodings stayed byte exact through iv ssh`,
    );
  } finally {
    await byteDriver.dispose();
  }

  console.log('smoke-ssh-channel-harness: ALL-PASS');
} finally {
  sshDaemon?.kill();
  if (sshDaemon) await sshDaemon.exited;
  rmSync(fixtureRoot, { recursive: true, force: true });
}
