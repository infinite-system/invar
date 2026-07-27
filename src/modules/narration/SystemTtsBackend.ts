import { Static } from 'ivue/extras';
import type { TtsBackend } from './TtsBackend.interface';
import { VoiceDiscovery } from './VoiceDiscovery';
import { Processes } from '../system/Processes';

// The real TtsBackend: it auto-detects an installed speech engine and speaks through it, sequentially,
// with barge-in. Same auto-detect+graceful-fallback discipline as the agent providers — it prefers the
// first engine on PATH (espeak-ng, then piper, then macOS `say`) and, on Linux, pipes the synthesized
// WAV into whichever player is present (pw-play or aplay). If NO engine is installed it is a clean
// NO-OP: speak()/stop() do nothing and `available` is false, so narration silently does nothing until an
// engine is installed — never an error, never a crash.
//
// SILENT UNTIL AN ENGINE IS INSTALLED on this box: espeak-ng / piper / say are all absent here (only the
// players aplay + pw-play are present), so this backend reports available=false and utters nothing. One
// line enables real audio:  sudo apt-get install -y espeak-ng
//
// invariant: Narration audio crosses exactly one TTS backend seam (src/modules/narration/narration.invariants.md)
// invariant: A missing speech engine degrades to silence, never an error (src/modules/narration/narration.invariants.md)

class $SystemTtsBackend implements TtsBackend {
  protected static get VoiceDiscovery() {
    return VoiceDiscovery.Class;
  }

  /** The most pending utterances kept while one plays: enough to ride out a burst of short turns,
   *  small enough that narration never runs minutes behind the screen. */
  protected static get MAXIMUM_PENDING_UTTERANCES(): number {
    return 8;
  }

  /** The rate setting is a SPEED MULTIPLIER (higher = faster: 1.0 normal, 2.0 twice as fast, 0.5 half
   *  speed), clamped to a sane band before any engine mapping. */
  protected static clampSpeedMultiplier(rate: number): number {
    return Math.max(0.2, Math.min(rate, 10));
  }

  /** Resolve piper's voice model for the selected voice: an explicit INVAR_PIPER_MODEL wins (tests),
   *  else the discovered voice matching `voice` (or the first-found when `voice` is empty/unknown),
   *  across the voices dir + its `library/` subdir. Returns null when no model is found — a model-less
   *  piper cannot synthesize, so it is skipped. */
  static resolvePiperModel(voice: string): string | null {
    const explicitModelPath = process.env.INVAR_PIPER_MODEL;
    if (explicitModelPath) return explicitModelPath;
    return this.VoiceDiscovery.resolvePath(voice);
  }

  /** piper `--length_scale` from the speed multiplier: length_scale = 1 / rate (piper's scale
   *  stretches duration, so its axis runs the OPPOSITE way — lower = faster). */
  static toLengthScale(rate: number): number {
    return 1 / this.clampSpeedMultiplier(rate);
  }

  /** espeak/`say` words-per-minute from the speed multiplier (≈ 175 × rate), clamped. */
  static toWordsPerMinute(rate: number): number {
    return Math.max(
      50,
      Math.min(Math.round(175 * this.clampSpeedMultiplier(rate)), 500),
    );
  }

