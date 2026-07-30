import { expect, test } from 'bun:test';
import { Static } from 'ivue/extras';
import { TerminalEmulator } from './TerminalEmulator';

class $TerminalEmulatorTest {
  static {
    test('parsed stream taps are isolated and independently removable', async () => {
      const emulator = new TerminalEmulator.Class(20, 4);
      const observedMarkers: string[] = [];
      emulator.onShellIntegrationEvent(() => {
        throw new Error('observer failure');
      });
      const stopObservation = emulator.onShellIntegrationEvent((event) => {
        observedMarkers.push(event.marker);
      });
      try {
        emulator.write('\x1b]133;A\x07');
        await emulator.flush();
        stopObservation();
        emulator.write('\x1b]133;B\x07');
        await emulator.flush();
        expect(observedMarkers).toEqual(['A']);
        expect(emulator.lastShellIntegrationEvent?.marker).toBe('B');
      } finally {
        emulator.dispose();
      }
    });

    test('OSC 4 palette overrides and OSC 104 resets remain child-owned', async () => {
      const emulator = new TerminalEmulator.Class(20, 4);
      try {
        emulator.write(
          '\x1b]4;1;rgb:12/34/56;15;#abcdef\x1b\\' +
            '\x1b]4;300;rgb:ff/00/00;2;not-a-color\x1b\\',
        );
        await emulator.flush();
        expect(emulator.paletteOverride(1)).toBe('#123456');
        expect(emulator.paletteOverride(15)).toBe('#abcdef');
        expect(emulator.paletteOverride(2)).toBeNull();
        expect(emulator.paletteOverride(300)).toBeNull();

        emulator.write('\x1b]104;1\x1b\\');
        await emulator.flush();
        expect(emulator.paletteOverride(1)).toBeNull();
        expect(emulator.paletteOverride(15)).toBe('#abcdef');

        emulator.write('\x1b]104\x1b\\');
        await emulator.flush();
        expect(emulator.paletteOverride(15)).toBeNull();
      } finally {
        emulator.dispose();
      }
    });
  }
}

export namespace TerminalEmulatorTest {
  export const $Class = Static($TerminalEmulatorTest);
  export let Class = $Class;
}
