import { Reactive } from 'ivue';
import { ref } from 'vue';

class $AgentSpinner {
  protected static get frameIntervalMilliseconds(): number {
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
    Object.defineProperty(this, '$defaultScheduler', {
      configurable: true,
      value: defaultScheduler,
    });
    return defaultScheduler;
  }

  protected timerHandle: unknown = null;
  /** Wall-clock ms captured when the busy spell began (for the elapsed counter). */
  protected startMilliseconds = 0;
  protected readonly scheduler: SpinnerScheduler;
  protected readonly intervalMilliseconds: number;

  constructor(
    scheduler?: SpinnerScheduler,
    intervalMilliseconds?: number,
  ) {
    const agentSpinnerClass = this.constructor as typeof $AgentSpinner;
    this.scheduler = scheduler ?? agentSpinnerClass.$defaultScheduler;
    this.intervalMilliseconds =
      intervalMilliseconds ?? agentSpinnerClass.frameIntervalMilliseconds;
  }

  /** The current animation frame index — fused into the pane's render revision so a tick repaints. */
  get frame() {
    return ref(0);
  }

  /** True while the timer is armed. */
  get running() {
    return ref(false);
  }

  /** Arm the ~10 Hz timer (idempotent). Each tick advances `frame`, driving the repaint. */
  start(): void {
    if (this.running.value) return;
    this.running.value = true;
    this.startMilliseconds = this.scheduler.now();
    this.timerHandle = this.scheduler.setInterval(() => {
      this.frame.value += 1;
    }, this.intervalMilliseconds);
  }

  /** Whole seconds elapsed since the busy spell began (0 at rest). Re-read each frame off the clock. */
  elapsedSeconds(): number {
    if (!this.running.value) return 0;
    return Math.max(0, Math.floor((this.scheduler.now() - this.startMilliseconds) / 1000));
  }

  /** The current wall-clock ms (the same injected clock) — for surfaces timing their own sub-intervals
   *  (e.g. how long a specific tool call has been pending) off the busy-only animation loop. */
  nowMilliseconds(): number {
    return this.scheduler.now();
  }

  /** Tear the timer down and reset the frame so the next busy spell starts clean (idempotent). */
  stop(): void {
    if (!this.running.value) return;
    this.running.value = false;
    if (this.timerHandle !== null) {
      this.scheduler.clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    this.frame.value = 0;
  }

  dispose(): void {
    this.stop();
  }
}

export namespace AgentSpinner {
  export const $Class = $AgentSpinner;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
  export type Model = InstanceType<typeof Class>;
}

export interface SpinnerScheduler {
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
  now(): number;
}
