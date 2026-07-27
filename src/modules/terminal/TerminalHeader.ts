import { Static } from 'ivue/extras';

class $TerminalHeader {
  static identityAndPath(title: string): TerminalHeaderIdentityAndPath | null {
    const match = /^([^@\s:]+@[^:\s]+):(.*)$/.exec(title.trim());
    if (!match) return null;
    return { identity: match[1]!, path: match[2] || '~' };
  }

  static workingDirectory(
    currentWorkingDirectory: string,
  ): TerminalHeaderWorkingDirectory | null {
    if (!currentWorkingDirectory) return null;
    try {
      const parsed = new URL(currentWorkingDirectory);
      if (parsed.protocol !== 'file:') return null;
      return {
        host: parsed.hostname,
        path: decodeURIComponent(parsed.pathname) || '/',
      };
    } catch {
      return null;
    }
  }
}

export namespace TerminalHeader {
  export const $Class = $TerminalHeader;
  export const Class = Static($Class);
}

export interface TerminalHeaderIdentityAndPath {
  identity: string;
  path: string;
}

export interface TerminalHeaderWorkingDirectory {
  host: string;
  path: string;
}