  /** Resolve the best available engine, or null. Ordered by QUALITY: piper (neural — far less
   *  robotic) is preferred when its binary AND a voice model are present; espeak-ng (formant synth)
   *  is the always-there fallback; macOS `say` last. espeak/piper emit a WAV on stdout (piped to a
   *  player); `say` plays directly. Detect the ENGINE once, but RESOLVE voice and rate per utterance
   *  from the live providers so settings changes apply without recreating the backend. */
  protected static detectEngine(
    resolveVoice: () => string,
    resolveRate: () => number,
  ): DetectedEngine | null {
    const piperPath = Bun.which('piper');
    const detectedModelPath = piperPath
      ? this.resolvePiperModel(resolveVoice())
      : null;
    if (piperPath && detectedModelPath) {
      return {
        name: 'piper',
        playsDirectly: false,
        // piper reads the utterance on stdin; the queue writes text to stdin below. Voice + rate are
        // read LIVE here (fall back to the model found at detection if the current selection resolves
        // to null).
        synthCommand: () => [
          piperPath,
          '--model',
          this.resolvePiperModel(resolveVoice()) ?? detectedModelPath,
          '--length_scale',
          String(this.toLengthScale(resolveRate())),
          '--output_file',
          '-',
        ],
      };
    }
    const espeakPath = Bun.which('espeak-ng') ?? Bun.which('espeak');
    if (espeakPath) {
      return {
        name: 'espeak-ng',
        playsDirectly: false,
        synthCommand: (text) => [
          espeakPath,
          '-s',
          String(this.toWordsPerMinute(resolveRate())),
          '--stdout',
          text,
        ],
      };
    }
    const sayPath = Bun.which('say');
    if (sayPath) {
      return {
        name: 'say',
        playsDirectly: true,
        synthCommand: (text) => [
          sayPath,
          '-r',
          String(this.toWordsPerMinute(resolveRate())),
          text,
        ],
      };
    }
    return null;
  }

  /** The Linux player for a WAV stream on stdin, or null when the engine plays directly / none
   *  present. Order matters: `aplay -` parses the WAV header from stdin while `pw-play -` assumes its
   *  default sample rate, so prefer aplay and retain pw-play only as the existing last resort. */
  protected static detectPlayer(): string | null {
    return Bun.which('aplay') ?? Bun.which('pw-play');
  }

  /** Bounded enqueue, drop-OLDEST past `maximumLength` — the queue policy as a pure static so it is
   *  testable without a detected engine (this box's unit runs have none). */
  static enqueueBounded(
    queue: string[],
    utterance: string,
    maximumLength: number,
  ): void {
    queue.push(utterance);
    while (queue.length > maximumLength) queue.shift();
  }

  protected readonly engine: DetectedEngine | null;
  protected readonly playerPath: string | null;
  protected readonly utteranceQueue: string[] = [];
  protected synthesisProcess: SpawnedProcess | null = null;
  protected playbackProcess: SpawnedProcess | null = null;
  protected disposed = false;

  protected get Processes() {
    return Processes.Class;
  }

  constructor(options: SystemTtsOptions = {}) {
    const resolveVoiceName =
      options.voiceProvider ?? ((): string => options.voice ?? '');
    const resolveSpeechRate =
      options.rateProvider ?? ((): number => options.rate ?? 1.0);
    const enginePath = options.enginePath;
    const systemTtsBackendClass = this.constructor as typeof $SystemTtsBackend;
    this.engine = enginePath
      ? {
          name: 'direct-override',
          playsDirectly: true,
          synthCommand: (text) => [enginePath, text],
        }
      : systemTtsBackendClass.detectEngine(resolveVoiceName, resolveSpeechRate);
    this.playerPath =
      this.engine && !this.engine.playsDirectly
        ? systemTtsBackendClass.detectPlayer()
        : null;
  }

  /** True when a working engine (and, on Linux, a player) was found — otherwise narration is silent. */
  get available(): boolean {
    if (!this.engine) return false;
    return this.engine.playsDirectly || this.playerPath !== null;
  }

  /** The detected engine name, or 'none' — surfaced so the UI can tell the user why it is silent. */
  get engineName(): string {
    return this.available ? (this.engine?.name ?? 'none') : 'none';
  }

  speak(text: string): void {
    if (this.disposed || !this.available) return; // clean no-op when no engine
    const trimmedText = text.trim();
    if (!trimmedText) return;
    // Bounded pending speech, drop-OLDEST: turns can arrive faster than slow playback drains them,
    // and stale narration read minutes late is noise — the newest utterances are the ones that
    // still describe what the user sees. Barge-in (stop) remains the instant full clear.
    const systemTtsBackendClass = this.constructor as typeof $SystemTtsBackend;
    systemTtsBackendClass.enqueueBounded(
      this.utteranceQueue,
      trimmedText,
      systemTtsBackendClass.MAXIMUM_PENDING_UTTERANCES,
    );
    if (!this.synthesisProcess && !this.playbackProcess) this.playNext();
  }

