import { Static } from 'ivue/extras';
import { randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readdir, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

class $Dropzone {
  static get defaultMaximumByteCount(): number {
    return 1024 * 1024 * 1024;
  }

  static get defaultMaximumAgeMilliseconds(): number {
    return 24 * 60 * 60 * 1000;
  }

  static async store(
    name: string,
    declaredByteCount: number,
    chunks: AsyncIterable<Uint8Array>,
    options: DropzoneOptions = {},
  ): Promise<DropzoneStoredFile> {
    const directory =
      options.directory ?? join(homedir(), '.cache', 'invar', 'dropzone');
    const maximumByteCount =
      options.maximumByteCount ?? this.defaultMaximumByteCount;
    if (declaredByteCount < 0 || declaredByteCount > maximumByteCount) {
      throw this.error(
        'SIZE_LIMIT',
        `Upload size ${declaredByteCount} exceeds the dropzone cap`,
      );
    }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await this.clean(
      directory,
      maximumByteCount,
      options.maximumAgeMilliseconds,
    );
    const temporaryPath = join(directory, `.upload-${randomUUID()}`);
    const writer = Bun.file(temporaryPath).writer();
    const hasher = new Bun.CryptoHasher('sha256');
    let observedByteCount = 0;
    try {
      for await (const chunk of chunks) {
        observedByteCount += chunk.length;
        if (
          observedByteCount > declaredByteCount ||
          observedByteCount > maximumByteCount
        ) {
          throw this.error(
            'SIZE_LIMIT',
            'Upload sent more bytes than declared',
          );
        }
        hasher.update(chunk);
        writer.write(chunk);
      }
      await writer.end();
      if (observedByteCount !== declaredByteCount) {
        throw this.error(
          'STREAM_MISMATCH',
          `Upload declared ${declaredByteCount} bytes but sent ${observedByteCount}`,
        );
      }
      const sha256 = hasher.digest('hex');
      const safeName = this.safeName(name);
      const finalPath = join(directory, `${sha256}-${safeName}`);
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, finalPath);
      await this.clean(
        directory,
        maximumByteCount,
        options.maximumAgeMilliseconds,
        finalPath,
      );
      return { path: finalPath, size: observedByteCount, sha256 };
    } catch (error) {
      try {
        await writer.end();
      } catch {
        // The writer already failed or closed.
      }
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  static async clean(
    directory: string,
    maximumByteCount = this.defaultMaximumByteCount,
    maximumAgeMilliseconds = this.defaultMaximumAgeMilliseconds,
    protectedPath?: string,
  ): Promise<void> {
    const now = Date.now();
    const entries: Array<{ path: string; size: number; modified: number }> = [];
    let protectedByteCount = 0;
    for (const name of await readdir(directory).catch(() => [] as string[])) {
      const path = join(directory, name);
      if (name.startsWith('.upload-')) continue;
      const status = await lstat(path).catch(() => null);
      if (!status?.isFile()) continue;
      if (path === protectedPath) {
        protectedByteCount = status.size;
        continue;
      }
      if (now - status.mtimeMs > maximumAgeMilliseconds) {
        await unlink(path).catch(() => undefined);
        continue;
      }
      entries.push({ path, size: status.size, modified: status.mtimeMs });
    }
    entries.sort((left, right) => left.modified - right.modified);
    let totalByteCount =
      protectedByteCount +
      entries.reduce((total, entry) => total + entry.size, 0);
    for (const entry of entries) {
      if (totalByteCount <= maximumByteCount) break;
      await unlink(entry.path).catch(() => undefined);
      totalByteCount -= entry.size;
    }
  }

  protected static safeName(name: string): string {
    const leafName = basename(name).replaceAll(/[^A-Za-z0-9._-]/g, '_');
    return leafName.length > 0 ? leafName.slice(0, 160) : 'drop';
  }

  protected static error(
    code: string,
    message: string,
  ): Error & { code: string } {
    return Object.assign(new Error(message), { code });
  }
}

export namespace Dropzone {
  export const $Class = Static($Dropzone);
  export let Class = $Class;
}

export interface DropzoneStoredFile {
  path: string;
  size: number;
  sha256: string;
}

export interface DropzoneOptions {
  directory?: string;
  maximumByteCount?: number;
  maximumAgeMilliseconds?: number;
}
