import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type {
  CreateFileBody,
  CreateFolderBody,
  DiscoveryResponse,
  DocContentResponse,
  EditDocBody,
  RepoRef,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { RepoRepository, type RepoRow } from '../repos/repository.js';
import { resolveRootFolders, resolveTokenBudget } from './settings.js';
import { getDiscovery, refreshDiscovery, type DiscoveryResult } from './discovery.js';
import { extractMarkdownEntries } from './archive.js';
import { createFolder, writeNewFile, extractArchive, editFile } from './writer.js';
import { ProjectContextRepository, type UsageInfo } from './repository.js';

/**
 * Orchestrates discovery/refresh, guarded content read, folder/file create,
 * single-file + archive upload, and edit for the Project Context feature.
 * Never touches `db/schema` or `fs` directly for anything the T-04/T-05 core
 * modules already own — this class only resolves the repo row + settings and
 * delegates.
 */
export class ProjectContextService {
  private repoRepo: RepoRepository;
  private contextRepo: ProjectContextRepository;

  constructor(private container: Container) {
    this.repoRepo = new RepoRepository(container.db);
    this.contextRepo = new ProjectContextRepository(container.db);
  }

  async discovery(workspaceId: string, repoId: string): Promise<DiscoveryResponse> {
    const repo = await this.resolveRepo(workspaceId, repoId);
    const [rootFolders, tokenBudget] = await this.resolveSettings(workspaceId);
    const result = await getDiscovery(
      this.container.git,
      this.refFor(repo),
      repoId,
      repo.clonePath,
      rootFolders,
    );
    const usageMap = await this.contextRepo.usageCounts(
      workspaceId,
      result.documents.map((d) => d.path),
    );
    return this.toResponse(result, tokenBudget, usageMap);
  }

  async refresh(workspaceId: string, repoId: string): Promise<DiscoveryResponse> {
    const repo = await this.resolveRepo(workspaceId, repoId);
    const [rootFolders, tokenBudget] = await this.resolveSettings(workspaceId);
    const result = await refreshDiscovery(
      this.container.git,
      this.refFor(repo),
      repoId,
      repo.clonePath,
      rootFolders,
    );
    const usageMap = await this.contextRepo.usageCounts(
      workspaceId,
      result.documents.map((d) => d.path),
    );
    return this.toResponse(result, tokenBudget, usageMap);
  }

  async getContent(workspaceId: string, repoId: string, path: string): Promise<DocContentResponse> {
    const repo = await this.resolveRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new NotFoundError('Document not found');
    const content = await readGuardedFile(repo.clonePath, path);
    return { path, content };
  }

  async createFolder(workspaceId: string, repoId: string, body: CreateFolderBody): Promise<void> {
    const repo = await this.requireClonedRepo(workspaceId, repoId);
    await this.assertValidRootFolder(workspaceId, body.root_folder);
    await createFolder(repo.clonePath!, body.root_folder, body.path);
  }

  async createFile(workspaceId: string, repoId: string, body: CreateFileBody): Promise<void> {
    const repo = await this.requireClonedRepo(workspaceId, repoId);
    await this.assertValidRootFolder(workspaceId, body.root_folder);
    await writeNewFile(repo.clonePath!, body.root_folder, body.path, body.content);
  }

  async uploadFile(
    workspaceId: string,
    repoId: string,
    rootFolder: string,
    path: string,
    content: string,
  ): Promise<void> {
    const repo = await this.requireClonedRepo(workspaceId, repoId);
    await this.assertValidRootFolder(workspaceId, rootFolder);
    await writeNewFile(repo.clonePath!, rootFolder, path, content);
  }

  async uploadArchive(
    workspaceId: string,
    repoId: string,
    rootFolder: string,
    zipBuffer: Buffer,
  ): Promise<{ written: string[] }> {
    const repo = await this.requireClonedRepo(workspaceId, repoId);
    await this.assertValidRootFolder(workspaceId, rootFolder);
    const entries = extractMarkdownEntries(zipBuffer);
    return extractArchive(repo.clonePath!, rootFolder, entries);
  }

  async editContent(workspaceId: string, repoId: string, body: EditDocBody): Promise<DocContentResponse> {
    const repo = await this.resolveRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new NotFoundError('Document not found');
    await this.assertPathUnderRootFolder(workspaceId, repo.clonePath, body.path);
    await editFile(this.container.git, this.refFor(repo), repo.clonePath, body.path, body.content);
    return { path: body.path, content: body.content };
  }

  private async resolveRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.repoRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  /** Same as `resolveRepo`, but also rejects a repo that isn't cloned yet — every write path needs this. */
  private async requireClonedRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.resolveRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new ValidationError('Repository not cloned yet');
    return repo;
  }

  private async assertValidRootFolder(workspaceId: string, rootFolder: string): Promise<void> {
    const rootFolders = await resolveRootFolders(this.container, workspaceId);
    if (!rootFolders.includes(rootFolder)) {
      throw new ValidationError(`Unknown root folder: ${rootFolder}`);
    }
  }

  /**
   * Edit (unlike create/upload) takes a full doc path, not a `root_folder` — scope it to a
   * configured root folder the same way discovery does, so an authenticated in-workspace user
   * can't use the edit endpoint to overwrite an arbitrary untracked file anywhere in the clone.
   *
   * Resolves `path` against each candidate root folder and checks REAL directory containment
   * (`resolve()`-based, like `writer.ts`'s traversal guard) rather than a string prefix test —
   * a naive `path.startsWith(rootFolder + '/')` is bypassed by a `..`-crafted path such as
   * `specs/../README.md`, which starts with `specs/` but resolves outside `specs/` entirely.
   */
  private async assertPathUnderRootFolder(
    workspaceId: string,
    clonePath: string,
    path: string,
  ): Promise<void> {
    const rootFolders = await resolveRootFolders(this.container, workspaceId);
    const full = resolve(clonePath, path);
    const underRoot = rootFolders.some((rootFolder) => {
      const rootFolderPath = resolve(clonePath, rootFolder);
      return full === rootFolderPath || full.startsWith(rootFolderPath + sep);
    });
    if (!underRoot) {
      throw new ValidationError(`Path is not under a configured root folder: ${path}`);
    }
  }

  private async resolveSettings(workspaceId: string): Promise<[string[], number]> {
    return Promise.all([
      resolveRootFolders(this.container, workspaceId),
      resolveTokenBudget(this.container, workspaceId),
    ]);
  }

  private refFor(repo: RepoRow): RepoRef {
    return { owner: repo.owner, name: repo.name };
  }

  /**
   * Merges the (possibly cached) filesystem-walk result with a fresh
   * `usageMap` read — usage/coverage must never be folded into the
   * discovery cache itself (D-FRESH), since attach changes don't trigger a
   * rescan. `coverage_pct` is the repo-level aggregate (D-COV): the % of
   * discovered docs referenced by ≥1 agent (direct or inherited) or ≥1
   * skill, derived from the same `usageMap`'s `coveredByAny` flags — `null`
   * when zero docs are discovered (avoids a divide-by-zero; ring shows a
   * placeholder).
   */
  private toResponse(
    result: DiscoveryResult,
    tokenBudget: number,
    usageMap: Map<string, UsageInfo>,
  ): DiscoveryResponse {
    const documents = result.documents.map((d) => ({
      ...d,
      used_by_agents: usageMap.get(d.path)?.agentCount ?? 0,
    }));
    const tokenTotal = documents.reduce((sum, d) => sum + d.token_estimate, 0);
    const covered = result.documents.filter((d) => usageMap.get(d.path)?.coveredByAny).length;
    const coveragePct = result.documents.length
      ? Math.round((100 * covered) / result.documents.length)
      : null;
    return {
      documents,
      file_count: documents.length,
      token_total: tokenTotal,
      token_budget: tokenBudget,
      scanned_at: result.scannedAt,
      coverage_pct: coveragePct,
    };
  }
}

/**
 * Guarded single-file read for `GET /repos/:id/context/content` (AC-8) — same
 * traversal-guard invariant as `resolver.ts`/`writer.ts`, but throws
 * `NotFoundError`/`ValidationError` instead of silently skipping, since this
 * is a direct fetch of one specific path, not a best-effort batch resolve.
 */
async function readGuardedFile(clonePath: string, path: string): Promise<string> {
  const resolvedRoot = resolve(clonePath);
  const full = resolve(clonePath, path);
  if (full !== resolvedRoot && !full.startsWith(resolvedRoot + sep)) {
    throw new ValidationError(`Path escapes the clone root: ${path}`);
  }
  try {
    return await readFile(full, 'utf8');
  } catch {
    throw new NotFoundError(`Document not found: ${path}`);
  }
}
