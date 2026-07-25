import { Static } from 'ivue/extras';

class $TerminalCommandSanitizer {
  protected static get terminalControlSequencePattern(): RegExp {
    return /\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[\u0000-\u007f])/g;
  }

  protected static get controlCharacterPattern(): RegExp {
    return /[\u0000-\u001f\u007f-\u009f]/g;
  }

  static sanitize(command: string): string {
    return command
      .replace(this.terminalControlSequencePattern, '')
      .replace(this.controlCharacterPattern, '');
  }
}

export namespace TerminalCommandSanitizer {
  export const $Class = $TerminalCommandSanitizer;
  export const Class = Static($Class);
}
