// The RUNTIME seam — the third plugin kind. Contributors add surfaces, providers answer questions,
// runtimes OWN PROCESSES. A runtime declares a pane kind and builds a `PaneContent` for it on
// demand; the host allocates the instance identity, supplies the laid-out geometry and the working
// folder, registers the returned pane in a `PanelHost`, and learns nothing about what the runtime
// starts. A PTY shell, a declared task process, and a CLI agent profile are all the SAME request
// shape — only the runtime knows a pseudo-terminal exists.
//
// invariant: A pane runtime owns its processes (src/modules/ui/ui.invariants.md)
import type { PaneContent, PaneContentSpace } from './PaneContent.interface';

/** A plugin-contributed owner of one pane kind and the processes behind it. */
export interface PaneRuntime {
  /** The pane kind this runtime builds (`terminal`). Unique across registered runtimes. */
  readonly kind: string;
  /** User-facing name of one instance — the host derives `Terminal`, `Terminal 2`, … from it. */
  readonly instanceLabel: string;
  /** The space kind and base label this runtime's panes join. */
  readonly panelSpace: PaneContentSpace;
  /** True when the panel Add menu offers this kind to the user. */
  readonly offeredInPanelAddMenu: boolean;
  /** Optional ordering for the pane kinds created by the panel's default split action. Lower values
   *  appear first. A runtime without this declaration stays available through the Add menu only. */
  readonly defaultSplitPriority?: number;
  /** Build a ready pane for the given request. The host registers whatever comes back. */
  createPane(request: PaneRuntimeRequest): PaneContent;
  /** One of this runtime's panes was removed from its host; release the session behind it. */
  paneRemoved?(content: PaneContent): void;
}

/** What the host hands back at registration: the ONE panel question a runtime cannot answer for
 *  itself, plus its unregistration. Pull-based, so a runtime projects live state without holding the
 *  panel or observing its reactivity. */
export interface PaneRuntimeHostPort {
  /** The runtime's current pane in the active workspace world, visible or hidden. */
  currentPane(): PaneContent | null;
  /** Take one of this runtime's panes out of the panel. A runtime being uninstalled MUST release
   *  every pane it built: withdrawing its registrations while a live pane keeps rendering and
   *  holding keyboard focus leaves an orphan that answers for a runtime that no longer exists. */
  releasePane(identifier: string): void;
  dispose(): void;
}

/** Everything the host knows when it asks a runtime for a pane. */
export interface PaneRuntimeRequest {
  /** Host-allocated stable identity, unique across every workspace world in the application. */
  readonly identifier: string;
  /** Host-allocated instance name (`Terminal`, `Terminal 2`). */
  readonly label: string;
  /** Pane kind override for a request that owns its own switching identity (a declared task). */
  readonly kind?: string;
  /** Heading override when the region title differs from the instance label. */
  readonly heading?: string;
  /** Seed geometry from the laid-out panel region; the frame loop converges the true size. */
  readonly columns: number;
  readonly rows: number;
  /** The folder the pane's work belongs to — the active workspace root, or a task's root. */
  readonly workingDirectory: string;
  /** An explicitly declared process instead of the runtime's default one. */
  readonly process?: PaneRuntimeProcess;
}

/** A declared process a runtime must start instead of its default. A CLI agent profile
 *  (`claude`/`codex` with its context flags) is exactly this shape — the host never learns that an
 *  agent is what it started. */
export interface PaneRuntimeProcess {
  readonly command: string;
  readonly arguments?: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
}
