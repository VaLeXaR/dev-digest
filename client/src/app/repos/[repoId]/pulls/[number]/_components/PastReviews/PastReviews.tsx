/* PastReviews — header dropdown listing the multi-agent reviews already run on
   THIS PR (GET /pulls/:id/multi-agent-runs via useMultiRunHistory). Sibling of
   PickAgentsToRun: that button STARTS a new run, this one navigates to a past
   one (row click) or deletes it (per-row trash → confirm modal). Renders
   nothing until at least one run exists, so a PR that was never multi-reviewed
   shows no empty control. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, Modal, type DropdownItemDef } from "@devdigest/ui";
import { useDeleteMultiRun, useMultiRunHistory } from "@/lib/hooks/multi-agent";
import { formatCost } from "@/lib/format";

export function PastReviews({ prId }: { prId: string }) {
  const t = useTranslations("multiAgentPicker");
  const router = useRouter();
  const { data: runs } = useMultiRunHistory(prId);
  const del = useDeleteMultiRun();
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; label: string } | null>(null);
  const items = runs ?? [];

  if (items.length === 0) return null;

  const labelFor = (ranAt: string) =>
    new Date(ranAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const dropdownItems: DropdownItemDef[] = items.map((run) => ({
    label: labelFor(run.ranAt),
    icon: run.status === "complete" ? "Check" : run.status === "failed" ? "XCircle" : "Clock",
    hint: t("pastReviewsItemHint", { count: run.agentCount, cost: formatCost(run.totalCostUsd) }),
    onClick: () => router.push(`/multi-agent-review/${run.id}`),
    onRemove: () => setPendingDelete({ id: run.id, label: labelFor(run.ranAt) }),
    removeLabel: t("pastReviewsDelete"),
  }));

  const confirmDelete = () => {
    if (!pendingDelete) return;
    del.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) });
  };

  return (
    <>
      <Dropdown
        width={260}
        trigger={
          <Button kind="secondary" size="sm" icon="History" iconRight="ChevronDown">
            {t("pastReviews", { count: items.length })}
          </Button>
        }
        items={dropdownItems}
      />

      {pendingDelete && (
        <Modal
          width={420}
          title={t("deleteConfirmTitle")}
          subtitle={t("deleteConfirmBody", { label: pendingDelete.label })}
          onClose={del.isPending ? undefined : () => setPendingDelete(null)}
          footer={
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button kind="secondary" size="sm" onClick={() => setPendingDelete(null)} disabled={del.isPending}>
                {t("deleteCancel")}
              </Button>
              <Button kind="danger" size="sm" onClick={confirmDelete} disabled={del.isPending}>
                {del.isPending ? t("deleting") : t("deleteConfirm")}
              </Button>
            </div>
          }
        />
      )}
    </>
  );
}
