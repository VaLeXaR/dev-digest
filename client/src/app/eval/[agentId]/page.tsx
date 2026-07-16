"use client";

import { useParams } from "next/navigation";
import { AgentEvalDetail } from "./_components/AgentEvalDetail/AgentEvalDetail";

export default function AgentEvalDetailPage() {
  const params = useParams<{ agentId: string }>();
  return <AgentEvalDetail agentId={params.agentId} />;
}
