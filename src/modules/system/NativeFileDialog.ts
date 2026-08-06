import { Static } from 'ivue/extras';
import { Environment } from './Environment';
import { Files } from './Files';
import { Processes } from './Processes';

// invariant: External tools share one launch policy (src/modules/system/system.invariants.md)
class $NativeFileDialog {
  static async pickFile(
    startingDirectory: string,
  ): Promise<NativeFileDialogResult> {
    if (Environment.Class.env('INVAR_DISABLE_NATIVE_DIALOG') === '1') {
      return { available: false, path: null };
    }
    const command = this.availableCommand(startingDirectory);
    if (!command) return { available: false, path: null };
    const result = await Processes.Class.run(command);
    if (!result.ok) {
      const errorText = result.stderr.trim();
      const userCancelled = /cancel(?:led|ed)|-128/iu.test(errorText);
      return {
        available: errorText.length === 0 || userCancelled,
        path: null,
      };
    }
    const path = result.stdout.trim();
    if (path.length === 0) return { available: true, path: null };
    if (!Files.Class.exists(path) || Files.Class.isDir(path)) {
      return { available: false, path: null };
    }
    return { available: true, path };
  }

  protected static availableCommand(
    startingDirectory: string,
  ): string[] | null {
    if (Processes.Class.which('zenity')) {
      return [
        'zenity',
        '--file-selection',
        '--title=Open File',
        `--filename=${startingDirectory}/`,
      ];
    }
    if (Processes.Class.which('kdialog')) {
      return ['kdialog', '--getopenfilename', startingDirectory, '*'];
    }
    if (Processes.Class.which('osascript')) {
      return [
        'osascript',
        '-e',
        'POSIX path of (choose file with prompt "Open File")',
      ];
    }
    return null;
  }
}

export namespace NativeFileDialog {
  export const $Class = Static($NativeFileDialog);
  export let Class = $Class;
}

export interface NativeFileDialogResult {
  available: boolean;
  path: string | null;
}
