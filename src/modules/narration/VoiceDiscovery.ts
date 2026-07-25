import { Static } from 'ivue/extras';
import { readdirSync } from 'node:fs';

// Discovers the piper voices installed on this machine so the user can PICK one instead of hand-moving
// `.onnx` files. It scans the conventional voices directory (`$XDG_DATA_HOME/piper-voices`, else
// `~/.local/share/piper-voices`) AND its `library/` subdirectory for `*.onnx` models, so EVERY
// downloaded voice is selectable — not just whichever file currently sits at the top level. Pure
// filesystem probe: no engine, no audio. This is the runtime source for the voice picker's dynamic-enum
// options and for SystemTtsBackend's selected-voice resolution.
//
// invariant: The narration voice is chosen from the discovered set (src/modules/narration/narration.invariants.md)

class $VoiceDiscovery {
  /** The conventional piper voices directory — `$XDG_DATA_HOME/piper-voices`, else
   *  `~/.local/share/…`. */
  static voicesDirectory(): string {
    const dataHomeDirectory =
      process.env.XDG_DATA_HOME ?? `${process.env.HOME ?? ''}/.local/share`;
    return `${dataHomeDirectory}/piper-voices`;
  }

  /** The `*.onnx` models directly in `directory` (never recursive beyond the one level asked for). */
  protected static listOnnx(directory: string): DiscoveredVoice[] {
    try {
      return readdirSync(directory)
        .filter((directoryEntry) => directoryEntry.endsWith('.onnx'))
        .map((directoryEntry) => ({
          name: directoryEntry.slice(0, -'.onnx'.length),
          path: `${directory}/${directoryEntry}`,
        }));
    } catch {
      return []; // directory absent / unreadable → no voices from here
    }
  }

  /** All installed voices: the top-level dir plus its `library/` subdir, deduped by name (top level
   *  wins), sorted by name for a stable picker order. */
  static discover(): DiscoveredVoice[] {
    const voicesDirectory = this.voicesDirectory();
    const discoveredVoices = [
      ...this.listOnnx(voicesDirectory),
      ...this.listOnnx(`${voicesDirectory}/library`),
    ];
    const voicesByName = new Map<string, DiscoveredVoice>();
    for (const voice of discoveredVoices) {
      if (!voicesByName.has(voice.name)) voicesByName.set(voice.name, voice);
    }
    return [...voicesByName.values()].sort((firstVoice, secondVoice) =>
      firstVoice.name.localeCompare(secondVoice.name),
    );
  }

  /** Discovered voice names, sorted. */
  static names(): string[] {
    return this.discover().map((voice) => voice.name);
  }

  /** Picker options: '' (auto — first found) followed by each discovered voice name. */
  static options(): readonly string[] {
    return ['', ...this.names()];
  }

  /** The `.onnx` path for `selected`, or the first-found when `selected` is empty/unknown, or null when
   *  no voice is installed. This is the selected-over-first-found resolution the picker needs. */
  static resolvePath(selectedVoiceName: string): string | null {
    const voices = this.discover();
    if (selectedVoiceName) {
      const selectedVoice = voices.find(
        (voice) => voice.name === selectedVoiceName,
      );
      if (selectedVoice) return selectedVoice.path;
    }
    return voices[0]?.path ?? null;
  }
}

export namespace VoiceDiscovery {
  export const $Class = $VoiceDiscovery;
  export const Class = Static($VoiceDiscovery);
}

/** One installed voice: its selectable NAME (the `.onnx` basename) and the absolute model path. */
export interface DiscoveredVoice {
  readonly name: string;
  readonly path: string;
}
