// The seam between the layout module's per-workspace slot state and the running application.
// The layout module never names a dock host, a renderer, or a settings field: it reads and writes
// one value struct, and the composition root wires that struct to whatever paints it.
//
// The struct is the WORKSPACE-SCOPED subset of `LayoutModelOptions`. Everything in
// `LayoutModelOptions` that is NOT here is an application preference (activity bar visibility,
// sidebar side, panel alignment, dock vertical spans) and stays shared by every workspace.

/** Read and write the slots the application is showing right now. */
export interface WorkspaceLayoutSlotPorts {
  readSlots(): WorkspaceLayoutSlotValues;
  applySlots(values: WorkspaceLayoutSlotValues): void;
}

/** The layout slot values one workspace owns and carries across a workspace switch. */
export interface WorkspaceLayoutSlotValues {
  primaryDockVisible: boolean;
  primaryDockColumns: number;
  rightDockVisible: boolean;
  rightDockColumns: number;
  /** Which content the right dock shows, or null when the dock has never chosen one. */
  rightDockContentIdentifier: string | null;
  bottomPanelRows: number;
}
