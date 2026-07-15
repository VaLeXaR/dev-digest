import type { AstNode } from '../astgrep';

export interface CodeSymbol {
  file: string;
  name: string;
  line: number;
}

export function extractSymbols(file: string, nodes: AstNode[]): CodeSymbol[] {
  return nodes.map((n) => ({ file, name: n.text.slice(0, 40), line: n.line }));
}
