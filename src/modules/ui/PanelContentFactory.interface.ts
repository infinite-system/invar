import type {
  PaneAddMenuEntry,
  PaneContent,
  PaneContentSpace,
} from './PaneContent.interface';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
export interface PanelContentFactory {
  readonly kind: string;
  readonly instanceLabel: string;
  readonly panelSpace: PaneContentSpace;
  readonly paneAddMenuEntries?: readonly PaneAddMenuEntry[];
  createPane(identifier: string, label: string): PaneContent;
}
