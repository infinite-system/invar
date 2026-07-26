import { Static } from 'ivue/extras';
import { Files } from '../system/Files';

// invariant: Agent instructions match the workspace (src/modules/agent/agent.invariants.md)
// invariant: File access is confined to a single root (src/modules/system/system.invariants.md)

class $AgentPromptResolver {
  static skills(workspaceRoot: string): readonly AgentPromptSkill[] {
    const skillRoot = Files.Class.confineToRoot(
      workspaceRoot,
      '.claude/skills',
    );
    if (skillRoot === null) return [];
    const skills: AgentPromptSkill[] = [];
    for (const entry of Files.Class.list(skillRoot)) {
      if (!entry.isDir || !/^[A-Za-z0-9_-]+$/.test(entry.name)) continue;
      const skillPath = Files.Class.confineToRoot(
        skillRoot,
        `${entry.name}/SKILL.md`,
      );
      if (skillPath === null || !Files.Class.exists(skillPath)) continue;
      try {
        skills.push({
          name: entry.name,
          description: this.frontmatterDescription(Files.Class.read(skillPath)),
        });
      } catch {
        continue;
      }
    }
    return skills.sort((first, second) =>
      first.name.localeCompare(second.name),
    );
  }

  static resolve(workspaceRoot: string, prompt: string): string {
    const invocation = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(prompt);
    if (!invocation) return prompt;

    const name = invocation[1]!;
    const argumentsText = invocation[2] ?? '';
    const skillBody = this.readInstruction(
      workspaceRoot,
      '.claude/skills',
      `${name}/SKILL.md`,
    );
    if (skillBody !== null) {
      return this.withArguments(skillBody, argumentsText);
    }

    const commandBody = this.readInstruction(
      workspaceRoot,
      '.claude/commands',
      `${name}.md`,
    );
    if (commandBody !== null) {
      return this.withArguments(commandBody, argumentsText);
    }

    return prompt;
  }

  protected static readInstruction(
    workspaceRoot: string,
    instructionRootPath: string,
    instructionPath: string,
  ): string | null {
    const instructionRoot = Files.Class.confineToRoot(
      workspaceRoot,
      instructionRootPath,
    );
    if (instructionRoot === null) return null;
    const confinedInstructionPath = Files.Class.confineToRoot(
      instructionRoot,
      instructionPath,
    );
    if (
      confinedInstructionPath === null ||
      !Files.Class.exists(confinedInstructionPath)
    ) {
      return null;
    }
    try {
      return this.instructionBody(Files.Class.read(confinedInstructionPath));
    } catch {
      return null;
    }
  }

  protected static instructionBody(instruction: string): string {
    const withoutByteOrderMark = instruction.replace(/^\uFEFF/, '');
    const lines = withoutByteOrderMark.split(/\r?\n/);
    if (lines[0] !== '---') return withoutByteOrderMark.trim();
    const closingDelimiterIndex = lines.indexOf('---', 1);
    if (closingDelimiterIndex < 0) return withoutByteOrderMark.trim();
    return lines
      .slice(closingDelimiterIndex + 1)
      .join('\n')
      .trim();
  }

  protected static frontmatterDescription(instruction: string): string {
    const lines = instruction.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines[0] !== '---') return '';
    const closingDelimiterIndex = lines.indexOf('---', 1);
    if (closingDelimiterIndex < 0) return '';
    for (const line of lines.slice(1, closingDelimiterIndex)) {
      const match = /^description:\s*(.*)$/.exec(line);
      if (match) return (match[1] ?? '').trim();
    }
    return '';
  }

  protected static withArguments(
    instructionBody: string,
    argumentsText: string,
  ): string {
    return argumentsText
      ? `${instructionBody}\n\n${argumentsText}`
      : instructionBody;
  }
}

export namespace AgentPromptResolver {
  export const $Class = $AgentPromptResolver;
  export const Class = Static($Class);
}

export type AgentPromptSkill = Readonly<{
  name: string;
  description: string;
}>;
