import { Static } from 'ivue/extras';
import type { GlyphLevel, ColorDepth } from '../theme/TerminalCapabilities';
import { ThemeIcons } from '../theme/ThemeIcons';
import type { AgentStatus } from './AgentEvents.interface';

// invariant: Terminal color and glyph support varies (project.invariants.md)
// invariant: Appearance is data with a capability fallback (project.invariants.md)

class $AgentSpinnerFrames {
  protected static get shimmerWavelength(): number {
    return 6;
  }

  protected static get shimmerPhasePerFrame(): number {
    return 0.55;
  }

  static glyphFor(frameIndex: number, glyphLevel: GlyphLevel): string {
    const frames =
      ThemeIcons.Class.agentTranscriptIconsFor(glyphLevel).spinnerFrames;
    const normalizedFrameIndex =
      ((frameIndex % frames.length) + frames.length) % frames.length;
    return frames[normalizedFrameIndex] ?? frames[0]!;
  }

  static labelFor(
    status: AgentStatus,
    runningToolName: string | null,
    glyphLevel: GlyphLevel,
  ): string {
    const ellipsis =
      ThemeIcons.Class.agentTranscriptIconsFor(glyphLevel).ellipsis;
    if (status === 'awaiting-tool')
      return runningToolName
        ? `Running ${runningToolName}${ellipsis}`
        : `Running${ellipsis}`;
    return `Thinking${ellipsis}`;
  }

  static formatElapsed(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder.toString().padStart(2, '0')}s`;
  }

  protected static parseHex(hex: string): [number, number, number] | null {
    const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
    if (!match) return null;
    const value = parseInt(match[1]!, 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  }

  protected static toHex(
    [red, green, blue]: [number, number, number],
  ): string {
    const clamp = (channel: number) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, '0');
    return `#${clamp(red)}${clamp(green)}${clamp(blue)}`;
  }

  static shimmerColors(
    length: number,
    frameIndex: number,
    colorDepth: ColorDepth,
    baseColor: string,
    highlightColor: string,
  ): string[] {
    const base = this.parseHex(baseColor);
    const highlight = this.parseHex(highlightColor);
    const phase = frameIndex * this.shimmerPhasePerFrame;
    const colors: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const interpolation =
        0.5 +
        0.5 *
          Math.cos(
            ((index - phase) * (2 * Math.PI)) / this.shimmerWavelength,
          );
      if (colorDepth === 'truecolor' && base && highlight) {
        colors.push(
          this.toHex([
            base[0] + (highlight[0] - base[0]) * interpolation,
            base[1] + (highlight[1] - base[1]) * interpolation,
            base[2] + (highlight[2] - base[2]) * interpolation,
          ]),
        );
      } else {
        colors.push(interpolation > 0.6 ? highlightColor : baseColor);
      }
    }
    return colors;
  }
}

export namespace AgentSpinnerFrames {
  export const $Class = $AgentSpinnerFrames;
  export const Class = Static($AgentSpinnerFrames);
}
