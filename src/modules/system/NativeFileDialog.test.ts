import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeFileDialog } from './NativeFileDialog';
import { Processes } from './Processes';

const originalProcessesClass = Processes.Class;
const originalDisableValue = process.env.INVAR_DISABLE_NATIVE_DIALOG;
const originalDisplayValue = process.env.DISPLAY;
const originalWaylandDisplayValue = process.env.WAYLAND_DISPLAY;

afterEach(() => {
  Processes.Class = originalProcessesClass;
  if (originalDisableValue === undefined) {
    delete process.env.INVAR_DISABLE_NATIVE_DIALOG;
  } else {
    process.env.INVAR_DISABLE_NATIVE_DIALOG = originalDisableValue;
  }
  if (originalDisplayValue === undefined) delete process.env.DISPLAY;
  else process.env.DISPLAY = originalDisplayValue;
  if (originalWaylandDisplayValue === undefined)
    delete process.env.WAYLAND_DISPLAY;
  else process.env.WAYLAND_DISPLAY = originalWaylandDisplayValue;
});

test('native picker probes through Processes and launches the first available dialog', async () => {
  process.env.DISPLAY = ':0';
  const directory = mkdtempSync(join(tmpdir(), 'invar-native-dialog-'));
  const pickedPath = join(directory, 'file.ts');
  writeFileSync(pickedPath, 'picked');
  const launchedArguments: string[][] = [];
  class RecordingProcesses extends Processes.$Class {
    static override which(command: string): string | null {
      return command === 'zenity' ? '/stub/zenity' : null;
    }

    static override async run(argumentVector: string[]) {
      launchedArguments.push(argumentVector);
      return { code: 0, stdout: `${pickedPath}\n`, stderr: '', ok: true };
    }
  }
  Processes.Class = RecordingProcesses;

  try {
    await expect(
      NativeFileDialog.Class.pickFile('/workspace'),
    ).resolves.toEqual({ available: true, path: pickedPath });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  expect(launchedArguments).toEqual([
    [
      'zenity',
      '--file-selection',
      '--title=Open File',
      '--filename=/workspace/',
    ],
  ]);
});

test('native picker distinguishes unavailable tools from a cancelled dialog', async () => {
  process.env.DISPLAY = ':0';
  class UnavailableProcesses extends Processes.$Class {
    static override which(): string | null {
      return null;
    }
  }
  Processes.Class = UnavailableProcesses;
  await expect(NativeFileDialog.Class.pickFile('/workspace')).resolves.toEqual({
    available: false,
    path: null,
  });

  class CancelledProcesses extends Processes.$Class {
    static override which(command: string): string | null {
      return command === 'kdialog' ? '/stub/kdialog' : null;
    }

    static override async run() {
      return { code: 1, stdout: '', stderr: '', ok: false };
    }
  }
  Processes.Class = CancelledProcesses;
  await expect(NativeFileDialog.Class.pickFile('/workspace')).resolves.toEqual({
    available: true,
    path: null,
  });

  class BrokenProcesses extends Processes.$Class {
    static override which(command: string): string | null {
      return command === 'zenity' ? '/stub/zenity' : null;
    }

    static override async run() {
      return {
        code: 1,
        stdout: '',
        stderr: 'cannot open display',
        ok: false,
      };
    }
  }
  Processes.Class = BrokenProcesses;
  await expect(NativeFileDialog.Class.pickFile('/workspace')).resolves.toEqual({
    available: false,
    path: null,
  });
});

test('a Linux dialog binary without a graphical session falls through to the in-app picker', async () => {
  delete process.env.DISPLAY;
  delete process.env.WAYLAND_DISPLAY;
  let launchCount = 0;
  class HeadlessProcesses extends Processes.$Class {
    static override which(command: string): string | null {
      return command === 'zenity' || command === 'kdialog'
        ? `/stub/${command}`
        : null;
    }

    static override async run() {
      launchCount += 1;
      return { code: 0, stdout: '', stderr: '', ok: true };
    }
  }
  Processes.Class = HeadlessProcesses;

  await expect(NativeFileDialog.Class.pickFile('/workspace')).resolves.toEqual({
    available: false,
    path: null,
  });
  expect(launchCount).toBe(0);
});
