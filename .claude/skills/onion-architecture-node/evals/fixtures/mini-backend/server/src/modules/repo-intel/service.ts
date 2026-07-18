import { astGrepScan } from '../../adapters/astgrep';
import { extractSymbols, type CodeSymbol } from '../../adapters/codeindex/extract';
import { SUPPORTED_EXT, MAX_INDEXED_FILES } from './constants';

export interface RepoIndex {
  symbols: CodeSymbol[];
  indexedFiles: number;
}

export class RepoIntelService {
  async buildIndex(files: { path: string; source: string }[]): Promise<RepoIndex> {
    const targets = files
      .filter((f) => SUPPORTED_EXT.some((e) => f.path.endsWith(e)))
      .slice(0, MAX_INDEXED_FILES);

    const symbols: CodeSymbol[] = [];
    for (const f of targets) {
      const nodes = await astGrepScan(f.source);
      symbols.push(...extractSymbols(f.path, nodes));
    }
    return { symbols, indexedFiles: targets.length };
  }
}
