import { Static } from 'ivue/extras';
import { Files } from '../system/Files';

// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
class $TerminalRcfile {
  protected static promptEscape(promptColor: string): string {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(promptColor);
    if (!match) return '\\e[39m';
    return `\\e[38;2;${Number.parseInt(match[1]!, 16)};${Number.parseInt(match[2]!, 16)};${Number.parseInt(match[3]!, 16)}m`;
  }

  static bashContents(promptColor: string): string {
    const promptEscape = this.promptEscape(promptColor);
    return [
      '[[ -r "$HOME/.bashrc" ]] && source "$HOME/.bashrc"',
      '__invar_prompt_user="${USER:-$(id -un)}"',
      '__invar_prompt_host="${HOSTNAME:-$(hostname)}"',
      '__invar_emit_prompt_metadata() {',
      "  printf '\\e]7;file://%s%s\\a\\e]0;%s@%s:%s\\a\\e]133;A\\a' \"$__invar_prompt_host\" \"$PWD\" \"$__invar_prompt_user\" \"$__invar_prompt_host\" \"$PWD\"",
      '}',
      'PROMPT_COMMAND="__invar_emit_prompt_metadata"',
      `PS1='\\[${promptEscape}\\]$ \\[\\e[0m\\]'`,
      '',
    ].join('\n');
  }

  static zshContents(promptColor: string): string {
    const promptEscape = this.promptEscape(promptColor);
    return [
      '[[ -r "$HOME/.zshrc" ]] && source "$HOME/.zshrc"',
      '__invar_prompt_user="${USER:-$(id -un)}"',
      '__invar_prompt_host="${HOST:-$(hostname)}"',
      '__invar_emit_prompt_metadata() {',
      "  printf '\\e]7;file://%s%s\\a\\e]0;%s@%s:%s\\a\\e]133;A\\a' \"$__invar_prompt_host\" \"$PWD\" \"$__invar_prompt_user\" \"$__invar_prompt_host\" \"$PWD\"",
      '}',
      'autoload -Uz add-zsh-hook',
      'add-zsh-hook precmd __invar_emit_prompt_metadata',
      `PROMPT=$'%{${promptEscape}%}$ %{\\e[0m%}'`,
      '',
    ].join('\n');
  }

  static create(shell: string, promptColor: string): TerminalRcfileHandle | null {
    const shellName = Files.Class.basename(shell);
    if (shellName !== 'bash' && shellName !== 'zsh') return null;
    const directory = Files.Class.createTemporaryDirectory('invar-terminal-rc-');
    if (shellName === 'bash') {
      const path = Files.Class.join(directory, 'bashrc');
      Files.Class.write(path, this.bashContents(promptColor));
      return {
        command: [shell, '--rcfile', path, '-i'],
        environment: {},
        dispose: () => Files.Class.removeDirectory(directory),
      };
    }
    Files.Class.write(Files.Class.join(directory, '.zshrc'), this.zshContents(promptColor));
    return {
      command: [shell, '-i'],
      environment: { ZDOTDIR: directory },
      dispose: () => Files.Class.removeDirectory(directory),
    };
  }
}

export namespace TerminalRcfile {
  export const $Class = $TerminalRcfile;
  export const Class = Static($Class);
}

export interface TerminalRcfileHandle {
  command: string[];
  environment: Record<string, string>;
  dispose(): void;
}
