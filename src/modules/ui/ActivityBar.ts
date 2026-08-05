import {
  BoxRenderable,
  TextRenderable,
  StyledText,
  fg,
  type TextChunk,
  type CliRenderer,
} from '@opentui/core';
import { Reactive } from 'ivue';
import type { CommandRegistry } from '../commands/CommandRegistry';
import type { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import type { Palette } from '../theme/ThemePalettes';
import { ThemeIcons } from '../theme/ThemeIcons';
import type { GlyphLevel } from '../theme/TerminalCapabilities';
import type { ActivitySurface } from './ActivitySurface';
import { ContentOrderDrag } from './ContentOrderDrag';
import type { Tooltip } from './Tooltip';

// invariant: The active activity item determines its dock content (src/modules/ui/ui.invariants.md)
// invariant: Activity bar order is one persisted sequence (src/modules/ui/ui.invariants.md)
class $ActivityBar {
  constructor(protected readonly dependencies: ActivityBarDependencies) {
    this.bar = new BoxRenderable(dependencies.renderer, {
      id: dependencies.identifier,
      width: 4,
      height: '100%',
      flexShrink: 0,
      flexDirection: 'column',
    });
    this.body = new TextRenderable(dependencies.renderer, {
      id: `${dependencies.identifier}-body`,
      content: '',
      width: 4,
      height: '100%',
      wrapMode: 'none',
      selectable: false,
    });
    this.contentOrderDrag = new ContentOrderDrag.Class(
      dependencies.activitySurface,
    );
    this.bar.add(this.body);
    this.wireHandlers();
  }

  readonly bar: BoxRenderable;
  protected readonly body: TextRenderable;
  protected readonly contentOrderDrag: ContentOrderDrag.Model;
  protected hoveredItemIndex = -1;

  protected itemAtRow(screenRow: number) {
    const index = Math.floor((screenRow - this.bar.y) / 2);
    const content = this.dependencies.activitySurface.orderedContents[index];
    return index >= 0 && content ? { index, content } : null;
  }

  protected dragTargetIndexAtRow(screenRow: number): number {
    const itemCount = this.dependencies.activitySurface.orderedContents.length;
    return Math.max(
      0,
      Math.min(Math.floor((screenRow - this.bar.y) / 2), itemCount - 1),
    );
  }

  protected capturePointer(): void {
    const barWithContext = this.bar as unknown as {
      _ctx?: {
        setCapturedRenderable?: (renderable: unknown) => void;
      };
    };
    barWithContext._ctx?.setCapturedRenderable?.(this.bar);
  }

  protected wireHandlers(): void {
    const { renderer, activitySurface, tooltip, keybindings, commands } =
      this.dependencies;
    this.bar.onMouseDown = (event) => {
      const hit = this.itemAtRow(event.y);
      if (!hit) return;
      this.capturePointer();
      this.contentOrderDrag.pointerDown(hit.content.id);
      const activityResult = activitySurface.toggleContent(hit.content.id);
      if (activityResult === 'shown' && hit.content.activityAction) {
        commands.run(hit.content.activityAction);
      }
      tooltip.clear();
      renderer.requestRender();
    };
    this.bar.onMouseDrag = (event) => {
      this.contentOrderDrag.pointerDrag(
        this.dragTargetIndexAtRow(Number(event.y)),
      );
      tooltip.clear();
      renderer.requestRender();
    };
    const finishContentOrderDrag = (): void => {
      this.contentOrderDrag.pointerUp();
    };
    this.bar.onMouseUp = finishContentOrderDrag;
    this.bar.onMouseDragEnd = finishContentOrderDrag;
    this.bar.onMouseMove = (event) => {
      const hit = this.itemAtRow(event.y);
      this.hoveredItemIndex = hit?.index ?? -1;
      if (hit) {
        const action = hit.content.activityAction;
        const chordHint = action
          ? keybindings.bindingHint(action, 'global')
          : '';
        tooltip.point(
          chordHint
            ? `${hit.content.activityLabel ?? hit.content.title} (${chordHint})`
            : (hit.content.activityLabel ?? hit.content.title),
          event.x,
          event.y,
        );
      } else {
        tooltip.clear();
      }
      renderer.requestRender();
    };
    this.bar.onMouseOut = () => {
      this.hoveredItemIndex = -1;
      tooltip.clear();
      renderer.requestRender();
    };
  }

  update(palette: Palette): void {
    this.bar.backgroundColor = palette.panel;
    const activeIdentifier = this.dependencies.activitySurface.activeIdentifier;
    const chunks: TextChunk[] = [];
    this.dependencies.activitySurface.orderedContents.forEach(
      (content, index) => {
        const isActive = activeIdentifier === content.id;
        const isHovered = this.hoveredItemIndex === index;
        const badgeCount = content.activityBadge ?? 0;
        const badge =
          badgeCount > 0
            ? ThemeIcons.Class.smallDigitCountFor(
                this.dependencies.glyphLevel(),
                badgeCount,
                'standalone',
              )
            : ' ';
        chunks.push(fg(palette.fg)(' '));
        chunks.push(fg(palette.accent)(badge));
        chunks.push(
          fg(palette.fg)(`${' '.repeat(Math.max(0, 3 - badge.length))}\n`),
        );
        chunks.push(
          fg(palette.accent)(
            isActive ? this.dependencies.activityAccent() : ' ',
          ),
        );
        chunks.push(
          fg(isActive ? palette.accent : isHovered ? palette.fg : palette.dim)(
            ` ${content.icon ?? '·'} `,
          ),
        );
        if (
          index <
          this.dependencies.activitySurface.orderedContents.length - 1
        ) {
          chunks.push(fg(palette.fg)('\n'));
        }
      },
    );
    this.body.content = new StyledText(chunks);
  }

  itemIdentifiers(): string[] {
    return this.dependencies.activitySurface.orderedContents.map(
      (content) => content.id,
    );
  }

  setVisible(visible: boolean): void {
    this.bar.visible = visible;
    this.bar.width = visible ? 4 : 0;
  }
}

export namespace ActivityBar {
  export const $Class = $ActivityBar;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface ActivityBarDependencies {
  renderer: CliRenderer;
  identifier: string;
  activitySurface: ActivitySurface.Model;
  tooltip: Tooltip.Instance;
  keybindings: KeybindingRegistry.Instance;
  commands: CommandRegistry.Instance;
  activityAccent: () => string;
  glyphLevel: () => GlyphLevel;
}
