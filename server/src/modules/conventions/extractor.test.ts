import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyEvidence, callLLM } from './extractor.js';
import type { RawCandidate } from './extractor.js';
import type { LLMProvider, CompletionResult } from '@devdigest/shared';

// ---------- helpers ---------------------------------------------------------

/** Create a temp directory and return its path. Cleaned up in afterEach. */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'extractor-test-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function cleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Minimal stub that satisfies LLMProvider */
function makeLlm(text: string): LLMProvider {
  return {
    id: 'openai',
    listModels: vi.fn(),
    complete: vi.fn().mockResolvedValue({
      text,
      model: 'gpt-4o',
      tokensIn: 10,
      tokensOut: 10,
      costUsd: null,
    } satisfies CompletionResult),
    completeStructured: vi.fn(),
    embed: vi.fn(),
  } as unknown as LLMProvider;
}

// ---------- verifyEvidence --------------------------------------------------

describe('verifyEvidence', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) cleanDir(tmpDir);
  });

  it('returns candidate when first line of snippet is found anywhere in the file', async () => {
    tmpDir = makeTempDir();
    writeFile(tmpDir, 'src/index.ts', 'line 1\nconst foo = bar();\nline 3\n');

    const candidates: RawCandidate[] = [
      {
        rule: 'use const',
        evidencePath: 'src/index.ts',
        evidenceSnippet: 'const foo = bar();\nline 3',
        confidence: 0.9,
      },
    ];

    const result = await verifyEvidence(candidates, tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('use const');
  });

  it('returns candidate unchanged (no evidenceLine field)', async () => {
    tmpDir = makeTempDir();
    writeFile(tmpDir, 'src/index.ts', 'const foo = bar();\n');

    const candidates: RawCandidate[] = [
      {
        rule: 'use const',
        evidencePath: 'src/index.ts',
        evidenceSnippet: 'const foo = bar();',
        confidence: 0.8,
      },
    ];

    const result = await verifyEvidence(candidates, tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      rule: 'use const',
      evidencePath: 'src/index.ts',
      evidenceSnippet: 'const foo = bar();',
      confidence: 0.8,
    });
    expect(result[0]).not.toHaveProperty('evidenceLine');
  });

  it('discards candidate when file does not exist', async () => {
    tmpDir = makeTempDir();

    const candidates: RawCandidate[] = [
      {
        rule: 'use const',
        evidencePath: 'src/missing.ts',
        evidenceSnippet: 'const x = 1;',
        confidence: 0.9,
      },
    ];

    const result = await verifyEvidence(candidates, tmpDir);
    expect(result).toHaveLength(0);
  });

  it('discards candidate when first line of snippet does not appear in file', async () => {
    tmpDir = makeTempDir();
    writeFile(tmpDir, 'src/index.ts', 'let x = 1;\nlet y = 2;\n');

    const candidates: RawCandidate[] = [
      {
        rule: 'use const',
        evidencePath: 'src/index.ts',
        evidenceSnippet: 'const x = 1;',  // not in file
        confidence: 0.9,
      },
    ];

    const result = await verifyEvidence(candidates, tmpDir);
    expect(result).toHaveLength(0);
  });

  it('finds snippet anywhere in the file, not just near a specific line', async () => {
    tmpDir = makeTempDir();
    // Snippet is near the end of a 50-line file — should still be found
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
    lines[48] = 'const target = true;';
    writeFile(tmpDir, 'src/index.ts', lines.join('\n'));

    const candidates: RawCandidate[] = [
      {
        rule: 'use const',
        evidencePath: 'src/index.ts',
        evidenceSnippet: 'const target = true;',
        confidence: 0.9,
      },
    ];

    const result = await verifyEvidence(candidates, tmpDir);
    expect(result).toHaveLength(1);
  });

  it('discards candidate with path traversal evidencePath', async () => {
    tmpDir = makeTempDir();
    const candidates: RawCandidate[] = [
      {
        rule: 'escape',
        evidencePath: '../../etc/passwd',
        evidenceSnippet: 'root',
        confidence: 0.5,
      },
    ];

    const result = await verifyEvidence(candidates, tmpDir);
    expect(result).toHaveLength(0);
  });
});

