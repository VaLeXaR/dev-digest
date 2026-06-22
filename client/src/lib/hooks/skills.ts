"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "../api";
import type { Skill, SkillAgent, SkillVersion, SkillPreview } from "@devdigest/shared";

export function useSkills() {
  return useQuery({ queryKey: ["skills"], queryFn: () => api.get<Skill[]>("/skills") });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useSkillAgents(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-agents", id],
    queryFn: () => api.get<SkillAgent[]>(`/skills/${id}/agents`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: Skill["type"];
  body: string;
  enabled?: boolean;
  source?: Skill["source"];
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

export function useImportPreviewUrl() {
  return useMutation({
    mutationFn: (url: string) => api.post<SkillPreview[]>("/skills/import/preview-url", { url }),
  });
}

export function useImportPreviewFile() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/skills/import/preview-file`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json() as Promise<SkillPreview[]>;
    },
  });
}

export function useImportConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (previews: SkillPreview[]) =>
      api.post<Skill[]>("/skills/import/confirm", { previews }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
