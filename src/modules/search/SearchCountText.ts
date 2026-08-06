import { Static } from 'ivue/extras';

class $SearchCountText {
  static resultSummary(resultCount: number, fileCount: number): string {
    return `${resultCount} ${this.resultNoun(resultCount)} in ${fileCount} ${this.fileNoun(fileCount)}`;
  }

  static itemNoun(count: number): string {
    return count === 1 ? 'item' : 'items';
  }

  static resultNoun(count: number): string {
    return count === 1 ? 'result' : 'results';
  }

  static fileNoun(count: number): string {
    return count === 1 ? 'file' : 'files';
  }
}

export namespace SearchCountText {
  export const $Class = Static($SearchCountText);
  export let Class = $Class;
}
