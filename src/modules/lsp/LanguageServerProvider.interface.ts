export interface LanguageServerProvider {
  readonly id: string;
  readonly capabilities: LanguageCapabilities;
  supportsPath(path: string): boolean;
  resolve(rootPath: string): Promise<LanguageServerCommand | null>;
}

export interface LanguageServerCommand {
  command: string;
  args: readonly string[];
}

export interface LanguageCapabilities {
  diagnostics: boolean;
  definition: boolean;
  hover: boolean;
  references: boolean;
  completion: boolean;
  documentSymbols: boolean;
}
