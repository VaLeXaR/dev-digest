"use client";

import React, { useState } from "react";
import { Button, EmptyState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useActiveRepo } from "../../../../lib/repo-context";
import {
  useConventions,
  useExtractConventions,
  usePatchConvention,
} from "../../../../lib/hooks/conventions";
import { ConventionCard } from "../ConventionCard/ConventionCard";
import { s } from "./styles";

export function ConventionsView() {
  const { repoId, activeRepo } = useActiveRepo();
  const repoName = activeRepo?.name ?? activeRepo?.full_name ?? "repository";

  const {
    data: candidates,
    isLoading,
    isError,
    refetch,
  } = useConventions(repoId ?? "");

  const extractMutation = useExtractConventions();
  const { mutate: patchMutation } = usePatchConvention();

  const [showCreateModal, setShowCreateModal] = useState(false);

  const list = candidates ?? [];
  const acceptedCandidates = list.filter((c) => c.accepted);
  const acceptedCount = acceptedCandidates.length;

  function handlePatch(id: string, patch: { rule?: string; accepted?: boolean }) {
    patchMutation({ id, patch });
  }

  function handleDeselectAll() {
    acceptedCandidates.forEach((c) => {
      patchMutation({ id: c.id, patch: { accepted: false } });
    });
  }

  function handleRescan() {
    if (!repoId) return;
    extractMutation.mutate(repoId);
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
            <h1 style={s.h1}>Conventions in {repoName}</h1>
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
        {isLoading && (
          <div style={s.list}>
            <Skeleton height={148} />
            <Skeleton height={148} />
            <Skeleton height={148} />
          </div>
        )}

        {isError && (
          <EmptyState
            icon="AlertTriangle"
            title="Failed to load conventions"
            body="Could not fetch convention candidates. Click below to retry."
            cta="Retry"
            onCta={() => refetch()}
          />
        )}

        {!isLoading && !isError && list.length === 0 && (
          <div style={s.emptyState}>
            <p style={s.emptyStateTitle}>No conventions found yet</p>
            <p>Click Re-scan to analyze the repository and detect coding conventions.</p>
          </div>
        )}

        {!isLoading && !isError && list.length > 0 && (
          <div style={s.list}>
            {list.map((c) => (
              <ConventionCard key={c.id} convention={c} onPatch={handlePatch} />
            ))}
          </div>
        )}

        {/* CreateSkillModal placeholder — Task 7 will fill this in */}
        {showCreateModal && (
          // CreateSkillModal will be added in Task 7
          null
        )}
      </div>
    </AppShell>
  );
}
