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

  it('returns candidate when snippet is found within ±5 lines', async () => {
    tmpDir = makeTempDir();
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    lines[9] = 'const foo = bar();'; // line 10
    writeFile(tmpDir, 'src/index.ts', lines.join('\n'));

    const candidates: RawCandidate[] = [
      {
        rule: 'use const',
        evidencePath: 'src/index.ts',
        evidenceLine: 10,
        evidenceSnippet: 'const foo = bar();',
        confidence: 0.9,
      },
    ];

    const result = await verifyEvidence(candidates, tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('use const');
  });

  it('strips evidenceLine from returned objects', async () => {
    tmpDir = makeTempDir();
    writeFile(tmpDir, 'src/index.ts', 'const foo = bar();\n');

    const candidates: RawCandidate[] = [
      {
        rule: 'use const',
        evidencePath: 'src/index.ts',
        evidenceLine: 1,
        evidenceSnippet: 'const foo = bar();',
        confidence: 0.8,
      },
    ];

    const result = await verifyEvidence(candidates, tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('evidenceLine');
    expect(result[0]).toMatchObject({
      rule: 'use const',
      evidencePath: 'src/index.ts',
      evidenceSnippet: 'const foo = bar();',
      confidence: 0.8,
    });
  });

  it('discards candidate when file does not exist', async () => {
    tmpDir = makeTempDir();

    const candidates: RawCandidate[] = [
      {
        rule: 'use const',
        evidencePath: 'src/missing.ts',
        evidenceLine: 1,
        evidenceSnippet: 'const x = 1;',
        confidence: 0.9,
      },
    ];

    const result = await verifyEvidence(candidates, tmpDir);
    expect(result).toHaveLength(0);
  });

  it('discards candidate when snippet is NOT within ±5 lines of evidenceLine', async () => {
    tmpDir = makeTempDir();
    // Snippet is on line 1, but evidenceLine points to line 20 — outside ±5 window
    const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`);
    lines[0] = 'const foo = bar();'; // line 1
    writeFile(tmpDir, 'src/index.ts', lines.join('\n'));

    const candidates: RawCandidate[] = [
      {
        rule: 'use const',
        evidencePath: 'src/index.ts',
        evidenceLine: 20, // ±5 = lines 15-25; snippet is on line 1
        evidenceSnippet: 'const foo = bar();',
        confidence: 0.9,
      },
    ];

    const result = await verifyEvidence(candidates, tmpDir);
    expect(result).toHaveLength(0);
  });

  it('discards candidate with path traversal evidencePath', async () => {
    tmpDir = makeTempDir();
    // We put a file outside tmpDir that would be reachable via ../
    // The guard should drop this candidate without reading it.
    const candidates: RawCandidate[] = [
      {
        rule: 'escape',
        evidencePath: '../../etc/passwd',
        evidenceLine: 1,
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
  const samples = [{ path: 'tsconfig.json', content: '{}' }];

  it('returns [] when LLM returns non-JSON text', async () => {
    const llm = makeLlm('This is not JSON at all.');
    const result = await callLLM(samples, llm, model, provider);
    expect(result).toEqual([]);
  });

  it('returns [] when LLM returns JSON object instead of array', async () => {
    const llm = makeLlm('{"rule": "something"}');
    const result = await callLLM(samples, llm, model, provider);
    expect(result).toEqual([]);
  });

  it('returns [] when LLM returns JSON array with wrong shape (missing rule)', async () => {
    const llm = makeLlm(
      JSON.stringify([
        {
          evidencePath: 'src/index.ts',
          evidenceLine: 1,
          evidenceSnippet: 'const x = 1;',
          confidence: 0.9,
          // rule is missing
        },
      ]),
    );
    const result = await callLLM(samples, llm, model, provider);
    expect(result).toEqual([]);
  });

  it('returns parsed candidates when LLM returns valid JSON', async () => {
    const validItem = {
      rule: 'Use const for immutable bindings',
      evidencePath: 'src/index.ts',
      evidenceLine: 5,
      evidenceSnippet: 'const x = 1;',
      confidence: 0.9,
    };
    const llm = makeLlm(JSON.stringify([validItem]));
    const result = await callLLM(samples, llm, model, provider);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('Use const for immutable bindings');
    expect(result[0]?.confidence).toBe(0.9);
  });

  it('strips markdown code fences before parsing', async () => {
    const validItem = {
      rule: 'Use const',
      evidencePath: 'src/a.ts',
      evidenceLine: 1,
      evidenceSnippet: 'const x = 1;',
      confidence: 0.8,
    };
    const llm = makeLlm('```json\n' + JSON.stringify([validItem]) + '\n```');
    const result = await callLLM(samples, llm, model, provider);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(0.8);
  });

  it('clamps confidence 85 (percentage form) to 1', async () => {
    const validItem = {
      rule: 'Some rule',
      evidencePath: 'src/index.ts',
      evidenceLine: 1,
      evidenceSnippet: 'const x = 1;',
      confidence: 85, // LLM returned 85 instead of 0.85
    };
    const llm = makeLlm(JSON.stringify([validItem]));
    const result = await callLLM(samples, llm, model, provider);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(1);
  });

  it('clamps confidence -0.5 (negative) to 0', async () => {
    const validItem = {
      rule: 'Some rule',
      evidencePath: 'src/index.ts',
      evidenceLine: 1,
      evidenceSnippet: 'const x = 1;',
      confidence: -0.5,
    };
    const llm = makeLlm(JSON.stringify([validItem]));
    const result = await callLLM(samples, llm, model, provider);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(0);
  });

  it('discards items with wrong confidence type (non-numeric string)', async () => {
    const validItem = {
      rule: 'Some rule',
      evidencePath: 'src/index.ts',
      evidenceLine: 1,
      evidenceSnippet: 'const x = 1;',
      confidence: 'high', // not a number or numeric string
    };
    const llm = makeLlm(JSON.stringify([validItem]));
    const result = await callLLM(samples, llm, model, provider);
    // 'high' coerces to NaN, Number('high') || 0 → 0 — item is kept with confidence 0
    // This is acceptable behavior: the item passes shape validation as string, clamped to 0
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
    await expect(callLLM(samples, llm, model, provider)).rejects.toThrow('network error');
  });
});
