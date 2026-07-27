import { Static } from 'ivue/extras';
import { Reactive } from 'ivue';
import { ref, watch } from 'vue';

// invariant: Thinking indicator follows turn state (src/modules/agent/agent.invariants.md)

class $AgentSpinner {
  protected static get FRAME_INTERVAL_MILLISECONDS(): number {
    return 100;
  }

  protected static get $defaultScheduler(): SpinnerScheduler {
    const defaultScheduler: SpinnerScheduler = {
      setInterval: (callback, milliseconds) =>
        setInterval(callback, milliseconds),
      clearInterval: (handle) =>
        clearInterval(handle as ReturnType<typeof setInterval>),
      now: () => Date.now(),
    };
    return defaultScheduler;
  }

  protected timerHandle: unknown = null;
  /** Wall-clock ms captured when the busy spell began (for the elapsed counter). */
  protected startMilliseconds = 0;
  protected readonly scheduler: SpinnerScheduler;
  protected readonly intervalMilliseconds: number;
  protected readonly stopRunningWatch: () => void;
  protected disposed = false;

  constructor(
    protected readonly shouldRun: () => boolean,
    scheduler?: SpinnerScheduler,
    intervalMilliseconds?: number,
  ) {
    const agentSpinnerClass = this.constructor as typeof $AgentSpinner;
    this.scheduler = scheduler ?? agentSpinnerClass.$defaultScheduler;
    this.intervalMilliseconds =
      intervalMilliseconds ?? agentSpinnerClass.FRAME_INTERVAL_MILLISECONDS;
    this.stopRunningWatch = watch(
      () => this.running,
      (running) => this.synchronizeTimer(running),
      { immediate: true, flush: 'sync' },
    );
  }

  /** The current animation frame index — fused into the pane's render revision so a tick repaints. */
  get frame() {
    return ref(0);
  }

  /** A pure projection of the owning pane's live turn and visibility state. */
  get running(): boolean {
    return !this.disposed && this.shouldRun();
  }

  protected synchronizeTimer(running: boolean): void {
    if (running) this.armTimer();
    else this.disarmTimer();
  }

  /** Arm the ~10 Hz timer (idempotent). Each tick advances `frame`, driving the repaint. */
  protected armTimer(): void {
    if (this.timerHandle !== null) return;
    this.startMilliseconds = this.scheduler.now();
    this.timerHandle = this.scheduler.setInterval(() => {
      this.frame.value += 1;
    }, this.intervalMilliseconds);
  }

  /** Whole seconds elapsed since the busy spell began (0 at rest). Re-read each frame off the clock. */
  elapsedSeconds(): number {
    if (!this.running) return 0;
    return Math.max(
      0,
      Math.floor((this.scheduler.now() - this.startMilliseconds) / 1000),
    );
  }

  /** The current wall-clock ms (the same injected clock) — for surfaces timing their own sub-intervals
   *  (e.g. how long a specific tool call has been pending) off the busy-only animation loop. */
  nowMilliseconds(): number {
    return this.scheduler.now();
  }

  /** Tear the timer down and reset the frame so the next busy spell starts clean (idempotent). */
  protected disarmTimer(): void {
    if (this.timerHandle !== null) {
      this.scheduler.clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    this.frame.value = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.stopRunningWatch();
    this.disarmTimer();
  }
}

export namespace AgentSpinner {
  export const $Class = Static($AgentSpinner);
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
  export type Model = InstanceType<typeof Class>;
}

export interface SpinnerScheduler {
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
  now(): number;
}
