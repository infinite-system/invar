import { Static } from 'ivue/extras';
import { Files } from '../system/Files';

// invariant: Every agent backend session begins from the IBR foundation (src/modules/agent/agent.invariants.md)
// invariant: File access is confined to a single root (src/modules/system/system.invariants.md)

class $AgentIbrFoundation {
  protected static get RELATIVE_PATH(): string {
    return '.claude/skills/ibr/IBR.md';
  }

  static resolve(workspaceRoot: string): AgentIbrFoundationResolution | null {
    const path = Files.Class.confineToRoot(workspaceRoot, this.RELATIVE_PATH);
    if (path === null || !Files.Class.exists(path)) return null;
    try {
      return { path, content: Files.Class.read(path) };
    } catch {
      return null;
    }
  }
}

export namespace AgentIbrFoundation {
  export const $Class = Static($AgentIbrFoundation);
  export const Class = $Class;
}

export type AgentIbrFoundationResolution = Readonly<{
  path: string;
  content: string;
}>;
