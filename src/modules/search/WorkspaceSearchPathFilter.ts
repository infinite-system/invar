/** One allow-then-remove path filter shared by disk candidates and open-document overlays. */
class $WorkspaceSearchPathFilter {
  constructor(
    readonly includeGlobs: readonly string[],
    readonly excludeGlobs: readonly string[],
  ) {
    this.includePatterns = includeGlobs.map((glob) => new Bun.Glob(glob));
    this.excludePatterns = excludeGlobs.map((glob) => new Bun.Glob(glob));
  }

  protected readonly includePatterns: readonly Bun.Glob[];
  protected readonly excludePatterns: readonly Bun.Glob[];

  includes(relativePath: string): boolean {
    const included =
      this.includePatterns.length === 0 ||
      this.includePatterns.some((pattern) => pattern.match(relativePath));
    return (
      included &&
      !this.excludePatterns.some((pattern) => pattern.match(relativePath))
    );
  }
}

export namespace WorkspaceSearchPathFilter {
  export const $Class = $WorkspaceSearchPathFilter;
  export let Class = $Class;
  export type Instance = InstanceType<typeof Class>;
}
