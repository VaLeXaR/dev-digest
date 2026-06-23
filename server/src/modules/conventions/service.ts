import type { ConventionCandidate } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { RepoRepository } from '../repos/repository.js';
import { ConventionsRepository } from './repository.js';
import { buildSamples, callLLM, verifyEvidence } from './extractor.js';

export class ConventionsService {
  private repo: ConventionsRepository;
  private repoRepo: RepoRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.repoRepo = new RepoRepository(container.db);
  }

  /**
   * Full extraction pipeline (synchronous):
   * 1. Fetch repo row — need clonePath + name
   * 2. buildSamples(clonePath, repoId, container.repoIntel)
   * 3. Resolve 'conventions' feature model → { provider, model }
   * 4. Get LLM adapter from container
   * 5. callLLM(samples, llm, model, provider)
   * 6. verifyEvidence(rawCandidates, clonePath)
   * 7. deleteAllForRepo then insertMany (fresh start)
   * 8. Return ConventionCandidate[]
   */
  async extract(repoId: string, workspaceId: string): Promise<ConventionCandidate[]> {
    // 1. Get repo row — must be cloned
    const repoRow = await this.repoRepo.getById(workspaceId, repoId);
    if (!repoRow) {
      throw new NotFoundError('Repository not found');
    }
    if (!repoRow.clonePath) {
      throw new ValidationError('Repository not cloned yet');
    }
    const clonePath = repoRow.clonePath;

    // 2. Collect file samples from the repo
    const samples = await buildSamples(clonePath, repoId, this.container.repoIntel);

    // 3. Resolve feature model config for 'conventions'
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');

    // 4. Get LLM adapter
    const llm = await this.container.llm(provider);

    // 5. Call LLM to extract raw candidates
    const rawCandidates = await callLLM(samples, llm, model, provider);

    // 6. Verify evidence exists on disk
    const verified = await verifyEvidence(rawCandidates, clonePath);

    // 7. Replace existing conventions with fresh results
    await this.repo.deleteAllForRepo(repoId, workspaceId);
    const candidates = await this.repo.insertMany(workspaceId, repoId, verified);

    // 8. Return the inserted candidates
    return candidates;
  }

  async list(repoId: string, workspaceId: string): Promise<ConventionCandidate[]> {
    return this.repo.listForRepo(repoId, workspaceId);
  }

  async update(
    id: string,
    workspaceId: string,
    patch: { rule?: string; accepted?: boolean | null },
  ): Promise<ConventionCandidate> {
    return this.repo.updateOne(id, workspaceId, patch);
  }

  async deleteOne(id: string, workspaceId: string): Promise<void> {
    return this.repo.deleteOne(id, workspaceId);
  }

  async deleteResolved(repoId: string, workspaceId: string): Promise<void> {
    return this.repo.deleteResolved(repoId, workspaceId);
  }

  async deleteAll(repoId: string, workspaceId: string): Promise<void> {
    return this.repo.deleteAllForRepo(repoId, workspaceId);
  }
}
