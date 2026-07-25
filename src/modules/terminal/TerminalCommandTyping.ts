import { Static } from 'ivue/extras';
import { TextSegmentation } from '../system/TextSegmentation';

class $TerminalCommandTyping {
  protected static get maximumDurationMilliseconds(): number {
    return 1_500;
  }

  protected static characterWeight(character: string, randomValue: number): number {
    const jitterWeight = 0.75 + Math.max(0, Math.min(1, randomValue)) * 0.5;
    if (/\s/.test(character)) return jitterWeight * 1.25;
    if (/[.,;:!?]/.test(character)) return jitterWeight * 1.55;
    return jitterWeight;
  }

  static delays(
    graphemes: readonly string[],
    charactersPerSecond: number,
    random: () => number = Math.random,
  ): number[] {
    if (graphemes.length === 0) return [];
    const safeCharactersPerSecond = Math.max(1, charactersPerSecond);
    const targetDurationMilliseconds = Math.min(
      this.maximumDurationMilliseconds,
      (graphemes.length / safeCharactersPerSecond) * 1_000,
    );
    const weights = graphemes.map((grapheme) =>
      this.characterWeight(grapheme, random()),
    );
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    return weights.map((weight) => (weight / totalWeight) * targetDurationMilliseconds);
  }

  static plan(
    command: string,
    charactersPerSecond: number,
    random: () => number = Math.random,
  ): TerminalCommandTypingPlan {
    const graphemes = TextSegmentation.Class.graphemes(command);
    return {
      graphemes,
      delays: this.delays(graphemes, charactersPerSecond, random),
    };
  }
}

export interface TerminalCommandTypingPlan {
  readonly graphemes: readonly string[];
  readonly delays: readonly number[];
}

export namespace TerminalCommandTyping {
  export const $Class = $TerminalCommandTyping;
  export const Class = Static($Class);
}
