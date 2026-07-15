import { parse, Lang } from '@ast-grep/napi';

export interface AstNode {
  kind: string;
  line: number;
  text: string;
}

export async function astGrepScan(source: string): Promise<AstNode[]> {
  const root = parse(Lang.TypeScript, source).root();
  return root
    .findAll({ rule: { kind: 'function_declaration' } })
    .map((n) => ({ kind: n.kind(), line: n.range().start.line, text: n.text() }));
}
