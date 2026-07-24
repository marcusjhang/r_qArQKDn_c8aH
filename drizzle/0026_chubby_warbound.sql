CREATE INDEX "candidates_job_id_idx" ON "candidates" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "mentions_user_id_idx" ON "mentions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mentions_message_id_idx" ON "mentions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_candidate_id_idx" ON "messages" USING btree ("candidate_id");