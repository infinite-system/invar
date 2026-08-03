import type { KeyEvent, StyledText, TextChunk } from '@opentui/core';
import { StyledText as OpenTuiStyledText, fg } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed, ref } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import { TextCoordinates } from '../text/TextCoordinates';
import { TextInputModel, type TextInputAction } from '../text/TextInputModel';
import { ThemeIcons } from '../theme/ThemeIcons';
import type {
  PaneContent,
  PaneRenderContext,
  PaneTextInputPort,
} from '../ui/PaneContent.interface';
import { TextFieldPainter } from '../ui/TextFieldPainter';
import type { DatabaseConsumerWorkspace } from './DatabaseConsumerWorkspace';
import type { DatabaseValue } from './DatabaseProvider.interface';

// invariant: Editable text fields share one input model (project.invariants.md)
// invariant: One painter draws every single-line text field (src/modules/ui/ui.invariants.md)
// invariant: Database files are user selected (src/modules/database/database.invariants.md)
class $DatabasePaneContent implements PaneContent, PaneTextInputPort {
  protected readonly pathInput = new TextInputModel.Class();
  readonly kind = 'database';

  constructor(
    protected readonly application: ApplicationContributionContext,
    protected readonly activeWorkspace: () => DatabaseConsumerWorkspace.Model,
    protected readonly identifier = 'database',
    readonly instanceLabel = 'Database',
  ) {}

  get inputActive() {
    return ref(false);
  }
  get version() {
    return ref(0);
  }
  get pathInputValue(): string {
    return this.pathInput.value;
  }

  get id(): string {
    return this.identifier;
  }
  get title(): string {
    return this.instanceLabel;
  }
  get activityLabel(): string {
    return 'Database';
  }
  get icon(): string {
    return ThemeIcons.Class.symbolMarkFor(
      this.application.theme.glyphLevel.value,
      'module',
    );
  }
  get activityAction(): string {
    return 'view.showDatabase';
  }
  get keybindingContext(): string {
    return 'database';
  }

  get renderRevision() {
    return computed(() => this.readRenderRevision());
  }

  beginConnectionInput(): void {
    this.pathInput.setValue(this.activeWorkspace().filePath.value ?? '');
    this.inputActive.value = true;
    this.version.value++;
  }

  cancelConnectionInput(): void {
    if (!this.inputActive.value) return;
    this.inputActive.value = false;
    this.version.value++;
  }

  submitOrActivate(): void {
    if (this.inputActive.value) {
      const filePath = this.pathInput.value;
      this.inputActive.value = false;
      this.version.value++;
      void this.activeWorkspace().connect(filePath);
      return;
    }
    void this.activeWorkspace().activateSelectedDescription();
  }

  applyInputAction(action: TextInputAction): void {
    if (!this.inputActive.value) return;
    if (this.pathInput.apply(action)) this.version.value++;
  }

  copyInputSelection(): Promise<number> {
    if (!this.inputActive.value) return Promise.resolve(0);
    return this.pathInput.copySelection();
  }

  capability<Port>(identifier: string): Port | null {
    if (identifier === 'text-input' && this.inputActive.value) {
      return this as unknown as Port;
    }
    return null;
  }

  protected readRenderRevision(): string {
    void this.application.workspaceSet.activeWorkspaceIndex.value;
    const workspace = this.activeWorkspace();
    return [
      workspace.version.value,
      workspace.status.value,
      this.version.value,
      this.inputActive.value,
      this.pathInput.text.value,
      this.pathInput.caret.value,
      this.pathInput.selectionAnchor.value,
    ].join(':');
  }

  render(context: PaneRenderContext): StyledText {
    const workspace = this.activeWorkspace();
    const chunks: TextChunk[] = [fg(context.palette.fg)('\n   Database\n\n')];
    if (this.inputActive.value) {
      this.renderConnectionInput(chunks, context);
    } else if (workspace.status.value === 'idle') {
      chunks.push(fg(context.palette.dim)('   Open this pane to connect.\n'));
    } else if (workspace.status.value === 'loading') {
      chunks.push(
        fg(context.palette.dim)(
          `   Connecting\n${this.line(
            workspace.filePath.value ?? '',
            context.width,
          )}`,
        ),
      );
    } else if (workspace.status.value === 'unavailable') {
      chunks.push(
        fg(context.palette.dim)('   No database provider is installed.\n'),
      );
    } else if (workspace.status.value === 'error') {
      chunks.push(
        fg(context.palette.error)(
          `   Connection error\n${this.line(
            workspace.failure.value ?? 'Unknown error',
            context.width,
          )}`,
        ),
        fg(context.palette.dim)(
          '\n   Run Database: Connect\n   to choose another file.\n',
        ),
      );
    } else if (workspace.status.value === 'disconnected') {
      chunks.push(
        fg(context.palette.dim)(
          '   No database is connected.\n\n' +
            '   Run Database: Connect\n' +
            '   from the Command Palette.\n',
        ),
      );
    } else {
      this.renderConnectedDatabase(chunks, context, workspace);
    }
    return new OpenTuiStyledText(chunks);
  }

