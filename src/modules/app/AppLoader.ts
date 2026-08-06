// The process shell: everything between "the module graph is loaded" and "the app owns the terminal" —
// argv → BootOptions, the boot call, signal wiring, and the fatal path. A Static capability so the entry
// orchestration is overridable and the fatal path is unit-testable — it was neither while this logic sat
// as bare functions in main.ts, and the one real entry bug (the fatal handler depending on a dynamic
// import that could itself be the failure) lived exactly in that untested residue. The src/main.ts shim
// keeps only what a class cannot own: NODE_ENV set before the module graph loads, and the dynamic import
// that enforces that ordering.
//
// Distinct from Bootstrap by generator: Bootstrap COMPOSES the app (renderer, modules, frame loop);
// AppLoader owns the PROCESS around it (argv, signals, exit, fatal).
// invariant: Construction goes through overridable seams (project.invariants.md)
// invariant: Live static reads follow the receiving class (project.invariants.md)
import { Static } from 'ivue/extras';
import { Bootstrap, type BootedApp } from './Bootstrap';
import { Logging } from '../system/Logging';
import { DefaultPlugins } from '../plugins/DefaultPlugins';
import { IvueStaticGetterCapability } from './IvueStaticGetterCapability';
import { KernelTargets } from '../kernel/KernelTargets';
import { VendorPluginRuntime } from '../vendors/VendorPluginRuntime';
import { VendorPluginInstaller } from '../vendors/VendorPluginInstaller';
import { NetworkAdmission } from '../vendors/NetworkAdmission';
import { Files } from '../system/Files';
import { SshClient } from '../channel/SshClient';
import { ChannelServer } from '../channel/ChannelServer';

class $AppLoader {
  /** Boot the app from process state: argv → options, wire the signal handlers, and route any boot
   *  failure through the fatal path. The whole entry orchestration, swappable and testable. */
  static async main(): Promise<void> {
    try {
      IvueStaticGetterCapability.Class.assertAvailable();
      if (await this.handleChannelCommand()) return;
      if (await this.handlePluginCommand()) return;
      const booted = await this.bootApp();
      this.wireSignals(booted);
    } catch (error) {
      this.handleFatal(error);
    }
  }

  static get SshClient() {
    return SshClient.Class;
  }

  static get ChannelServer() {
    return ChannelServer.Class;
  }

  static async handleChannelCommand(): Promise<boolean> {
    if (process.argv[2] === 'ssh') {
      this.exitProcess(await this.SshClient.main(process.argv.slice(3)));
      return true;
    }
    if (process.argv[2] === '--channel-server') {
      await this.ChannelServer.main();
      return true;
    }
    return false;
  }

  /** Assemble BootOptions from process state and boot — the overridable construction seam (a test
   *  swaps this to inject a scripted boot or a failure). */
  static async bootApp(): Promise<BootedApp> {
    // invariant: External plugin discovery precedes application boot (src/modules/app/app.invariants.md)
    KernelTargets.Class.register();
    const vendorPlugins = await VendorPluginRuntime.Class.load();
    return Bootstrap.Class.boot({
      root: this.rootArgument(),
      plugins: [...DefaultPlugins.Class.create(), ...vendorPlugins],
      createSourceTextViews: () => DefaultPlugins.Class.createSourceTextViews(),
      // Give the renderer a tick to restore the terminal, then exit.
      onQuit: () => setTimeout(() => this.exitProcess(0), 20),
      onRestart: () => this.relaunch(),
    });
  }

  static async handlePluginCommand(): Promise<boolean> {
    if (process.argv[2] !== 'plugin') return false;
    const action = process.argv[3];
    const identity = process.argv[4];
    if (action === 'admit') {
      const privateKeyPath = process.argv[5];
      const sourceRevision = process.argv[6];
      const catalogPath = process.argv[7];
      if (!identity || !privateKeyPath || !sourceRevision || !catalogPath) {
        throw new Error(
          'usage: iv plugin admit artifact private-key source-revision catalog',
        );
      }
      const admission = await NetworkAdmission.Class.admit(
        Files.Class.absolute(identity),
        Files.Class.read(privateKeyPath),
        sourceRevision,
      );
      NetworkAdmission.Class.appendImmutable(catalogPath, admission);
      process.stdout.write(
        `${admission.manifest.vendor}/${admission.manifest.module}@${admission.manifest.version} admitted\n`,
      );
      return true;
    }
    if (action === 'dev-link' && identity) {
      const installed = VendorPluginInstaller.Class.developerLink(identity);
      process.stdout.write(
        `${installed.identity}@${installed.version} linked as UNVERIFIED LOCAL CODE; restart to apply\n`,
      );
      return true;
    }
    if (!action || !identity) {
      throw new Error(
        'usage: iv plugin <install|update|rollback|remove|enable|disable|dev-link> target',
      );
    }
    if (action === 'install' || action === 'update') {
      const installed = VendorPluginInstaller.Class.install(
        identity,
        action === 'install' ? process.argv[5] : undefined,
      );
      process.stdout.write(
        `${installed.identity}@${installed.version} installed; restart to apply\n`,
      );
      return true;
    }
    if (action === 'remove') {
      VendorPluginInstaller.Class.remove(identity);
      process.stdout.write(`${identity} removed; restart to apply\n`);
      return true;
    }
    if (action === 'enable' || action === 'disable') {
      VendorPluginInstaller.Class.setEnabled(identity, action === 'enable');
      process.stdout.write(`${identity} ${action}d; restart to apply\n`);
      return true;
    }
    if (action === 'rollback') {
      const version = process.argv[5];
      if (!version) throw new Error('plugin rollback requires a version');
      const installed = VendorPluginInstaller.Class.rollback(identity, version);
      process.stdout.write(
        `${installed.identity}@${installed.version} selected; restart to apply\n`,
      );
      return true;
    }
    throw new Error(`unknown plugin action: ${action}`);
  }

  static relaunch(): void {
    const environment: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) environment[key] = value;
    }
    process.execve!(process.execPath, process.argv, environment);
  }

  /** The workspace root from argv (`invar <root>`), or undefined for the cwd default. */
  static rootArgument(): string | undefined {
    return ['plugin', 'ssh', '--channel-server'].includes(process.argv[2] ?? '')
      ? undefined
      : process.argv[2];
  }

  /** Keep the process alive; the renderer owns the event loop via stdin. Signals route to the app's
   *  own shutdown so the terminal is restored before exit. */
  static wireSignals(booted: BootedApp): void {
    process.on('SIGINT', () => void booted.shutdown());
    process.on('SIGTERM', () => void booted.shutdown());
  }

  /** Fatal boot failure: stderr FIRST and unconditionally — the message must survive even when the
   *  module graph (and thus file logging) is broken; the file log is best-effort after. */
  static handleFatal(error: unknown): void {
    const detail = String((error as { stack?: unknown })?.stack ?? error);
    process.stderr.write(`fatal: ${detail}\n`);
    try {
      Logging.Class.error(`fatal: ${detail}`);
    } catch {
      /* logging unavailable — stderr already carries the message */
    }
    this.exitProcess(1);
  }

  /** The one exit point — overridable so tests can assert exit codes without dying. */
  static exitProcess(code: number): void {
    process.exit(code);
  }
}

export namespace AppLoader {
  export const $Class = Static($AppLoader);
  export let Class = $Class;
}
