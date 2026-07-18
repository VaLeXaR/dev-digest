CREATE UNIQUE INDEX "pr_commits_pr_sha_uq" ON "pr_commits" USING btree ("pr_id","sha");--> statement-breakpoint
CREATE UNIQUE INDEX "pr_files_pr_path_uq" ON "pr_files" USING btree ("pr_id","path");