import { describe, it, expect } from 'vitest';
import {
  extractSymbols,
  extractReferences,
  extractEndpoints,
  extractCrons,
  extractExportedConstStrings,
  resolveJobKindLabels,
} from '../src/adapters/codeindex/extract.js';

/**
 * A3 — unit tests for the enhanced TS/JS symbol/reference extractor (L04).
 * Pure (no DB/network) — the core of blast-radius accuracy.
 */
describe('extractSymbols', () => {
  it('finds functions, arrows, classes, methods, interfaces, types', () => {
    const src = `
export function rateLimit(req) { return true; }
const helper = (x) => x + 1;
export const compute = async (n: number) => n * 2;
export class Bucket {
  refill(now: number) { return now; }
  static make() { return new Bucket(); }
}
export interface Config { port: number }
export type Id = string;
`;
    const syms = extractSymbols(src);
    const names = syms.map((s) => s.name);
    expect(names).toContain('rateLimit');
    expect(names).toContain('helper');
    expect(names).toContain('compute');
    expect(names).toContain('Bucket');
    expect(names).toContain('refill'); // class method (bare)
    expect(names).toContain('Bucket.refill'); // class method (qualified)
    expect(names).toContain('Config');
    expect(names).toContain('Id');
    expect(syms.find((s) => s.name === 'Bucket')?.kind).toBe('class');
    expect(syms.find((s) => s.name === 'Config')?.kind).toBe('interface');
  });

  it('ignores keywords and comment lines', () => {
    const src = `
// function notReal(x) {}
/* class AlsoNot {} */
if (x) { doThing(); }
`;
    const syms = extractSymbols(src);
    expect(syms.map((s) => s.name)).not.toContain('notReal');
    expect(syms.map((s) => s.name)).not.toContain('AlsoNot');
    expect(syms.map((s) => s.name)).not.toContain('if');
  });
});

describe('extractReferences (downstream callers)', () => {
  it('finds call sites and excludes the declaration', () => {
    const caller = `
import { rateLimit } from './mw';
export function handler(req) {
  if (!rateLimit(req)) return 429;
  return 200;
}
`;
    const refs = extractReferences(caller, 'rateLimit');
    // exactly the call site on the if-line, NOT the import line
    expect(refs.length).toBe(1);
    expect(refs[0]!.line).toBe(4);
  });

  it('matches member calls, new, and JSX usage', () => {
    expect(extractReferences('obj.compute(1)', 'compute').length).toBe(1);
    expect(extractReferences('const b = new Bucket()', 'Bucket').length).toBe(1);
    expect(extractReferences('return <Widget id={1} />', 'Widget').length).toBe(1);
  });

  it('does not count the declaration line as a reference', () => {
    const decl = `export function rateLimit(req) { return true; }`;
    expect(extractReferences(decl, 'rateLimit').length).toBe(0);
  });
});

describe('extractEndpoints / extractCrons', () => {
  it('detects fastify/express route registrations', () => {
    const src = `
app.get('/users', handler);
router.post("/users/:id", update);
app.get<{ Params: { id: string } }>('/pulls/:id/blast', blast);
`;
    const eps = extractEndpoints(src);
    expect(eps).toContain('GET /users');
    expect(eps).toContain('POST /users/:id');
    expect(eps).toContain('GET /pulls/:id/blast');
  });

  it('detects cron expressions and background job kinds', () => {
    const src = `
cron.schedule('*/5 * * * *', poll);
jobs.register('poll_repo', handler);
`;
    const crons = extractCrons(src);
    expect(crons.some((c) => c.includes('*/5'))).toBe(true);
    expect(crons).toContain('job:poll_repo');
  });

  it('detects job kinds passed as a named constant, not just a string literal', () => {
    // This repo's own real pattern (repo-intel/service.ts): the kind is a
    // SCREAMING_SNAKE_CASE constant, not an inline string — jobKindRe alone
    // cannot see through it (no symbol table), which is why extractCrons
    // found 0 real registrations anywhere in this codebase before the
    // jobKindIdentRe fallback was added.
    const src = `
this.container.jobs.register(INDEX_JOB_KIND, async (payload) => {
  await runFullIndex(this.container, this.repo, payload);
});
`;
    const crons = extractCrons(src);
    expect(crons).toContain('job:INDEX_JOB_KIND');
  });
});

describe('extractExportedConstStrings / resolveJobKindLabels', () => {
  it('collects SCREAMING_SNAKE_CASE exported string constants', () => {
    const src = `
export const INDEX_JOB_KIND = 'repo-intel-index';
export const REFRESH_JOB_KIND = "repo-intel-refresh";
const notExported = 'skip-me';
export const notScreamingCase = 'skip-me-too';
`;
    const map = extractExportedConstStrings(src);
    expect(map).toEqual({
      INDEX_JOB_KIND: 'repo-intel-index',
      REFRESH_JOB_KIND: 'repo-intel-refresh',
    });
  });

  it('resolves job:NAME entries to their literal constant value, cross-file', () => {
    // The constant is declared in one file (constants.ts) and used at the
    // registration call site in another (service.ts) — this is exactly why
    // resolution has to happen after the whole repo walk, not per-file.
    const constantsFileSrc = `export const INDEX_JOB_KIND = 'repo-intel-index';`;
    const serviceFileSrc = `jobs.register(INDEX_JOB_KIND, handler);`;

    const constMap = extractExportedConstStrings(constantsFileSrc);
    const crons = extractCrons(serviceFileSrc);
    expect(crons).toEqual(['job:INDEX_JOB_KIND']);

    const resolved = resolveJobKindLabels(crons, constMap);
    expect(resolved).toEqual(['repo-intel-index']);
  });

  it('leaves job:NAME unresolved when the constant is never found (honest fallback, no guessing)', () => {
    const resolved = resolveJobKindLabels(['job:UNKNOWN_KIND'], { OTHER: 'value' });
    expect(resolved).toEqual(['job:UNKNOWN_KIND']);
  });

  it('passes through raw cron expressions unchanged', () => {
    const resolved = resolveJobKindLabels(['*/5 * * * *'], { INDEX_JOB_KIND: 'repo-intel-index' });
    expect(resolved).toEqual(['*/5 * * * *']);
  });
});