  protected renderConnectionInput(
    chunks: TextChunk[],
    context: PaneRenderContext,
  ): void {
    chunks.push(fg(context.palette.fg)('   SQLite file path\n   '));
    const field = TextFieldPainter.Class.paint({
      prefix: '',
      input: this.pathInput,
      tone: TextFieldPainter.Class.toneFor(context.palette, 'focused'),
      selectionTone: TextFieldPainter.Class.selectionToneFor(context.palette),
      surfaceBackground: context.palette.panel,
      caretVisible: context.focused,
      width: Math.max(1, context.width - 6),
    });
    chunks.push(...field.chunks);
    chunks.push(fg(context.palette.dim)('\n\n   Enter connect · Esc cancel\n'));
  }

  protected renderConnectedDatabase(
    chunks: TextChunk[],
    context: PaneRenderContext,
    workspace: DatabaseConsumerWorkspace.Model,
  ): void {
    chunks.push(
      fg(context.palette.accent)('   SQLite connected\n'),
      fg(context.palette.dim)(
        this.line(workspace.filePath.value ?? '', context.width) + '\n',
      ),
      fg(context.palette.fg)('   Schema\n'),
    );
    const schemaViewportRows = Math.max(1, Math.min(10, context.height - 12));
    const selectedDescriptionIndex = Math.max(
      0,
      workspace.selectedDescriptionIndex.value,
    );
    const maximumFirstVisibleIndex = Math.max(
      0,
      workspace.descriptions.value.length - schemaViewportRows,
    );
    const firstVisibleIndex = Math.min(
      maximumFirstVisibleIndex,
      Math.max(
        0,
        selectedDescriptionIndex - Math.floor(schemaViewportRows / 2),
      ),
    );
    const visibleDescriptions = workspace.descriptions.value.slice(
      firstVisibleIndex,
      firstVisibleIndex + schemaViewportRows,
    );
    for (const [visibleIndex, row] of visibleDescriptions.entries()) {
      const rowIndex = firstVisibleIndex + visibleIndex;
      const selected = rowIndex === workspace.selectedDescriptionIndex.value;
      const expansion =
        row.description.mayHaveChildren && row.depth === 0
          ? row.expanded
            ? '[-]'
            : '[+]'
          : '   ';
      const detail = row.description.detail ? ` ${row.description.detail}` : '';
      const descriptionText =
        row.depth === 0
          ? `${expansion} ${row.description.name} [${row.description.kind}]`
          : `${row.description.kind} ${row.description.name}`;
      const rowText = `${selected ? '>' : ' '} ${descriptionText}${detail}`;
      chunks.push(
        fg(selected ? context.palette.accent : context.palette.fg)(
          this.line(rowText, context.width),
        ),
      );
    }
    if (workspace.descriptions.value.length === 0) {
      chunks.push(fg(context.palette.dim)('     No tables or views.\n'));
    }
    if (workspace.previewTableName.value) {
      chunks.push(
        fg(context.palette.fg)(
          '\n' +
            this.line(
              `Rows: ${workspace.previewTableName.value} ` +
                `(page ${workspace.previewPageIndex.value + 1})`,
              context.width,
            ),
        ),
        fg(context.palette.dim)(
          this.line(workspace.previewColumns.value.join(' | '), context.width),
        ),
      );
      for (const row of workspace.previewRows.value) {
        chunks.push(
          fg(context.palette.fg)(
            this.line(
              workspace.previewColumns.value
                .map((column) => this.displayValue(row[column]))
                .join(' | '),
              context.width,
            ),
          ),
        );
      }
      chunks.push(
        fg(context.palette.dim)(
          workspace.previewHasMoreRows.value
            ? '   PageDown: next page\n'
            : '   End of rows\n',
        ),
      );
    } else {
      chunks.push(
        fg(context.palette.dim)(
          '\n   Up/Down select\n   Enter browse and preview\n',
        ),
      );
    }
  }

  protected displayValue(value: DatabaseValue | undefined): string {
    if (value === null) return 'NULL';
    if (value === undefined) return '';
    if (value instanceof Uint8Array) return `<${value.byteLength} bytes>`;
    return String(value);
  }

  protected line(text: string, width: number): string {
    const availableWidth = Math.max(1, width - 3);
    return (
      '   ' +
      TextCoordinates.Class.displayColumnWindow(text, 0, availableWidth) +
      '\n'
    );
  }

  handleKey(key: KeyEvent): boolean {
    if (!this.inputActive.value || !this.isTypedCharacter(key)) return false;
    this.pathInput.insert(key.sequence);
    this.version.value++;
    return true;
  }

  handlePaste(text: string): boolean {
    if (!this.inputActive.value) return false;
    this.pathInput.insert(text);
    this.version.value++;
    return true;
  }

  protected isTypedCharacter(key: KeyEvent): boolean {
    return (
      key.sequence.length > 0 &&
      !key.ctrl &&
      !key.option &&
      !key.meta &&
      !key.super &&
      key.name !== 'return' &&
      key.name !== 'escape'
    );
  }

  onResize(_columns: number, _rows: number): void {}

  onFocus(): void {
    this.application.bottomPanelHost.focus();
  }

  onBlur(): void {
    this.cancelConnectionInput();
  }

  dispose(): void {}
}

export namespace DatabasePaneContent {
  export const $Class = $DatabasePaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
