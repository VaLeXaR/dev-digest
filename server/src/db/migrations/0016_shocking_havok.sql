CREATE TABLE "pr_file_summaries" (
	"pr_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"summary" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pr_file_summaries_pr_id_file_path_pk" PRIMARY KEY("pr_id","file_path")
);
--> statement-breakpoint
ALTER TABLE "pr_file_summaries" ADD CONSTRAINT "pr_file_summaries_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;