  stop(): void {
    this.utteranceQueue.length = 0;
    this.safeKill(this.playbackProcess);
    this.safeKill(this.synthesisProcess);
    this.playbackProcess = null;
    this.synthesisProcess = null;
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  /** Pull the next utterance and play it; chain to the following one when it finishes. Every spawn is
   *  guarded — a failure to launch the engine/player just skips that utterance rather than crashing. */
  protected playNext(): void {
    const utterance = this.utteranceQueue.shift();
    if (utterance === undefined || !this.engine) {
      this.synthesisProcess = null;
      this.playbackProcess = null;
      return;
    }
    try {
      if (this.engine.playsDirectly) {
        const spawnedProcess = this.Processes.spawn(
          this.engine.synthCommand(utterance),
          {
            stdout: 'ignore',
            stderr: 'ignore',
          },
        );
        this.playbackProcess = spawnedProcess;
        this.synthesisProcess = null;
        void spawnedProcess.exited.then(() =>
          this.onUtteranceDone(spawnedProcess),
        );
        return;
      }
      const synthesisProcess = this.Processes.spawn(
        this.engine.synthCommand(utterance),
        {
          stdin:
            this.engine.name === 'piper'
              ? new TextEncoder().encode(`${utterance}\n`)
              : 'ignore',
          stdout: 'pipe',
          stderr: 'ignore',
        },
      );
      // aplay reads stdin as '-' and quiets with '-q'; pw-play reads stdin as '-'.
      const playerArguments = this.playerPath?.endsWith('aplay')
        ? ['-q', '-']
        : ['-'];
      const playbackProcess = this.Processes.spawn(
        [this.playerPath as string, ...playerArguments],
        {
          stdin: synthesisProcess.stdout,
          stdout: 'ignore',
          stderr: 'ignore',
        },
      );
      this.synthesisProcess = synthesisProcess;
      this.playbackProcess = playbackProcess;
      void playbackProcess.exited.then(() =>
        this.onUtteranceDone(playbackProcess),
      );
    } catch {
      // Engine/player failed to launch — drop this utterance and try the next so one bad spawn never
      // wedges the queue. Narration degrades to silence, never an error.
      this.synthesisProcess = null;
      this.playbackProcess = null;
      this.playNext();
    }
  }

  protected onUtteranceDone(finishedProcess: SpawnedProcess): void {
    // Superseded by a stop()/new utterance — ignore stale exit.
    if (this.playbackProcess !== finishedProcess) return;
    this.playbackProcess = null;
    this.synthesisProcess = null;
    if (!this.disposed) this.playNext();
  }

  protected safeKill(spawnedProcess: SpawnedProcess | null): void {
    try {
      spawnedProcess?.kill();
    } catch {
      /* already gone */
    }
  }
}

export namespace SystemTtsBackend {
  export const $Class = Static($SystemTtsBackend);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

/** A detected engine: how to synthesize `text`, and whether it plays on its own (macOS `say`) or
 *  emits a WAV that must be piped into a separate player. */
interface DetectedEngine {
  readonly name: string;
  /** The synth command for one utterance. When `playsDirectly`, this command also plays the audio;
   *  otherwise it must emit a WAV stream on stdout for the player to consume. */
  synthCommand(text: string): string[];
  readonly playsDirectly: boolean;
}

export interface SystemTtsOptions {
  /** Override engine auto-detection (mainly for tests). */
  enginePath?: string;
  /** A FIXED selected voice NAME (the `.onnx` basename); '' / unknown → first discovered. Used by
   *  one-shot callers (Test Voice). For live narration, prefer `voiceProvider`. */
  voice?: string;
  /** A FIXED speech rate as a SPEED MULTIPLIER (1.0 = normal, 2.0 = twice as fast, 0.5 = half speed).
   *  For live narration, prefer `rateProvider`. */
  rate?: number;
  /** LIVE voice: read per utterance so a settings change takes effect without recreating the
   *  backend. */
  voiceProvider?: () => string;
  /** LIVE rate: read per utterance so a settings change takes effect without recreating the
   *  backend. */
  rateProvider?: () => number;
}

type SpawnedProcess = {
  kill(): void;
  readonly exited: Promise<number>;
};
