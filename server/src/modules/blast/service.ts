import type { BlastResult } from '../repo-intel/types.js';
import type { BlastRadius, DownstreamImpact, PrBlastRecord } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ReviewRepository } from '../reviews/repository.js';

export class BlastService {
  private readonly repo: ReviewRepository;

  constructor(private readonly container: Container) {
    this.repo = new ReviewRepository(container.db);
  }

  /**
   * Derived-read core map: changed symbols, grouped callers, endpoint/cron
   * attribution. No persistence, no LLM — safe to call from both `get()` and
   * `generateSummary()` without duplicating the grouping logic. Returns the
   * raw `BlastResult` alongside so callers can read `degraded`/`reason`
   * without a second `repoIntel.getBlastRadius` call.
   */
  private async computeBlast(
    repoId: string,
    changedFiles: string[],
  ): Promise<{ blastRadius: BlastRadius; raw: BlastResult }> {
    const raw = await this.container.repoIntel.getBlastRadius(repoId, changedFiles);
    return { blastRadius: groupBlast(raw), raw };
  }

  /**
   * Zero-LLM derived read. Reads a previously persisted summary (if any) but
   * never generates one — the LLM boundary is strictly `generateSummary()`.
   */
  async get(prId: string, workspaceId: string): Promise<PrBlastRecord> {
    const prRow = await this.repo.getPull(workspaceId, prId);
    if (!prRow) throw new NotFoundError('Pull request not found');

    const prFiles = await this.repo.getPrFiles(prId);
    const changedFiles = prFiles.map((f) => f.path);

    const { blastRadius, raw } = await this.computeBlast(prRow.repoId, changedFiles);

    const persisted = await this.repo.getBlastSummary(prId);

    return {
      ...blastRadius,
      summary: persisted?.summary ?? '',
      pr_id: prId,
      degraded: raw.degraded,
      reason: raw.reason,
    };
  }

  /**
   * Runs the ONE LLM call in this feature: builds a compact prompt from the
   * already-computed BlastRadius (symbol/caller/endpoint names only, no file
   * contents), summarizes it, and persists the result. Called strictly by the
   * "Explain" button (POST /pulls/:id/blast/summary) — never from `get()`.
   */
  async generateSummary(prId: string, workspaceId: string): Promise<PrBlastRecord> {
    const prRow = await this.repo.getPull(workspaceId, prId);
    if (!prRow) throw new NotFoundError('Pull request not found');

    const prFiles = await this.repo.getPrFiles(prId);
    const changedFiles = prFiles.map((f) => f.path);

    const { blastRadius, raw } = await this.computeBlast(prRow.repoId, changedFiles);

    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      'blast_summary',
    );
    const llm = await this.container.llm(provider);

    const prompt = buildBlastSummaryPrompt(blastRadius);
    const result = await llm.complete({
      model,
      messages: [
        { role: 'system', content: BLAST_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 512,
    });

    const summary = result.text?.trim() ?? '';
    await this.repo.upsertBlastSummary(prId, summary);

    return {
      ...blastRadius,
      summary,
      pr_id: prId,
      degraded: raw.degraded,
      reason: raw.reason,
    };
  }
}

/**
 * Pure grouping/attribution over a raw `BlastResult` from `repoIntel`. Split
 * out from `computeBlast` so both call sites can reuse a single already-
 * fetched `BlastResult` instead of hitting `repoIntel.getBlastRadius` twice.
 */
function groupBlast(blast: BlastResult): BlastRadius {
  // `changedSymbols` is deduped by (name, file) upstream, so the SAME symbol
  // name can appear once per declaring file (e.g. a helper re-declared in two
  // modules). Callers are matched by name only (`viaSymbol`), so two entries
  // sharing a name would carry identical caller/endpoint data — dedupe by
  // name here to avoid rendering the same downstream impact twice.
  const seenNames = new Set<string>();
  const downstream: DownstreamImpact[] = [];
  for (const changedSymbol of blast.changedSymbols) {
    if (seenNames.has(changedSymbol.name)) continue;
    seenNames.add(changedSymbol.name);

    const callers = blast.callers.filter((c) => c.viaSymbol === changedSymbol.name);
    // A symbol with 0 external callers has no blast radius to report — either
    // it's only called within its own (excluded) declaration file, or it's
    // genuinely unused. Either way this card shows blast radius only, not a
    // list of every changed function; skip it rather than render an
    // always-empty row.
    if (callers.length === 0) continue;

    let endpointsAffected: string[];
    let cronsAffected: string[];
    if (blast.factsByFile) {
      const endpoints = new Set<string>();
      const crons = new Set<string>();
      for (const caller of callers) {
        const facts = blast.factsByFile[caller.file];
        if (!facts) continue;
        for (const e of facts.endpoints) endpoints.add(e);
        for (const c of facts.crons) crons.add(c);
      }
      endpointsAffected = [...endpoints];
      cronsAffected = [...crons];
    } else {
      endpointsAffected = blast.impactedEndpoints;
      cronsAffected = [];
    }

    downstream.push({
      symbol: changedSymbol.name,
      callers: callers.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
      endpoints_affected: endpointsAffected,
      crons_affected: cronsAffected,
    });
  }

  return {
    changed_symbols: blast.changedSymbols.map((s) => ({
      name: s.name,
      file: s.file,
      kind: s.kind,
    })),
    downstream,
    summary: '',
  };
}

const BLAST_SUMMARY_SYSTEM_PROMPT = [
  'You summarize the blast radius of a pull request for a reviewer.',
  'Write ONE short paragraph (2-4 sentences) explaining what could break.',
  'Mention the most impactful changed symbols, how many callers they have,',
  'and any affected HTTP endpoints or scheduled jobs (crons).',
  'Return plain text only — no markdown, no JSON, no headings.',
].join(' ');

/**
 * Builds a compact prompt from the already-computed BlastRadius — symbol
 * names, caller counts, endpoint/cron list only. Never re-reads file
 * contents or the repo clone.
 */
function buildBlastSummaryPrompt(blast: BlastRadius): string {
  const lines: string[] = [];

  lines.push(['Changed symbols:', String(blast.changed_symbols.length)].join(' '));

  for (const d of blast.downstream) {
    const parts: string[] = [
      ['-', d.symbol, ':', String(d.callers.length), 'caller(s)'].join(' '),
    ];
    if (d.endpoints_affected.length > 0) {
      parts.push(['endpoints:', d.endpoints_affected.join(', ')].join(' '));
    }
    if (d.crons_affected.length > 0) {
      parts.push(['crons:', d.crons_affected.join(', ')].join(' '));
    }
    lines.push(parts.join('; '));
  }

  if (blast.downstream.length === 0) {
    lines.push('No downstream callers found for the changed symbols.');
  }

  return lines.join('\n');
}
