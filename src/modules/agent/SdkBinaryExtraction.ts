import {
  lstatSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { Static } from 'ivue/extras';

// invariant: SDK extraction cleanup stays bounded (src/modules/agent/agent.invariants.md)

class $SdkBinaryExtraction {
  protected static get staleAgeMilliseconds(): number {
    return 60 * 60 * 1000;
  }

  protected static get EXTRACTION_DIRECTORY_PATTERN(): RegExp {
    return /^\.[0-9a-f]+-[0-9a-f]+\.claude-agent-sdk(?:-[a-z0-9_-]+)*$/i;
  }

  static reapStaleSiblings(
    options: SdkBinaryExtractionReapOptions = {},
  ): SdkBinaryExtractionReapResult {
    const temporaryDirectory = resolve(options.temporaryDirectory ?? tmpdir());
    const processDirectory = resolve(options.processDirectory ?? '/proc');
    const nowMilliseconds = options.nowMilliseconds ?? Date.now();
    const minimumAgeMilliseconds =
      options.minimumAgeMilliseconds ?? this.staleAgeMilliseconds;
    const result: SdkBinaryExtractionReapResult = {
      removedDirectories: [],
      retainedLiveDirectories: [],
      retainedYoungDirectories: [],
      failedDirectories: [],
      processScanFailed: false,
    };
    const liveProcessPaths = this.liveProcessPaths(processDirectory);
    if (liveProcessPaths === null) {
      result.processScanFailed = true;
      return result;
    }

    let directoryEntries;
    try {
      directoryEntries = readdirSync(temporaryDirectory, {
        withFileTypes: true,
      });
    } catch {
      result.failedDirectories.push(temporaryDirectory);
      return result;
    }

    for (const directoryEntry of directoryEntries) {
      if (
        !directoryEntry.isDirectory() ||
        !this.EXTRACTION_DIRECTORY_PATTERN.test(directoryEntry.name)
      ) {
        continue;
      }
      const extractionDirectory = resolve(
        join(temporaryDirectory, directoryEntry.name),
      );
      if (dirname(extractionDirectory) !== temporaryDirectory) continue;

      let directoryAgeMilliseconds: number;
      try {
        directoryAgeMilliseconds =
          nowMilliseconds - lstatSync(extractionDirectory).mtimeMs;
      } catch {
        result.failedDirectories.push(extractionDirectory);
        continue;
      }
      if (directoryAgeMilliseconds < minimumAgeMilliseconds) {
        result.retainedYoungDirectories.push(extractionDirectory);
        continue;
      }
      if (
        liveProcessPaths.some(
          (executablePath) =>
            executablePath === extractionDirectory ||
            executablePath.startsWith(`${extractionDirectory}${sep}`),
        )
      ) {
        result.retainedLiveDirectories.push(extractionDirectory);
        continue;
      }

      try {
        (options.removeDirectory ?? this.removeDirectory)(extractionDirectory);
        result.removedDirectories.push(extractionDirectory);
      } catch {
        result.failedDirectories.push(extractionDirectory);
      }
    }
    result.removedDirectories.sort();
    result.retainedLiveDirectories.sort();
    result.retainedYoungDirectories.sort();
    result.failedDirectories.sort();
    return result;
  }

  protected static liveProcessPaths(processDirectory: string): string[] | null {
    const currentUserIdentifier = process.getuid?.();
    if (currentUserIdentifier === undefined) return null;
    let processEntries;
    try {
      processEntries = readdirSync(processDirectory, { withFileTypes: true });
    } catch {
      return null;
    }

    const processPaths: string[] = [];
    for (const processEntry of processEntries) {
      if (!processEntry.isDirectory() || !/^[0-9]+$/.test(processEntry.name)) {
        continue;
      }
      try {
        if (
          statSync(join(processDirectory, processEntry.name)).uid !==
          currentUserIdentifier
        ) {
          continue;
        }
        const executablePath = readlinkSync(
          join(processDirectory, processEntry.name, 'exe'),
        ).replace(/ \(deleted\)$/, '');
        processPaths.push(resolve(executablePath));
      } catch (error) {
        const errorCode = (error as NodeJS.ErrnoException).code;
        if (errorCode === 'ENOENT') continue;
        try {
          const commandArguments = readFileSync(
            join(processDirectory, processEntry.name, 'cmdline'),
            'utf8',
          ).split('\0');
          for (const commandArgument of commandArguments) {
            if (isAbsolute(commandArgument)) {
              processPaths.push(resolve(commandArgument));
            }
          }
        } catch {
          return null;
        }
      }
    }
    return processPaths;
  }

  protected static removeDirectory(directoryPath: string): void {
    rmSync(directoryPath, { recursive: true });
  }
}

export namespace SdkBinaryExtraction {
  export const $Class = Static($SdkBinaryExtraction);
  export let Class = $Class;
}

export interface SdkBinaryExtractionReapOptions {
  temporaryDirectory?: string;
  processDirectory?: string;
  nowMilliseconds?: number;
  minimumAgeMilliseconds?: number;
  removeDirectory?: (directoryPath: string) => void;
}

export interface SdkBinaryExtractionReapResult {
  removedDirectories: string[];
  retainedLiveDirectories: string[];
  retainedYoungDirectories: string[];
  failedDirectories: string[];
  processScanFailed: boolean;
}
