import { Static } from 'ivue/extras';

// invariant: Pane chrome and child cells keep separate authority (src/modules/terminal/terminal.invariants.md)
class $TerminalMouse {
  protected static get LEGACY_MAXIMUM_COORDINATE(): number {
    return 223;
  }

  static encode(event: TerminalMouseEvent): string {
    if (event.trackingMode === 'none') return '';
    if (
      event.trackingMode === 'x10' &&
      (event.kind === 'release' || event.kind === 'motion')
    ) {
      return '';
    }
    if (
      event.kind === 'motion' &&
      event.trackingMode !== 'drag' &&
      event.trackingMode !== 'any'
    ) {
      return '';
    }

    const modifiers =
      (event.modifiers.shift ? 4 : 0) +
      (event.modifiers.alt ? 8 : 0) +
      (event.modifiers.ctrl ? 16 : 0);
    const button =
      event.kind === 'wheel'
        ? (event.wheelDirection === 'up' ? 64 : 65) + modifiers
        : event.kind === 'motion'
          ? (event.button ?? 3) + 32 + modifiers
          : event.kind === 'release' && !event.sgrEncoding
            ? 3 + modifiers
            : (event.button ?? 0) + modifiers;
    const column = Math.max(1, Math.floor(event.column));
    const row = Math.max(1, Math.floor(event.row));

    if (event.sgrEncoding) {
      const final = event.kind === 'release' ? 'm' : 'M';
      return `\x1b[<${button};${column};${row}${final}`;
    }
    const maximumCoordinate = this.LEGACY_MAXIMUM_COORDINATE;
    return (
      '\x1b[M' +
      String.fromCharCode(
        button + 32,
        Math.min(maximumCoordinate, column) + 32,
        Math.min(maximumCoordinate, row) + 32,
      )
    );
  }
}

export namespace TerminalMouse {
  export const $Class = Static($TerminalMouse);
  export let Class = $Class;
}

export interface TerminalMouseEvent {
  readonly kind: 'press' | 'release' | 'motion' | 'wheel';
  readonly button?: number;
  readonly wheelDirection?: 'up' | 'down';
  readonly column: number;
  readonly row: number;
  readonly modifiers: {
    readonly alt: boolean;
    readonly shift: boolean;
    readonly ctrl: boolean;
  };
  readonly trackingMode: 'none' | 'x10' | 'vt200' | 'drag' | 'any';
  readonly sgrEncoding: boolean;
}
