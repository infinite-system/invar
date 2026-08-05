import { Static } from 'ivue/extras';
import { Files } from '../system/Files';

class $Breadcrumb {
  // Cells painted on EACH side of a crumb label. They belong to the crumb, not to the row: the
  // hover background covers the label plus these cells, the click target is that same span, and
  // the crumb picker anchors on its start. One geometry, three readers.
  // Hot paint-and-hit path: this fixed cell width never varies by subclass.
  static readonly HOVER_PAD_COLUMNS = 1;

  /** The crumb label as it occupies the row — the label plus its own pad cell on each side. */
  static paddedLabel(label: string): string {
    const padding = ' '.repeat(this.HOVER_PAD_COLUMNS);
    return `${padding}${label}${padding}`;
  }

  static breadcrumbSegments(
    absolutePath: string,
    projectRoot: string,
  ): string[] {
    return this.pathSegments(absolutePath, projectRoot).map(
      (segment) => segment.label,
    );
  }

  static pathSegments(
    absolutePath: string,
    projectRoot: string,
  ): BreadcrumbPathSegment[] {
    const normalizedRoot = Files.Class.absolute(projectRoot);
    const normalizedPath = Files.Class.absolute(absolutePath);
    const fileName = Files.Class.basename(normalizedPath);
    if (
      !normalizedRoot ||
      Files.Class.confineToRoot(normalizedRoot, normalizedPath) === null
    ) {
      return [
        {
          label: fileName,
          path: normalizedPath,
          directoryPath: Files.Class.dirname(normalizedPath),
          selectedItemIdentifier: normalizedPath,
          sourceIndex: 0,
          collapsed: false,
        },
      ];
    }

    const relativeParts = Files.Class.relative(normalizedRoot, normalizedPath)
      .split(/[\\/]+/)
      .filter(Boolean);
    const projectName = Files.Class.basename(normalizedRoot);
    const segmentPaths = [normalizedRoot];
    for (const relativePart of relativeParts) {
      segmentPaths.push(
        Files.Class.join(segmentPaths[segmentPaths.length - 1]!, relativePart),
      );
    }

    return segmentPaths.map((segmentPath, sourceIndex) => {
      const isLastSegment = sourceIndex === segmentPaths.length - 1;
      const isFileSegment = isLastSegment && relativeParts.length > 0;
      return {
        label:
          sourceIndex === 0
            ? projectName
            : (relativeParts[sourceIndex - 1] ?? fileName),
        path: segmentPath,
        directoryPath: isFileSegment
          ? Files.Class.dirname(segmentPath)
          : segmentPath,
        selectedItemIdentifier: isFileSegment
          ? segmentPath
          : segmentPaths[sourceIndex + 1],
        sourceIndex,
        collapsed: false,
      };
    });
  }

  static fitBreadcrumb(
    segments: string[],
    maximumWidth: number,
    separatorWidth: number,
  ): string[] {
    return this.fitPathSegments(
      segments.map((label, sourceIndex) => ({
        label,
        path: label,
        directoryPath: label,
        sourceIndex,
        collapsed: false,
      })),
      maximumWidth,
      separatorWidth,
    ).map((segment) => segment.label);
  }

  static fitPathSegments(
    segments: readonly BreadcrumbPathSegment[],
    maximumWidth: number,
    separatorWidth: number,
  ): BreadcrumbPathSegment[] {
    if (segments.length === 0) return [];
    let visibleSegments = [...segments];
    while (
      visibleSegments.length > 1 &&
      this.segmentsWidth(visibleSegments, separatorWidth) > maximumWidth
    ) {
      if (visibleSegments[0]?.collapsed) {
        visibleSegments = [visibleSegments[0], ...visibleSegments.slice(2)];
      } else {
        visibleSegments = [
          { ...visibleSegments[0]!, label: '…', collapsed: true },
          ...visibleSegments.slice(1),
        ];
      }
      if (visibleSegments.length === 2 && visibleSegments[0]?.collapsed) {
        break;
      }
    }

    const lastSegment = visibleSegments[visibleSegments.length - 1]!;
    if (this.segmentsWidth(visibleSegments, separatorWidth) <= maximumWidth) {
      return visibleSegments;
    }
    if (lastSegment.label.length <= maximumWidth) return [lastSegment];
    return [
      {
        ...lastSegment,
        label:
          maximumWidth <= 1
            ? '…'
            : `${lastSegment.label.slice(0, maximumWidth - 1)}…`,
      },
    ];
  }

  protected static segmentsWidth(
    segments: readonly BreadcrumbPathSegment[],
    separatorWidth: number,
  ): number {
    return (
      segments.reduce(
        (totalWidth, segment) => totalWidth + segment.label.length,
        0,
      ) +
      Math.max(0, segments.length - 1) * separatorWidth
    );
  }
}

export namespace Breadcrumb {
  export const $Class = Static($Breadcrumb);
  export let Class = $Class;
}

export interface BreadcrumbPathSegment {
  label: string;
  path: string;
  directoryPath: string;
  selectedItemIdentifier?: string;
  sourceIndex: number;
  collapsed: boolean;
}
