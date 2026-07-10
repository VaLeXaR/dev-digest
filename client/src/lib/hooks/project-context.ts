/* hooks/project-context.ts — React Query hooks for the Project Context feature:
     discovery + preview of a repo's markdown docs, attach-doc links on
     agents/skills, and in-app authoring (folder/file/zip create + edit).
   Server routes:
     GET  /repos/:id/context/docs           → DiscoveryResponse (cached)
     POST /repos/:id/context/refresh        → DiscoveryResponse (re-scan)
     GET  /repos/:id/context/content?path=  → DocContentResponse (lazy preview)
     POST /repos/:id/context/folders        → 201, no body
     POST /repos/:id/context/files          → 201, no body
     POST /repos/:id/context/files/upload   → 201, no body (multipart, root_folder/path as query)
     POST /repos/:id/context/archive        → 201, { written: string[] } (multipart, root_folder as query)
     PUT  /repos/:id/context/content        → DocContentResponse
     GET/PUT /agents/:id/context-docs       → ContextDocsResponse
     GET/PUT /skills/:id/context-docs       → ContextDocsResponse
   Create/upload endpoints intentionally return 201 with an EMPTY body (no
   response schema) — `api.post`/`apiFetch` always call `res.json()` for a
   non-204 status, which throws on an empty body. `postRaw` below tolerates
   an empty body instead of going through `api`. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE, ApiError } from "../api";
import { notify } from "../toast";
import type {
  DiscoveryResponse,
  DocContentResponse,
  CreateFolderBody,
  CreateFileBody,
  EditDocBody,
  ContextDocsResponse,
} from "@devdigest/shared";

function discoveryKey(repoId: string | null | undefined) {
  return ["context-discovery", repoId ?? ""];
}

/** Raw fetch that tolerates a 2xx response with an empty body (unlike
    `apiFetch`, which calls `res.json()` on anything but a 204). Mirrors
    `apiFetch`'s error-body parsing for consistent `ApiError` shape. */
async function postRaw<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch (e) {
    throw new ApiError(
      `Cannot reach the DevDigest engine at ${API_BASE}. Is the API running?`,
      0,
      "network_error",
      e,
    );
  }
  if (!res.ok) {
    let code: string | undefined;
    let message = `${res.status} ${res.statusText}`;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message ?? message;
        details = body.error.details;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code, details);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function useDiscovery(repoId: string | null | undefined) {
  return useQuery({
    queryKey: discoveryKey(repoId),
    queryFn: () => api.get<DiscoveryResponse>(`/repos/${repoId!}/context/docs`),
    enabled: !!repoId,
  });
}

export function useRefreshDiscovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<DiscoveryResponse>(`/repos/${repoId}/context/refresh`),
    onSuccess: (data, repoId) => {
      qc.setQueryData(discoveryKey(repoId), data);
      qc.invalidateQueries({ queryKey: discoveryKey(repoId) });
    },
    onError: () => notify.error("Failed to refresh Project Context"),
  });
}

export function useDocContent(
  repoId: string | null | undefined,
  path: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["context-content", repoId ?? "", path ?? ""],
    queryFn: () =>
      api.get<DocContentResponse>(
        `/repos/${repoId!}/context/content?path=${encodeURIComponent(path!)}`,
      ),
    enabled: !!repoId && !!path && enabled,
  });
}

export interface CreateFolderInput {
  repoId: string;
  body: CreateFolderBody;
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, body }: CreateFolderInput) =>
      postRaw<void>(`/repos/${repoId}/context/folders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, { repoId }) => {
      qc.invalidateQueries({ queryKey: discoveryKey(repoId) });
    },
    onError: () => notify.error("Failed to create folder"),
  });
}

export interface CreateFileInput {
  repoId: string;
  body: CreateFileBody;
}

export function useCreateFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, body }: CreateFileInput) =>
      postRaw<void>(`/repos/${repoId}/context/files`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, { repoId }) => {
      qc.invalidateQueries({ queryKey: discoveryKey(repoId) });
    },
    onError: () => notify.error("Failed to create file"),
  });
}

export interface UploadFileInput {
  repoId: string;
  rootFolder: string;
  path: string;
  file: File;
}

export function useUploadFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, rootFolder, path, file }: UploadFileInput) => {
      const fd = new FormData();
      fd.append("file", file);
      const qs = `root_folder=${encodeURIComponent(rootFolder)}&path=${encodeURIComponent(path)}`;
      return postRaw<void>(`/repos/${repoId}/context/files/upload?${qs}`, {
        method: "POST",
        body: fd,
      });
    },
    onSuccess: (_data, { repoId }) => {
      qc.invalidateQueries({ queryKey: discoveryKey(repoId) });
    },
    onError: () => notify.error("Failed to upload file"),
  });
}

export interface UploadArchiveInput {
  repoId: string;
  rootFolder: string;
  file: File;
}

export function useUploadArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, rootFolder, file }: UploadArchiveInput) => {
      const fd = new FormData();
      fd.append("file", file);
      const qs = `root_folder=${encodeURIComponent(rootFolder)}`;
      return postRaw<{ written: string[] }>(`/repos/${repoId}/context/archive?${qs}`, {
        method: "POST",
        body: fd,
      });
    },
    onSuccess: (_data, { repoId }) => {
      qc.invalidateQueries({ queryKey: discoveryKey(repoId) });
    },
    onError: () => notify.error("Failed to upload archive"),
  });
}

export interface EditDocInput {
  repoId: string;
  body: EditDocBody;
}

export function useEditDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, body }: EditDocInput) =>
      api.put<DocContentResponse>(`/repos/${repoId}/context/content`, body),
    onSuccess: (_data, { repoId }) => {
      qc.invalidateQueries({ queryKey: discoveryKey(repoId) });
    },
    onError: () => notify.error("Failed to save document"),
  });
}

export function useAgentContextDocs(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context-docs", agentId ?? ""],
    queryFn: () => api.get<ContextDocsResponse>(`/agents/${agentId!}/context-docs`),
    enabled: !!agentId,
  });
}

export function useSetAgentContextDocs(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.put<ContextDocsResponse>(`/agents/${agentId}/context-docs`, { paths }),
    onSuccess: (data) => {
      qc.setQueryData(["agent-context-docs", agentId], data);
    },
    onError: () => notify.error("Failed to save attached docs"),
  });
}

export function useSkillContextDocs(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context-docs", skillId ?? ""],
    queryFn: () => api.get<ContextDocsResponse>(`/skills/${skillId!}/context-docs`),
    enabled: !!skillId,
  });
}

export function useSetSkillContextDocs(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.put<ContextDocsResponse>(`/skills/${skillId}/context-docs`, { paths }),
    onSuccess: (data) => {
      qc.setQueryData(["skill-context-docs", skillId], data);
    },
    onError: () => notify.error("Failed to save attached docs"),
  });
}
