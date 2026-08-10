import { Static } from 'ivue/extras';
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';

class $ChannelDropNotification {
  protected static get PREFIX(): string {
    return 'invar-drop:v1:';
  }

  static encode(path: string): string {
    return `${this.PREFIX}${Buffer.from(path).toString('base64url')}`;
  }

  static decode(text: string): string[] | null {
    const tokens = text
      .trim()
      .split(/\s+/u)
      .map((token) =>
        token.startsWith("'") && token.endsWith("'")
          ? token.slice(1, -1)
          : token,
      );
    if (
      tokens.length === 0 ||
      tokens.some((token) => !token.startsWith(this.PREFIX))
    ) {
      return null;
    }
    const paths: string[] = [];
    for (const token of tokens) {
      let path: string;
      try {
        path = Buffer.from(
          token.slice(this.PREFIX.length),
          'base64url',
        ).toString();
      } catch {
        return null;
      }
      if (!this.isDropzoneFile(path)) return null;
      paths.push(path);
    }
    return paths;
  }

  protected static isDropzoneFile(path: string): boolean {
    const directory = resolve(
      process.env.INVAR_DROPZONE_DIRECTORY ??
        join(homedir(), '.cache', 'invar', 'dropzone'),
    );
    const leafName = basename(path);
    if (!/^[a-f0-9]{64}-.+/u.test(leafName) || !existsSync(path)) return false;
    try {
      // Compare resolved against resolved: the candidate path is realpath'd, so the dropzone base
      // must be too, or a symlinked base rejects every legitimate file (macOS /var -> /private/var
      // made this containment check false for ALL dropzone files; Linux /tmp is real, hiding it).
      const realPath = realpathSync(path);
      const realDirectory = realpathSync(directory);
      return realPath.startsWith(realDirectory + sep);
    } catch {
      return false;
    }
  }
}

export namespace ChannelDropNotification {
  export const $Class = Static($ChannelDropNotification);
  export let Class = $Class;
}
