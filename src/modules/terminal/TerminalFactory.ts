// The construction seam for a live terminal PaneContent: it wires a real OpenPtyBackend to a
// TerminalEmulator inside a TerminalInstance, then wraps that as a TerminalPaneContent. Overridable
// (Static, `super`-capable) so a test or an alternate host can swap the backend — a MockBackend for a
// deterministic pane, or a remote backend later — without the caller knowing which backend it got.
// Bootstrap calls this lazily for the ordinary integrated terminal. A
// folder-open workspace task calls the same factory when its declared process
// must start; the factory itself owns no launch policy.
//
// invariant: Terminal bytes cross exactly one backend seam (src/modules/terminal/terminal.invariants.md)
import { Static } from 'ivue/extras';
import type { TerminalBackend } from './TerminalBackend.interface';
import { OpenPtyBackend } from './OpenPtyBackend';
import { TerminalEmulator } from './TerminalEmulator';
import { TerminalInstance } from './TerminalInstance';
import { TerminalPaneContent } from './TerminalPaneContent';
import type { PaneTaskMetadata } from '../ui/PaneContent.interface';

class $TerminalFactory {
  /** Build the default real backend (openpty + shell). Overridable seam. */
  static createBackend(options: TerminalCreateOptions): TerminalBackend {
    return new OpenPtyBackend.Class(options);
  }

  /** Wire backend + emulator + instance into a ready TerminalPaneContent. */
  static create(
    options: TerminalCreateOptions = {},
  ): TerminalPaneContent.Model {
    // invariant: Each task owns one terminal (src/modules/tasks/tasks.invariants.md)
    const columns = options.columns ?? 80;
    const rows = options.rows ?? 24;
    const backend = this.createBackend(options);
    const emulator = new TerminalEmulator.Class(columns, rows);
    const instance = new TerminalInstance.Class(backend, emulator, {
      typingSpeed: options.typingSpeed,
      reducedMotion: options.reducedMotion,
    });
    return new TerminalPaneContent.Class(instance, {
      identifier: options.identifier,
      label: options.label,
      kind: options.kind,
      heading: options.heading,
      task: options.task,
    });
  }
}

export namespace TerminalFactory {
  export const $Class = Static($TerminalFactory);
  export let Class = $Class;
}

export interface TerminalCreateOptions {
  identifier?: string;
  label?: string;
  columns?: number;
  rows?: number;
  shell?: string;
  cwd?: string;
  command?: string;
  arguments?: readonly string[];
  environment?: Readonly<Record<string, string>>;
  kind?: string;
  heading?: string;
  task?: PaneTaskMetadata;
  cleanPrompt?: boolean;
  promptColor?: string;
  typingSpeed?: () => number;
  reducedMotion?: () => boolean;
}
