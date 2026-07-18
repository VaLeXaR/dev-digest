ALTER TABLE "eval_run_batches" DROP CONSTRAINT "eval_run_batches_agent_id_agents_id_fk";
--> statement-breakpoint
-- Backfill T-01 owner-generic columns for every pre-existing row before they
-- become NOT NULL below: every row up to this migration was an agent batch,
-- so owner_kind='agent' / owner_id=agent_id / owner_version=agent_version,
-- and workspace_id is derived from the owning agent's own workspace.
UPDATE "eval_run_batches"
SET "owner_kind" = 'agent',
    "owner_id" = "agent_id",
    "owner_version" = "agent_version",
    "workspace_id" = (SELECT "agents"."workspace_id" FROM "agents" WHERE "agents"."id" = "eval_run_batches"."agent_id")
WHERE "owner_kind" IS NULL;--> statement-breakpoint
ALTER TABLE "eval_run_batches" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_run_batches" ALTER COLUMN "owner_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_run_batches" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_run_batches" ALTER COLUMN "owner_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_run_batches" DROP COLUMN "agent_id";--> statement-breakpoint
ALTER TABLE "eval_run_batches" DROP COLUMN "agent_version";