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
    const frontmatterLines = lines.slice(1, closingDelimiterIndex);
    for (let lineIndex = 0; lineIndex < frontmatterLines.length; lineIndex++) {
      const match = /^description:\s*(.*)$/.exec(
        frontmatterLines[lineIndex] ?? '',
      );
      if (!match) continue;
      const scalarHeader = (match[1] ?? '').trim();
      const blockHeader = /^([>|])((?:[1-9][+-]?)|(?:[+-][1-9]?)|)$/.exec(
        scalarHeader,
      );
      if (!blockHeader) return this.quotedDescription(scalarHeader);
      return this.blockDescription(
        frontmatterLines,
        lineIndex + 1,
        blockHeader[1] as '>' | '|',
        blockHeader[2] ?? '',
      );
    }
    return '';
  }

  protected static quotedDescription(scalar: string): string {
    if (scalar.startsWith("'")) return this.singleQuotedDescription(scalar);
    if (!scalar.startsWith('"')) return scalar;
    try {
      return JSON.parse(scalar) as string;
    } catch {
      return scalar;
    }
  }

  protected static singleQuotedDescription(scalar: string): string {
    if (!scalar.endsWith("'") || scalar.length < 2) return scalar;
    return scalar.slice(1, -1).replace(/''/g, "'");
  }

  protected static blockDescription(
    frontmatterLines: readonly string[],
    firstContentLineIndex: number,
    style: '>' | '|',
    modifiers: string,
  ): string {
    const explicitIndentation = /[1-9]/.exec(modifiers);
    let contentIndentation = explicitIndentation
      ? Number(explicitIndentation[0])
      : 0;
    const contentLines: string[] = [];
    for (
      let lineIndex = firstContentLineIndex;
      lineIndex < frontmatterLines.length;
      lineIndex++
    ) {
      const line = frontmatterLines[lineIndex] ?? '';
      const leadingSpaces = /^ */.exec(line)?.[0].length ?? 0;
      if (line.trim().length > 0 && contentIndentation === 0) {
        contentIndentation = leadingSpaces;
      }
      if (
        line.trim().length > 0 &&
        (contentIndentation === 0 || leadingSpaces < contentIndentation)
      ) {
        break;
      }
      contentLines.push(line.slice(Math.min(contentIndentation, line.length)));
    }
    const value =
      style === '|'
        ? this.literalBlockValue(contentLines)
        : this.foldedBlockValue(contentLines);
    return this.applyBlockChomping(value, modifiers);
  }

  protected static literalBlockValue(lines: readonly string[]): string {
    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  }

  protected static foldedBlockValue(lines: readonly string[]): string {
    if (lines.length === 0) return '';
    let value = '';
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex] ?? '';
      value += line;
      if (lineIndex === lines.length - 1) return `${value}\n`;
      const nextLine = lines[lineIndex + 1] ?? '';
      value += line.length === 0 || nextLine.length === 0 ? '\n' : ' ';
    }
    return value;
  }

  protected static applyBlockChomping(
    value: string,
    modifiers: string,
  ): string {
    if (modifiers.includes('-')) return value.replace(/\n+$/u, '');
    if (modifiers.includes('+') || value.length === 0) return value;
    return `${value.replace(/\n+$/u, '')}\n`;
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
  export const $Class = Static($AgentPromptResolver);
  export let Class = $Class;
}

export type AgentPromptSkill = Readonly<{
  name: string;
  description: string;
}>;
