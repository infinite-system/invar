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
  }
}

export namespace TerminalEmulatorTest {
  export const $Class = $TerminalEmulatorTest;
  export const Class = Static($Class);
}
