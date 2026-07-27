import { describe, expect, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import { Static } from 'ivue/extras';
import { TerminalEmulator } from './TerminalEmulator';
import {
  TerminalObserver,
  type TerminalObserverOptions,
} from './TerminalObserver';

class $TerminalObserverTest {
  static {
    test('OSC 133 boundaries produce the exact command completion payload', async () => {
      const { emulator, observer } = this.createObserver({
        now: this.clock(1_000, 5_180),
      });
      try {
        emulator.write(
          this.oscCommandStream(
            'bun test src/modules/terminal',
            ['first', 'last'],
            1,
            'file://fixture-host/home/user/project',
          ),
        );
        await emulator.flush();
        expect(observer.snapshot()).toEqual([
          {
            kind: 'command-completed',
            command: 'bun test src/modules/terminal',
            cwd: '/home/user/project',
            exitCode: 1,
            durationMs: 4_180,
            output: {
              headLines: ['first', 'last'],
              tailLines: [],
              totalLines: 2,
              truncated: false,
              byteCap: 8192,
            },
            boundarySource: 'osc133',
            timestamp: '1970-01-01T00:00:05.180Z',
          },
        ]);
        expect(observer.revision.value).toBe(1);
      } finally {
        observer.dispose();
        emulator.dispose();
      }
    });

    test('prompt-pattern fallback never guesses an exit code', async () => {
      const { emulator, observer } = this.createObserver({
        now: this.clock(10, 35),
      });
      try {
        emulator.write('$ echo heuristic\r\nfallback output\r\n$ ');
        await emulator.flush();
        const event = observer.snapshot()[0]!;
        expect(event.command).toBe('echo heuristic');
        expect(event.output).toEqual({
          headLines: ['fallback output'],
          tailLines: [],
          totalLines: 1,
          truncated: false,
          byteCap: 8192,
        });
        expect(event.boundarySource).toBe('heuristic');
        expect(event.exitCode).toBeNull();
        expect(event.durationMs).toBe(25);
      } finally {
        observer.dispose();
        emulator.dispose();
      }
    });

    describe('redaction happens before buffering', () => {
      const redactionCases: RedactionCase[] = [
        { input: 'Password: hunter2', expected: '[REDACTED]' },
        { input: '[sudo] password for dev: hunter2', expected: '[REDACTED]' },
        {
          input:
            "Enter passphrase for key '/home/dev/.ssh/id_ed25519': hunter2",
          expected: '[REDACTED]',
        },
        { input: 'API_TOKEN=fixture-token', expected: 'API_TOKEN=[REDACTED]' },
        {
          input: "export CLIENT_SECRET='fixture secret'",
          expected: 'export CLIENT_SECRET=[REDACTED]',
        },
        { input: 'SSH_KEY="fixture-key"', expected: 'SSH_KEY=[REDACTED]' },
        { input: 'DB_PASSWORD=hunter2', expected: 'DB_PASSWORD=[REDACTED]' },
        { input: 'NORMAL=value', expected: 'NORMAL=value' },
        { input: 'MONKEY=banana', expected: 'MONKEY=banana' },
        { input: 'TOKEN_COUNT=2', expected: 'TOKEN_COUNT=2' },
        { input: 'KEYBOARD_LAYOUT=us', expected: 'KEYBOARD_LAYOUT=us' },
        { input: 'PASSCODE=value', expected: 'PASSCODE=value' },
      ];
      for (const redactionCase of redactionCases) {
        test(`${redactionCase.input} -> ${redactionCase.expected}`, async () => {
          const { emulator, observer } = this.createObserver({
            now: this.clock(0, 1),
          });
          try {
            emulator.write(
              this.oscCommandStream('printf output', [redactionCase.input], 0),
            );
            await emulator.flush();
            expect(observer.snapshot()[0]!.output.headLines).toEqual([
              redactionCase.expected,
            ]);
          } finally {
            observer.dispose();
            emulator.dispose();
          }
        });
      }
    });

    test('secret-shaped assignments are also masked in the command field', async () => {
      const { emulator, observer } = this.createObserver({
        now: this.clock(0, 1),
      });
      try {
        emulator.write(
          this.oscCommandStream('API_TOKEN=fixture-token bun test', [], 0),
        );
        await emulator.flush();
        expect(observer.snapshot()[0]!.command).toBe(
          'API_TOKEN=[REDACTED] bun test',
        );
        expect(JSON.stringify(observer.snapshot())).not.toContain(
          'fixture-token',
        );
      } finally {
        observer.dispose();
        emulator.dispose();
      }
    });

    test('head and tail summaries declare line truncation', async () => {
      const outputLines = Array.from(
        { length: 50 },
        (_unusedValue, lineIndex) => `line-${lineIndex}`,
      );
      const { emulator, observer } = this.createObserver({
        headLineCount: 2,
        tailLineCount: 2,
        now: this.clock(0, 1),
      });
      try {
        emulator.write(this.oscCommandStream('many-lines', outputLines, 0));
        await emulator.flush();
        expect(observer.snapshot()[0]!.output).toEqual({
          headLines: ['line-0', 'line-1'],
          tailLines: ['line-48', 'line-49'],
          totalLines: 50,
          truncated: true,
          byteCap: 8192,
        });
      } finally {
        observer.dispose();
        emulator.dispose();
      }
    });

    test('wrapped command and output rows remain one logical line', async () => {
      const command = `printf ${'c'.repeat(130)}`;
      const outputLine = `output-${'x'.repeat(130)}`;
      const { emulator, observer } = this.createObserver({
        now: this.clock(0, 1),
      });
      try {
        emulator.write(this.oscCommandStream(command, [outputLine], 0));
        await emulator.flush();
        expect(observer.snapshot()[0]!.command).toBe(command);
        expect(observer.snapshot()[0]!.output.headLines).toEqual([outputLine]);
        expect(observer.snapshot()[0]!.output.totalLines).toBe(1);
      } finally {
        observer.dispose();
        emulator.dispose();
      }
    });

    test('the hard UTF-8 byte cap is declared when it truncates content', async () => {
      const { emulator, observer } = this.createObserver({
        outputByteCap: 12,
        now: this.clock(0, 1),
      });
      try {
        emulator.write(this.oscCommandStream('unicode', ['🦊🦊🦊🦊'], 0));
        await emulator.flush();
        const output = observer.snapshot()[0]!.output;
        const deliveredByteCount = new TextEncoder().encode(
          [...output.headLines, ...output.tailLines].join(''),
        ).length;
        expect(deliveredByteCount).toBeLessThanOrEqual(12);
        expect(output.totalLines).toBe(1);
        expect(output.truncated).toBe(true);
        expect(output.byteCap).toBe(12);
      } finally {
        observer.dispose();
        emulator.dispose();
      }
    });

    test('the ring buffer evicts the oldest event by count', async () => {
      const clock = this.incrementingClock();
      const { emulator, observer } = this.createObserver({
        maximumEventCount: 3,
        now: clock,
      });
      try {
        for (let commandIndex = 1; commandIndex <= 4; commandIndex += 1) {
          emulator.write(
            this.oscCommandStream(`command-${commandIndex}`, [], 0),
          );
          await emulator.flush();
        }
        expect(observer.snapshot().map((event) => event.command)).toEqual([
          'command-2',
          'command-3',
          'command-4',
        ]);
        expect(observer.eventCount).toBe(3);
        expect(observer.revision.value).toBe(4);
      } finally {
        observer.dispose();
        emulator.dispose();
      }
    });

    test('the ring buffer evicts oldest events before exceeding its byte bound', async () => {
      const { emulator, observer } = this.createObserver({
        maximumBufferBytes: 900,
        now: this.incrementingClock(),
      });
      try {
        for (let commandIndex = 1; commandIndex <= 8; commandIndex += 1) {
          emulator.write(
            this.oscCommandStream(
              `command-${commandIndex}`,
              [`output-${commandIndex}-${'x'.repeat(80)}`],
              0,
            ),
          );
          await emulator.flush();
        }
        expect(observer.bufferedByteCount).toBeLessThanOrEqual(900);
        expect(observer.eventCount).toBeLessThan(8);
        expect(observer.snapshot().at(-1)!.command).toBe('command-8');
      } finally {
        observer.dispose();
        emulator.dispose();
      }
    });

    test('the recorded shim shell stream is consumed process-free', async () => {
      const inputBase64 = await Bun.file(
        new URL(
          './fixtures/terminal-observer-recorded-bash.base64',
          import.meta.url,
        ),
      ).text();
      const { emulator, observer } = this.createObserver({
        now: this.clock(100, 350),
      });
      try {
        emulator.write(
          new Uint8Array(Buffer.from(inputBase64.trim(), 'base64')),
        );
        await emulator.flush();
        const event = observer.snapshot()[0]!;
        expect(event.boundarySource).toBe('osc133');
        expect(event.exitCode).toBe(7);
        expect(event.cwd).toBe('/tmp/invar-terminal-observer-fixture');
        expect(event.command).toBe("printf 'alpha\\n'; false; (exit 7)");
        expect(event.output.headLines).toEqual(['alpha']);
      } finally {
        observer.dispose();
        emulator.dispose();
      }
    });

    test('the observer seam exposes no backend or PTY write capability', async () => {
      const source = await Bun.file(
        new URL('./TerminalObserver.ts', import.meta.url),
      ).text();
      expect(source).not.toContain('TerminalBackend');
      expect(source).not.toContain('.write(');
    });
  }

  protected static createObserver(options: TerminalObserverOptions): {
    emulator: TerminalEmulator.Model;
    observer: TerminalObserver.Model;
  } {
    const emulator = new TerminalEmulator.Class(120, 24);
    return {
      emulator,
      observer: new TerminalObserver.Class(emulator, options),
    };
  }

  protected static oscCommandStream(
    command: string,
    outputLines: readonly string[],
    exitCode: number,
    currentWorkingDirectory = 'file://fixture-host/tmp/project',
  ): string {
    const output =
      outputLines.length > 0 ? `${outputLines.join('\r\n')}\r\n` : '';
    return (
      '\x1b]7;' +
      currentWorkingDirectory +
      '\x07' +
      '\x1b]133;A\x07$ \x1b]133;B\x07' +
      command +
      '\r\n\x1b]133;C\x07' +
      output +
      `\x1b]133;D;${exitCode}\x07` +
      '\x1b]133;A\x07$ \x1b]133;B\x07'
    );
  }

  protected static clock(...timestamps: number[]): () => number {
    let timestampIndex = 0;
    return () => timestamps[timestampIndex++] ?? timestamps.at(-1) ?? 0;
  }

  protected static incrementingClock(): () => number {
    let timestamp = 0;
    return () => {
      timestamp += 1;
      return timestamp;
    };
  }
}

export namespace TerminalObserverTest {
  export const $Class = $TerminalObserverTest;
  export let Class = Static($Class);
}

interface RedactionCase {
  input: string;
  expected: string;
}
