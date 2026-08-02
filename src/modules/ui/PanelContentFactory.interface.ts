import type { PaneContent } from './PaneContent.interface';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
export interface PanelContentFactory {
  readonly kind: string;
  readonly instanceLabel: string;
  createPane(identifier: string, label: string): PaneContent;
}
