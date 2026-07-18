import { SUPPORTED_EXT } from '../../modules/repo-intel/constants';

export interface DepEdge {
  from: string;
  to: string;
}

export function buildDepGraph(files: { path: string; imports: string[] }[]): DepEdge[] {
  const indexable = new Set(
    files.filter((f) => SUPPORTED_EXT.some((e) => f.path.endsWith(e))).map((f) => f.path),
  );
  const edges: DepEdge[] = [];
  for (const f of files) {
    if (!indexable.has(f.path)) continue;
    for (const imp of f.imports) edges.push({ from: f.path, to: imp });
  }
  return edges;
}
