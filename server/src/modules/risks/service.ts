import type { PrRisksRecord } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ReviewRepository } from '../reviews/repository.js';
import { buildRisksInput, callRisksLLM } from './extractor.js';

export class RisksService {
  private readonly repo: ReviewRepository;

  constructor(private readonly container: Container) {
    this.repo = new ReviewRepository(container.db);
  }

  async get(prId: string, workspaceId: string): Promise<PrRisksRecord | null> {
    const prRow = await this.repo.getPull(workspaceId, prId);
    if (!prRow) throw new NotFoundError('Pull request not found');
    const risks = await this.repo.getRisks(prId);
    if (!risks) return null;
    return { ...risks, pr_id: prId };
  }

  async generate(prId: string, workspaceId: string): Promise<PrRisksRecord> {
    const prRow = await this.repo.getPull(workspaceId, prId);
    if (!prRow) throw new NotFoundError('Pull request not found');
    const prFiles = await this.repo.getPrFiles(prId);

    const input = buildRisksInput({
      title: prRow.title,
      body: prRow.body ?? null,
      files: prFiles.map((f) => ({ path: f.path, patch: f.patch ?? null })),
    });

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
    const llm = await this.container.llm(provider);
    const risks = await callRisksLLM(input, llm, model);

    await this.repo.upsertRisks(prId, risks);
    return { ...risks, pr_id: prId };
  }
}
