import type { Container } from '../../platform/container.js';
import type { Skill, SkillAgent, SkillVersion, SkillPreview, SkillType, SkillSource } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source: SkillSource;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    const statsMap = await this.repo.statsForSkills(rows.map((r) => r.id));
    return rows.map((r) => toSkillDto(r, statsMap.get(r.id)));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const statsMap = await this.repo.statsForSkills([row.id]);
    return toSkillDto(row, statsMap.get(row.id));
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({ workspaceId, ...input });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    return (await this.repo.listVersions(skillId)).map(toSkillVersionDto);
  }

  async getSkillAgents(workspaceId: string, skillId: string): Promise<SkillAgent[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    return this.repo.getAgentsBySkill(skillId);
  }

  /** Attached context-doc paths for a skill, workspace-scoped (undefined = not found). */
  async contextDocs(workspaceId: string, skillId: string): Promise<string[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    return this.repo.contextDocPaths(skillId);
  }

  /**
   * Replace the skill's attached context-doc paths (workspace-scoped). Bumps
   * the skill's version + snapshots `skill_versions` (D2). Returns the
   * resulting ordered paths, or undefined if the skill isn't in this workspace.
   */
  async setContextDocs(workspaceId: string, skillId: string, paths: string[]): Promise<string[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    await this.repo.setContextDocs(skillId, paths);
    return this.repo.contextDocPaths(skillId);
  }

  async importConfirm(workspaceId: string, previews: SkillPreview[]): Promise<Skill[]> {
    const results: Skill[] = [];
    for (const preview of previews) {
      const row = await this.repo.insert({
        workspaceId,
        name: preview.name,
        description: preview.description,
        type: preview.type,
        source: preview.source,
        body: preview.body,
      });
      results.push(toSkillDto(row));
    }
    return results;
  }
}
