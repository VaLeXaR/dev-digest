"use client";

import React, { useState } from "react";
import { Button, EmptyState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useActiveRepo } from "../../../../lib/repo-context";
import {
  useConventions,
  useExtractConventions,
  usePatchConvention,
  useDeleteConvention,
  useDeleteResolvedConventions,
} from "../../../../lib/hooks/conventions";
import { useSecretsStatus } from "../../../../lib/hooks";
import { FEATURE_MODELS, PROVIDER_LABELS } from "../../../../lib/feature-models";
import { useToast } from "../../../../lib/toast";
import type { SecretsStatus } from "../../../../lib/types";
import { ConventionCard } from "../ConventionCard/ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal/CreateSkillModal";
import { s } from "./styles";

export function ConventionsView() {
  const { repoId, activeRepo } = useActiveRepo();
  const repoName = activeRepo?.name ?? activeRepo?.full_name ?? "repository";

  const {
    data: candidates,
    isLoading,
    isError,
    refetch,
  } = useConventions(repoId);

  const toast = useToast();
  const { data: secretsStatus } = useSecretsStatus();
  const extractMutation = useExtractConventions();
  const { mutate: patchMutation } = usePatchConvention();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const { mutate: deleteMutation } = useDeleteConvention();
  const { mutate: deleteResolvedMutation } = useDeleteResolvedConventions();

  const list = React.useMemo(
    () =>
      [...(candidates ?? [])].sort(
        (a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id),
      ),
    [candidates],
  );
  const acceptedCandidates = React.useMemo(() => list.filter((c) => c.accepted), [list]);
  const acceptedCount = acceptedCandidates.length;

  function handlePatch(id: string, patch: { rule?: string; accepted?: boolean }) {
    patchMutation({ id, patch });
  }

  function handleRemove(id: string) {
    const item = list.find((c) => c.id === id);
    if (item?.accepted) {
      deleteMutation(id);
    } else {
      setPendingRemoveId(id);
    }
  }

  function confirmRemove() {
    if (pendingRemoveId) deleteMutation(pendingRemoveId);
    setPendingRemoveId(null);
  }

  function handleDeselectAll() {
    acceptedCandidates.forEach((c) => {
      patchMutation({ id: c.id, patch: { accepted: null } });
    });
  }

  function handleRescan() {
    if (!repoId) return;
    if (secretsStatus) {
      const feature = FEATURE_MODELS.find((f) => f.id === "conventions");
      const provider = feature?.defaultProvider as keyof SecretsStatus | undefined;
      if (provider && !secretsStatus[provider]) {
        toast.error(
          `${feature!.label} requires a ${PROVIDER_LABELS[provider] ?? provider} API key — configure it in Settings → API Keys`,
        );
        return;
      }
    }
    extractMutation.mutate(repoId, {
      onSuccess: (data) => {
        if (data.length === 0) toast.info("Scan complete — no conventions detected");
      },
      onError: () => toast.error("Scan failed — check that a model is configured for Conventions"),
    });
  }

  const isExtracting = extractMutation.isPending;

  return (
    <AppShell
      crumb={[
        { label: "DevDigest" },
        { label: `Conventions in ${repoName}` },
      ]}
    >
      <div style={s.page}>
        {/* Header row */}
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>Conventions in <span style={s.repoName}>{repoName}</span></h1>
            {list.length > 0 && (
              <p style={s.subtitle}>
                {list.length} candidate{list.length !== 1 ? "s" : ""} detected
              </p>
            )}
          </div>

          {/* Re-scan button */}
          <Button
            kind="secondary"
            size="sm"
            icon={isExtracting ? undefined : "RefreshCw"}
            onClick={handleRescan}
            disabled={!repoId || isExtracting}
          >
            {isExtracting ? (
              <>
                <span style={s.spinner} aria-hidden="true" />
                {" Scanning…"}
              </>
            ) : (
              "Re-scan"
            )}
          </Button>
        </div>

        {/* Toolbar: deselect all / counter / create skill */}
        {list.length > 0 && (
          <div style={s.toolbar}>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              onClick={handleDeselectAll}
              disabled={acceptedCount === 0}
            >
              Deselect all
            </Button>

            <span style={s.counter}>
              {acceptedCount} of {list.length} accepted
            </span>

            <div style={s.toolbarRight}>
              <Button
                kind="primary"
                size="sm"
                icon="Sparkles"
                disabled={acceptedCount === 0}
                onClick={() => setShowCreateModal(true)}
              >
                Create skill
              </Button>
            </div>
          </div>
        )}

        {/* Body */}
        {(isLoading || isExtracting) && (
          <div style={s.list}>
            <Skeleton height={148} />
            <Skeleton height={148} />
            <Skeleton height={148} />
          </div>
        )}

        {!isExtracting && isError && (
          <EmptyState
            icon="AlertTriangle"
            title="Failed to load conventions"
            body="Could not fetch convention candidates. Click below to retry."
            cta="Retry"
            onCta={() => refetch()}
          />
        )}

        {!isLoading && !isExtracting && !isError && list.length === 0 && (
          <div style={s.emptyState}>
            <p style={s.emptyStateTitle}>No conventions found yet</p>
            <p>Click Re-scan to analyze the repository and detect coding conventions.</p>
          </div>
        )}

        {!isLoading && !isExtracting && !isError && list.length > 0 && (
          <div style={s.list}>
            {list.map((c) => (
              <ConventionCard key={c.id} convention={c} onPatch={handlePatch} onRemove={handleRemove} />
            ))}
          </div>
        )}

        {showCreateModal && (
          <CreateSkillModal
            repoName={repoName}
            accepted={acceptedCandidates}
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              if (repoId) deleteResolvedMutation(repoId);
              setShowCreateModal(false);
            }}
          />
        )}

        {pendingRemoveId && (
          <div style={s.overlay}>
            <div style={s.modal}>
              <p style={s.modalTitle}>Remove convention?</p>
              <p style={s.modalBody}>
                This convention will be permanently removed from the list. This action cannot be undone.
              </p>
              <div style={s.modalActions}>
                <Button kind="ghost" size="sm" onClick={() => setPendingRemoveId(null)}>
                  Cancel
                </Button>
                <Button kind="danger" size="sm" onClick={confirmRemove}>
                  Remove
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
