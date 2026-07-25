#!/usr/bin/env bun
import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Static } from 'ivue/extras';
import { TerminalRcfile } from '../../src/modules/terminal/TerminalRcfile';
import { PtyTestDriver } from './PtyTestDriver';

class $TerminalObserverFixtureRecorder {
  protected static get fixturePath(): string {
    return join(
      process.cwd(),
      'src',
      'modules',
      'terminal',
      'fixtures',
      'terminal-observer-recorded-bash.base64',
    );
  }

  protected static get workingDirectory(): string {
    return '/tmp/invar-terminal-observer-fixture';
  }

  static async record(): Promise<void> {
    mkdirSync(this.workingDirectory, { recursive: true });
    const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-observer-home-'));
    const rcfile = TerminalRcfile.Class.create('/bin/bash', '#7aa2f7');
    if (!rcfile) throw new Error('Bash terminal rcfile was not created');
    const driver = new PtyTestDriver.Class({
      workspaceRoot: this.workingDirectory,
      repositoryRoot: this.workingDirectory,
      columns: 120,
      rows: 24,
      homeDirectory,
      environment: {
        USER: 'fixture-user',
        HOSTNAME: 'fixture-host',
      },
      command: rcfile.command,
    });
    try {
      await this.awaitOutput(
        driver,
        (output) => output.includes('\x1b]133;A\x07')
          && output.includes('\x1b]133;B\x07'),
      );
      driver.sendRawInputWithoutFrameExpectation(
        "printf 'alpha\\n'; false; (exit 7)\r",
      );
      await this.awaitOutput(
        driver,
        (output) => output.includes('\x1b]133;D;7\x07')
          && output.split('\x1b]133;B\x07').length >= 3,
      );
      await Bun.write(
        this.fixturePath,
        `${Buffer.from(driver.recordedOutput(), 'utf8').toString('base64')}\n`,
      );
      driver.sendRawInputWithoutFrameExpectation('exit\r');
      await driver.exitCode();
      console.log(`recorded ${this.fixturePath}`);
    } finally {
      await driver.dispose();
      rcfile.dispose();
      rmSync(homeDirectory, { recursive: true, force: true });
    }
  }

  protected static async awaitOutput(
    driver: PtyTestDriver.Model,
    predicate: (output: string) => boolean,
  ): Promise<void> {
    const deadline = performance.now() + 5_000;
    while (!predicate(driver.recordedOutput())) {
      if (performance.now() >= deadline) {
        throw new Error(
          `Timed out waiting for Bash output:\n${JSON.stringify(driver.recordedOutput())}`,
        );
      }
      await Bun.sleep(10);
    }
  }
}

export namespace TerminalObserverFixtureRecorder {
  export const $Class = $TerminalObserverFixtureRecorder;
  export const Class = Static($Class);
}

await TerminalObserverFixtureRecorder.Class.record();
