import { Static } from 'ivue/extras';

// invariant: Input byte latency uses a reviewed gate baseline (scripts/harness/harness.invariants.md)
class $InputByteFlushVerdict {
  protected static get DRIVEN_BEHAVIOUR_PREFIX(): string {
    return 'input-byte-flush: DRIVEN BEHAVIOUR WRONG — ';
  }

  static drivenBehaviourFailureMessage(failureDetails: string): string {
    return `${this.DRIVEN_BEHAVIOUR_PREFIX}${failureDetails}`;
  }

  static measurementFailureMessage(failureDetails: string): string {
    if (failureDetails.startsWith(this.DRIVEN_BEHAVIOUR_PREFIX)) {
      return failureDetails;
    }
    return `input-byte-flush: INSTRUMENT FAILED — ${failureDetails}`;
  }

  static sessionFailureMessage(
    sessionNumber: number,
    exitCode: number,
    standardOutput: string,
    standardError: string,
  ): string {
    const combinedOutput = `${standardOutput}\n${standardError}`;
    const drivenBehaviourMessageStart = combinedOutput.indexOf(
      this.DRIVEN_BEHAVIOUR_PREFIX,
    );
    if (drivenBehaviourMessageStart >= 0) {
      const failureDetailsStart =
        drivenBehaviourMessageStart + this.DRIVEN_BEHAVIOUR_PREFIX.length;
      const failureDetails =
        combinedOutput.slice(failureDetailsStart).split('\n')[0]?.trim() ??
        'the driven cursor movement assertion failed';
      return (
        `input-byte-flush-gate: DRIVEN BEHAVIOUR WRONG — session ` +
        `${sessionNumber}: ${failureDetails}`
      );
    }
    return (
      `input-byte-flush-gate: INSTRUMENT FAILED — session ` +
      `${sessionNumber} exited ${exitCode} before producing a valid datum`
    );
  }

  static firstFrameOrderingFailure(
    completedFramesUntilGlyph: number,
  ): string | null {
    if (completedFramesUntilGlyph === 1) return null;
    return (
      `the edited glyph appeared in completed frame ` +
      `${completedFramesUntilGlyph} after input; expected the first`
    );
  }
}

export namespace InputByteFlushVerdict {
  export const $Class = $InputByteFlushVerdict;
  export const Class = Static($Class);
}
