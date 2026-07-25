import { Static } from 'ivue/extras';

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
    command: string,
    charactersPerSecond: number,
    random: () => number = Math.random,
  ): number[] {
    if (command.length === 0) return [];
    const safeCharactersPerSecond = Math.max(1, charactersPerSecond);
    const targetDurationMilliseconds = Math.min(
      this.maximumDurationMilliseconds,
      (command.length / safeCharactersPerSecond) * 1_000,
    );
    const weights = Array.from(command, (character) =>
      this.characterWeight(character, random()),
    );
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    return weights.map((weight) => (weight / totalWeight) * targetDurationMilliseconds);
  }
}

export namespace TerminalCommandTyping {
  export const $Class = $TerminalCommandTyping;
  export const Class = Static($Class);
}
