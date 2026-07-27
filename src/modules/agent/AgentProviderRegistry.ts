import { Static } from 'ivue/extras';
import type { AgentProvider } from '../settings/Settings';

// invariant: Seams are drawn at the shared generator (project.invariants.md)

class $AgentProviderRegistry {
  /** The engines actually switchable on this box, in cycle order. INVAR_AGENT_ENGINES forces the list
   *  (the driving smoke proves switch mechanics with the hermetic echo backend). */
  static availableEngines(): ResolvedEngine[] {
    const forced = process.env.INVAR_AGENT_ENGINES;
    if (forced) {
      return forced
        .split(',')
        .map((entry) => entry.trim())
        .filter(
          (entry): entry is ResolvedEngine =>
            entry === 'claude' || entry === 'codex' || entry === 'echo',
        );
    }
    const availableEngines: ResolvedEngine[] = [];
    if (Bun.which('claude')) availableEngines.push('claude');
    if (Bun.which('codex')) availableEngines.push('codex');
    return availableEngines;
  }

  /** Resolve a REQUESTED provider (the setting, or an env force) to the engine that will actually run.
   *  Order of authority: INVAR_AGENT_PROVIDER force → the requested engine when available → auto
   *  preference (claude, then codex) → echo. This is the whole fallback policy, in one place. */
  static resolve(requested: AgentProvider | undefined): ResolvedProvider {
    const forced = process.env.INVAR_AGENT_PROVIDER;
    const wanted: AgentProvider =
      forced === 'claude' || forced === 'codex'
        ? forced
        : (requested ?? 'auto');
    const claudePath = Bun.which('claude');
    const codexPath = Bun.which('codex');
    if (wanted === 'claude' && claudePath)
      return { engine: 'claude', binaryPath: claudePath, fellBack: false };
    if (wanted === 'codex' && codexPath)
      return { engine: 'codex', binaryPath: codexPath, fellBack: false };
    const askedConcrete = wanted === 'claude' || wanted === 'codex';
    if (claudePath)
      return {
        engine: 'claude',
        binaryPath: claudePath,
        fellBack: askedConcrete,
      };
    if (codexPath)
      return {
        engine: 'codex',
        binaryPath: codexPath,
        fellBack: askedConcrete,
      };
    return { engine: 'echo', binaryPath: '', fellBack: askedConcrete };
  }

  /** The human display label for an engine — the ONE mapping the pane title, the transcript's assistant
   *  role rows, and the empty-transcript greeting all read (the mode line shows the raw engine id). */
  static displayLabel(engine: ResolvedEngine | string): string {
    if (engine === 'claude') return 'Claude';
    if (engine === 'codex') return 'Codex';
    if (engine === 'echo') return 'Echo';
    return engine.length > 0
      ? engine.charAt(0).toUpperCase() + engine.slice(1)
      : 'Agent';
  }

  /** The next engine after `current` in the available cycle, or null when there is nothing to switch to. */
  static nextEngine(current: ResolvedEngine): ResolvedEngine | null {
    const availableEngines = this.availableEngines();
    if (availableEngines.length < 2) return null;
    const currentIndex = availableEngines.indexOf(current);
    const nextEngine =
      availableEngines[
        (Math.max(0, currentIndex) + 1) % availableEngines.length
      ];
    return nextEngine && nextEngine !== current ? nextEngine : null;
  }
}

export namespace AgentProviderRegistry {
  export const $Class = Static($AgentProviderRegistry);
  export const Class = $Class;
}

/** A concrete, runnable engine (the echo is the always-available hermetic fallback). */
export type ResolvedEngine = 'claude' | 'codex' | 'echo';

/** The single resolution record every consumer reads. */
export interface ResolvedProvider {
  /** The engine that WILL actually run (post-availability, post-fallback). */
  readonly engine: ResolvedEngine;
  /** The resolved binary path for claude/codex ('' for the echo). */
  readonly binaryPath: string;
  /** True when the resolved engine differs from what the setting asked for (fallback happened). */
  readonly fellBack: boolean;
}
