import { Static } from 'ivue/extras';
// Observability side channel (plan §5.2) — the deterministic artifact the tmux harness
// asserts against instead of scraping the pane. The app pushes model/process state here;
// this writes artifacts/status.json atomically after each settled frame.
//
// State verdicts come from this file + `git` + process snapshots; pane capture is reserved
// for genuinely visual assertions (layout, squiggles, theme).
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';

class $StatusChannel {
  protected static prepared = false;

  /** Per-instance side channel: harness sessions never clobber each other's observability. */
  protected static get statusPath(): string {
    return process.env.TUI_STATUS_PATH || 'artifacts/status.json';
  }

  /** Per-frame disk writes are harness infrastructure; normal runs retain in-memory state only. */
  protected static get observingEnabled(): boolean {
    return (
      process.env.TUI_OBSERVE === '1' || Boolean(process.env.TUI_STATUS_PATH)
    );
  }

  protected static get temporaryPath(): string {
    return `${this.statusPath}.tmp`;
  }

  protected static get $state(): StatusSnapshot {
    const state: StatusSnapshot = {
      ready: false,
      frame: 0,
      renderQuiescent: false,
      width: 0,
      height: 0,
      activeWorkspace: null,
      workspaces: [],
      activeBuffer: null,
      bufferRevision: 0,
      dirty: false,
      cursor: null,
      openBuffers: [],
      diagnosticsCount: 0,
      subprocessPids: [],
      lifecycleTier: 'boot',
      overlay: null,
      panelActiveContentLabel: null,
      panelActiveContentKind: null,
      panelCellLabels: [],
      panelCellKinds: [],
    };
    return state;
  }

  static get path(): string {
    return this.statusPath;
  }

  /** The one observability enablement, shared by every side channel (the
   *  graph channel keys off this too — one flag arms or disarms the family). */
  static get observing(): boolean {
    return this.observingEnabled;
  }

  static get snapshot(): StatusSnapshot {
    return this.$state;
  }

  /** Merge a partial update into the live snapshot (does not write). */
  static update(patch: Partial<StatusSnapshot>): void {
    Object.assign(this.$state, patch);
  }

  /** Atomically flush the current snapshot to disk (write-temp + rename). */
  static flush(): void {
    if (!this.observingEnabled) return;
    if (!this.prepared) {
      try {
        mkdirSync('artifacts', { recursive: true });
      } catch {
        /* ignore */
      }
      this.prepared = true;
    }
    try {
      writeFileSync(this.temporaryPath, JSON.stringify(this.$state, null, 2));
      renameSync(this.temporaryPath, this.statusPath);
    } catch {
      /* never crash the app over observability */
    }
  }

  /** Mark a requested frame as pending before the renderer schedules it. */
  static markRenderRequested(): void {
    if (!this.observingEnabled || !this.$state.renderQuiescent) return;
    this.$state.renderQuiescent = false;
    this.flush();
  }

  /** Mark the frame settled and flush — called after a render quiesces. */
  static settle(frame: number): void {
    if (!this.observingEnabled) return;
    this.$state.frame = frame;
    this.$state.renderQuiescent = true;
    this.flush();
  }
}

export namespace StatusChannel {
  export const $Class = Static($StatusChannel);
  export let Class = $Class;
}

export interface StatusSnapshot {
  ready: boolean;
  frame: number;
  renderQuiescent: boolean;
  width: number;
  height: number;
  activeWorkspace: string | null;
  workspaces: string[];
  activeBuffer: string | null;
  bufferRevision: number;
  dirty: boolean;
  cursor: { line: number; col: number } | null;
  openBuffers: string[];
  diagnosticsCount: number;
  subprocessPids: number[];
  lifecycleTier: string;
  overlay: string | null;
  panelActiveContentLabel: string | null;
  panelActiveContentKind: string | null;
  panelCellLabels: string[];
  panelCellKinds: string[];
  completionOpen?: boolean;
  completionSelectedLabel?: string;
  completionItemCount?: number;
  completionGeometry?: {
    listRows: number;
    visibleItemCount: number;
  } | null;
  [key: string]: unknown;
}
