"use client";

import React, { useState } from "react";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const { data: versions = [], isLoading } = useSkillVersions(skill.id);
  const [expanded, setExpanded] = useState<number | null>(null);

  if (isLoading) return <div style={s.empty}>Loading…</div>;
  if (versions.length === 0) return <div style={s.empty}>No versions saved yet.</div>;

  return (
    <div>
      {versions.map((v) => (
        <div key={v.version} style={s.row}>
          <div
            style={s.header}
            onClick={() => setExpanded(expanded === v.version ? null : v.version)}
          >
            <span style={s.version}>v{v.version}</span>
            <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
            <span style={s.preview}>{v.body.slice(0, 100)}</span>
          </div>
          {expanded === v.version && <pre style={s.body}>{v.body}</pre>}
        </div>
      ))}
    </div>
  );
}