// ---------- callLLM ---------------------------------------------------------

describe('callLLM', () => {
  const model = 'gpt-4o';
  const provider = 'openai';
  const repoName = 'acme/payments-api';
  const samples = [{ path: 'tsconfig.json', content: '{}' }];

  it('returns [] when LLM returns non-JSON text', async () => {
    const llm = makeLlm('This is not JSON at all.');
    const result = await callLLM(samples, llm, model, provider, repoName);
    expect(result).toEqual([]);
  });

  it('returns [] when LLM returns JSON object instead of array', async () => {
    const llm = makeLlm('{"rule": "something"}');
    const result = await callLLM(samples, llm, model, provider, repoName);
    expect(result).toEqual([]);
  });

  it('returns [] when LLM returns array item missing required field', async () => {
    const llm = makeLlm(
      JSON.stringify([
        {
          evidence_path: 'src/index.ts',
          evidence_snippet: 'const x = 1;',
          confidence: 0.9,
          // rule is missing
        },
      ]),
    );
    const result = await callLLM(samples, llm, model, provider, repoName);
    expect(result).toEqual([]);
  });

  it('returns parsed candidates when LLM returns valid JSON with snake_case fields', async () => {
    const validItem = {
      rule: 'Use const for immutable bindings',
      evidence_path: 'src/index.ts',
      evidence_snippet: 'const x = 1;',
      confidence: 0.9,
    };
    const llm = makeLlm(JSON.stringify([validItem]));
    const result = await callLLM(samples, llm, model, provider, repoName);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('Use const for immutable bindings');
    expect(result[0]?.evidencePath).toBe('src/index.ts');
    expect(result[0]?.evidenceSnippet).toBe('const x = 1;');
    expect(result[0]?.confidence).toBe(0.9);
  });

  it('strips markdown code fences before parsing', async () => {
    const validItem = {
      rule: 'Use const',
      evidence_path: 'src/a.ts',
      evidence_snippet: 'const x = 1;',
      confidence: 0.8,
    };
    const llm = makeLlm('```json\n' + JSON.stringify([validItem]) + '\n```');
    const result = await callLLM(samples, llm, model, provider, repoName);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(0.8);
  });

  it('clamps confidence 85 (percentage form) to 1', async () => {
    const validItem = {
      rule: 'Some rule',
      evidence_path: 'src/index.ts',
      evidence_snippet: 'const x = 1;',
      confidence: 85, // LLM returned 85 instead of 0.85
    };
    const llm = makeLlm(JSON.stringify([validItem]));
    const result = await callLLM(samples, llm, model, provider, repoName);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(1);
  });

  it('clamps confidence -0.5 (negative) to 0', async () => {
    const validItem = {
      rule: 'Some rule',
      evidence_path: 'src/index.ts',
      evidence_snippet: 'const x = 1;',
      confidence: -0.5,
    };
    const llm = makeLlm(JSON.stringify([validItem]));
    const result = await callLLM(samples, llm, model, provider, repoName);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(0);
  });

  it('discards items with non-numeric string confidence', async () => {
    const validItem = {
      rule: 'Some rule',
      evidence_path: 'src/index.ts',
      evidence_snippet: 'const x = 1;',
      confidence: 'high', // not a number or numeric string
    };
    const llm = makeLlm(JSON.stringify([validItem]));
    const result = await callLLM(samples, llm, model, provider, repoName);
    // 'high' coerces to NaN → 0 — item is kept with confidence 0
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(0);
  });

  it('propagates error when LLM complete() throws', async () => {
    const llm: LLMProvider = {
      id: 'openai',
      listModels: vi.fn(),
      complete: vi.fn().mockRejectedValue(new Error('network error')),
      completeStructured: vi.fn(),
      embed: vi.fn(),
    } as unknown as LLMProvider;
    await expect(callLLM(samples, llm, model, provider, repoName)).rejects.toThrow('network error');
  });
});
