import { Static } from 'ivue/extras';
import { Files } from '../system/Files';

// invariant: Every agent backend session begins from the IBR foundation (src/modules/agent/agent.invariants.md)
// invariant: File access is confined to a single root (src/modules/system/system.invariants.md)

class $AgentIbrFoundation {
  protected static get relativePath(): string {
    return '.claude/skills/ibr/IBR.md';
  }

  static resolve(workspaceRoot: string): AgentIbrFoundationResolution | null {
    const path = Files.Class.confineToRoot(workspaceRoot, this.relativePath);
    if (path === null || !Files.Class.exists(path)) return null;
    try {
      return { path, content: Files.Class.read(path) };
    } catch {
      return null;
    }
  }
}

export namespace AgentIbrFoundation {
  export const $Class = $AgentIbrFoundation;
  export const Class = Static($Class);
}

export type AgentIbrFoundationResolution = Readonly<{
  path: string;
  content: string;
}>;
