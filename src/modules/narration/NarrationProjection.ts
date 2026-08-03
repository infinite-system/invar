// The THIRD projection over an AgentSession transcript. Text → the pane renderer, visual → decorations,
// and now audio → speech — all three subscribe to the SAME append-only transcript, so they are in sync
// for free (no separate narration state that could drift from what is on screen). This projection
// watches the session's paint pulse and speaks each assistant turn's text through a TtsBackend, but only
// at a MILESTONE — when the turn is COMPLETE (a following entry closed it, or the session went idle),
// never token-by-token. That is the difference between a narrator and a backseat driver.
//
// Two rules make it well-behaved:
//   - OFF BY DEFAULT / opt-in: it speaks only while `enabled` is true. Flipping it on mid-session starts
//     from the CURRENT turn, never dumping the backlog.
//   - BARGE-IN: any keystroke calls stop() — the interruptibility invariant applied to audio.
//
// invariant: Narration speaks only completed assistant turns (src/modules/narration/narration.invariants.md)
// invariant: Narration is a pure projection of the transcript (src/modules/narration/narration.invariants.md)
// invariant: A keystroke barges in on narration (src/modules/narration/narration.invariants.md)
// invariant: Internal tokens are never speakable (src/modules/narration/narration.invariants.md)
import { Reactive } from 'ivue';
import { ref, watch, type Ref } from 'vue';
import { StatusChannel } from '../system/StatusChannel';
import type { TtsBackend } from './TtsBackend.interface';
import { SpeakableText } from './SpeakableText';

class $NarrationProjection {
  /** How many transcript entries have been CONSIDERED (spoken or deliberately skipped). Only finalized
   *  entries advance it, so the still-open trailing turn is revisited until it completes. */
  protected consideredThrough = 0;

  protected stopWatch: (() => void) | null = null;

  constructor(
    protected readonly session: NarrationTranscript,
    protected readonly enabled: Ref<boolean>,
    protected readonly tts: TtsBackend,
  ) {
    // The session bumps renderRevision on every folded event; that is the one signal to re-examine the
    // transcript for a newly completed turn.
    // Sync flush: narration should evaluate on each folded event immediately (audio is time-sensitive),
    // and it does work ONLY when a fold bumped renderRevision — an idle session bumps nothing, so idle
    // quiescence still holds (no repaint, no loop; speak() is the only effect and only on a real turn).
    this.stopWatch = watch(
      () => this.session.renderRevision.value,
      () => this.onTranscriptChanged(),
      { flush: 'sync' },
    );
  }

  /** Count of assistant turns actually spoken — the observable the status probe/tests assert on. */
  get spokenCount() {
    return ref(0);
  }

  /** The text of the last turn handed to the TTS backend (for the probe/UI). */
  get lastSpoken() {
    return ref('');
  }

  /** How many times barge-in fired (a keystroke stopped speech) — the observable for the smoke. */
  get bargeInCount() {
    return ref(0);
  }

  protected get SpeakableText() {
    return SpeakableText.Class;
  }

  protected onTranscriptChanged(): void {
    const entries = this.session.transcript;
    // Disabled: silently advance past everything so re-enabling starts from the NEXT turn, never the
    // backlog. (Opt-in presence — same class as a reducedMotion toggle.)
    if (!this.enabled.value) {
      this.consideredThrough = entries.length;
      return;
    }
    for (
      let index = this.consideredThrough;
      index < entries.length;
      index += 1
    ) {
      if (!this.isFinalized(index, entries.length)) break; // stop at the still-open trailing turn
      this.consideredThrough = index + 1;
      const entry = entries[index];
      if (entry && entry.role === 'assistant') {
        // Speak the PROSE, not the markdown: strip syntax + simplify paths so piper doesn't spell out
        // backticks/paths letter-by-letter (the "bebebe" babble).
        const speechPreparation = this.SpeakableText.prepareForSpeech(
          entry.text ?? '',
        );
        if (speechPreparation.usedOriginalFallback) {
          this.session.appendSystemNote(
            'Narration warning: formatting protection failed; speaking the original text.',
          );
        }
        if (speechPreparation.text) {
          this.tts.speak(speechPreparation.text);
          this.lastSpoken.value = speechPreparation.text;
          this.spokenCount.value += 1;
        }
      }
    }
  }

  /** An entry is finalized — safe to speak — once it is no longer the trailing OPEN turn: either it has
   *  a successor (a later event closed it), or it is the last entry AND the session has settled
   *  (idle/ended), which is the turn boundary. A trailing entry while still streaming/awaiting-tool is
   *  NOT finalized, so nothing is spoken mid-token. */
  protected isFinalized(index: number, length: number): boolean {
    if (index < length - 1) return true;
    const status = this.session.status.value;
    return status === 'idle' || status === 'ended';
  }

  /** Barge-in: stop the current utterance and clear the queue. Wired to any keystroke. Future turns
   *  still narrate — this interrupts the CURRENT speech, it does not disable narration. */
  bargeIn(): void {
    this.tts.stop();
    this.bargeInCount.value += 1;
    // Stopping audio changes no terminal cells, so there may be no settled
    // frame to flush this semantic probe. Publish it at its mutation boundary.
    StatusChannel.Class.update({
      narrationBargeInCount: this.bargeInCount.value,
    });
    StatusChannel.Class.flush();
  }

  dispose(): void {
    this.stopWatch?.();
    this.stopWatch = null;
    this.tts.dispose();
  }
}

export namespace NarrationProjection {
  export const $Class = $NarrationProjection;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
  export type Model = InstanceType<typeof Class>;
}

export interface NarrationTranscript {
  readonly renderRevision: Ref<number>;
  readonly transcript: readonly {
    readonly role: string;
    readonly text?: string;
  }[];
  readonly status: Ref<string>;
  appendSystemNote(note: string): void;
}
