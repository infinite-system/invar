import { Static } from 'ivue/extras';

class $TerminalCommandSanitizer {
  protected static get TERMINAL_CONTROL_SEQUENCE_PATTERN(): RegExp {
    return /\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[\u0000-\u007f])/g;
  }

  protected static get CONTROL_CHARACTER_PATTERN(): RegExp {
    return /[\u0000-\u001f\u007f-\u009f]/g;
  }

  static sanitize(command: string): string {
    return command
      .replace(this.TERMINAL_CONTROL_SEQUENCE_PATTERN, '')
      .replace(this.CONTROL_CHARACTER_PATTERN, '');
  }
}

export namespace TerminalCommandSanitizer {
  export const $Class = Static($TerminalCommandSanitizer);
  export let Class = $Class;
}
