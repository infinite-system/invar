import { Static } from 'ivue/extras';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenPty } from '../system/OpenPty';
import { Processes } from '../system/Processes';
import { BracketedPathPaste } from './BracketedPathPaste';
import { ChannelClient } from './ChannelClient';
import { ChannelDropNotification } from './ChannelDropNotification';

class $SshClient {
  static async main(argumentsList: string[]): Promise<number> {
    const parsed = this.parseArguments(argumentsList);
    const client = new this(parsed.sshArguments, parsed.remoteArguments);
    return client.run();
  }

  static parseArguments(argumentsList: string[]): SshClientArguments {
    const separatorIndex = argumentsList.indexOf('--');
    const sshArguments =
      separatorIndex < 0
        ? argumentsList
        : argumentsList.slice(0, separatorIndex);
    const remoteArguments =
      separatorIndex < 0 ? [] : argumentsList.slice(separatorIndex + 1);
    if (sshArguments.length === 0) {
      throw new Error(
        'Usage: iv ssh [ssh options] host [-- remote Invar arguments]',
      );
    }
    return { sshArguments, remoteArguments };
  }

  static commands(
    controlSocketPath: string,
    sshArguments: string[],
    remoteArguments: string[],
    remoteExecutable = 'iv',
  ): SshCommands {
    const common = ['ssh', '-S', controlSocketPath];
    const remoteCommand = [remoteExecutable, ...remoteArguments]
      .map((argument) => this.shellArgument(argument))
      .join(' ');
    return {
      master: [
        'ssh',
        '-M',
        '-S',
        controlSocketPath,
        '-o',
        'ControlPersist=no',
        '-N',
        '-f',
        ...sshArguments,
      ],
      channel: [
        ...common,
        '-T',
        ...sshArguments,
        `${this.shellArgument(remoteExecutable)} --channel-server`,
      ],
      interactive: [...common, '-tt', ...sshArguments, remoteCommand],
      close: [...common, '-O', 'exit', ...sshArguments],
    };
  }

  protected static shellArgument(argument: string): string {
    return `'${argument.replaceAll("'", "'\"'\"'")}'`;
  }

  constructor(
    protected readonly sshArguments: string[],
    protected readonly remoteArguments: string[],
  ) {}

  protected controlDirectory = '';
  protected channelProcess: ReturnType<typeof Processes.Class.spawn> | null =
    null;
  protected interactiveProcess: ReturnType<
    typeof Processes.Class.spawn
  > | null = null;
  protected openPty: OpenPty.Model | null = null;
  protected previousRawMode = false;
  protected stopping = false;

  async run(): Promise<number> {
    const sshClientClass = this.constructor as typeof $SshClient;
    if (
      !process.stdin.isTTY ||
      !process.stdout.isTTY ||
      !process.stdin.setRawMode
    ) {
      throw new Error('iv ssh requires a terminal on stdin and stdout');
    }
    this.controlDirectory = mkdtempSync(join(tmpdir(), 'invar-ssh-'));
    const controlSocketPath = join(this.controlDirectory, 'control');
    const commands = sshClientClass.commands(
      controlSocketPath,
      this.sshArguments,
      this.remoteArguments,
      process.env.INVAR_REMOTE_IV_COMMAND ?? 'iv',
    );
    const stopForSignal = (signal: NodeJS.Signals): void => {
      this.interactiveProcess?.kill(signal);
      this.channelProcess?.kill();
    };
    const stopForInterrupt = (): void => stopForSignal('SIGINT');
    const stopForTermination = (): void => stopForSignal('SIGTERM');
    process.once('SIGINT', stopForInterrupt);
    process.once('SIGTERM', stopForTermination);
    try {
      const master = Processes.Class.spawn(commands.master, {
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
      });
      const masterExitCode = await master.exited;
      if (masterExitCode !== 0) return masterExitCode;
      return await this.runSessions(commands);
    } finally {
      process.off('SIGINT', stopForInterrupt);
      process.off('SIGTERM', stopForTermination);
      await this.stop(commands.close);
    }
  }

  protected async runSessions(commands: SshCommands): Promise<number> {
    const channelProcess = Processes.Class.spawn(commands.channel, {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    this.channelProcess = channelProcess;
    const channelClient = new ChannelClient.Class((bytes) =>
      channelProcess.stdin.write(bytes),
    );
    const channelRead = this.readChannel(channelProcess.stdout, channelClient);
    await channelClient.negotiate();

    const columns = process.stdout.columns ?? 80;
    const rows = process.stdout.rows ?? 24;
    const openPty = new OpenPty.Class(columns, rows);
    this.openPty = openPty;
    openPty.onData((bytes) => process.stdout.write(bytes));
    const interactiveCommand =
      process.platform === 'linux'
        ? ['setsid', '--ctty', ...commands.interactive]
        : commands.interactive;
    const interactiveProcess = Processes.Class.spawn(interactiveCommand, {
      stdin: openPty.slaveFileDescriptor,
      stdout: openPty.slaveFileDescriptor,
      stderr: openPty.slaveFileDescriptor,
    });
    this.interactiveProcess = interactiveProcess;
    openPty.releaseSlaveFileDescriptor();

    const paste = new BracketedPathPaste.Class(
      (bytes) => openPty.write(bytes),
      async (path) =>
        ChannelDropNotification.Class.encode(
          (await channelClient.upload(path)).path,
        ),
    );
    let inputChain = Promise.resolve();
    const onInput = (bytes: Buffer): void => {
      inputChain = inputChain.then(() => paste.push(new Uint8Array(bytes)));
      void inputChain.catch((error) => {
        process.stderr.write(`iv ssh upload failed: ${String(error)}\n`);
        interactiveProcess.kill();
      });
    };
    const onResize = (): void => {
      openPty.resize(process.stdout.columns ?? 80, process.stdout.rows ?? 24);
      interactiveProcess.kill('SIGWINCH');
    };
    this.previousRawMode = process.stdin.isRaw ?? false;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onInput);
    process.on('SIGWINCH', onResize);
    try {
      const exitCode = await interactiveProcess.exited;
      await inputChain;
      paste.flush();
      return exitCode;
    } finally {
      process.stdin.off('data', onInput);
      process.off('SIGWINCH', onResize);
      process.stdin.setRawMode(this.previousRawMode);
      openPty.close();
      channelProcess.kill();
      await channelRead.catch(() => undefined);
    }
  }

  protected async readChannel(
    stream: ReadableStream<Uint8Array>,
    client: ChannelClient.Model,
  ): Promise<void> {
    try {
      for await (const bytes of stream) client.receive(bytes);
      client.close(new Error('Remote channel closed'));
    } catch (error) {
      client.close(error);
      throw error;
    }
  }

  protected async stop(closeCommand: string[]): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.interactiveProcess?.kill();
    this.channelProcess?.kill();
    this.openPty?.close();
    if (this.controlDirectory) {
      await Processes.Class.run(closeCommand);
      rmSync(this.controlDirectory, { recursive: true, force: true });
    }
  }
}

export namespace SshClient {
  export const $Class = Static($SshClient);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface SshClientArguments {
  sshArguments: string[];
  remoteArguments: string[];
}

export interface SshCommands {
  master: string[];
  channel: string[];
  interactive: string[];
  close: string[];
}
