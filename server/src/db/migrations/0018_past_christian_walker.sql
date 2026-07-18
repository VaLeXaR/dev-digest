ALTER TABLE "eval_run_batches" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_run_batches" ADD COLUMN "owner_kind" text;--> statement-breakpoint
ALTER TABLE "eval_run_batches" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_run_batches" ADD COLUMN "owner_version" integer;--> statement-breakpoint
ALTER TABLE "eval_run_batches" ADD CONSTRAINT "eval_run_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;