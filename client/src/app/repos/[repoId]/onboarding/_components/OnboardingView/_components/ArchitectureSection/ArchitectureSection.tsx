/* ArchitectureSection — Markdown prose + Mermaid diagram (R13/AC-15/AC-16).
   MermaidDiagram self-omits on invalid input; no fallback UI needed here. */
"use client";

import { Markdown } from "@devdigest/ui";
import type { OnboardingArchitecture } from "@devdigest/shared";
import { MermaidDiagram } from "../../../../../../../../components/mermaid-diagram";
import { SectionCard } from "../SectionCard/SectionCard";
import { s } from "../../styles";

export function ArchitectureSection({
  id,
  title,
  architecture,
}: {
  id: string;
  title: string;
  architecture: OnboardingArchitecture;
}) {
  return (
    <SectionCard id={id} icon="Workflow" title={title}>
      <Markdown>{architecture.summary}</Markdown>
      {architecture.diagram && (
        <div style={s.diagramWrap}>
          <MermaidDiagram chart={architecture.diagram} />
        </div>
      )}
    </SectionCard>
  );
}

export default ArchitectureSection;
