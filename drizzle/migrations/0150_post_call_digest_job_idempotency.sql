-- 0150: one durable post-call workflow per tenant call, plus retry-safe local
-- child jobs keyed to that workflow.
--
-- Vapi retries end-of-call reports, and two durable webhook workers can race.
-- The call log already converges on vapi_call_id; this matching queue boundary
-- makes every redelivery adopt the same post-call digest job instead of sending
-- duplicate owner email or CSAT. Completed/dead jobs stay in the uniqueness set
-- deliberately: a call's customer-facing follow-up is never recreated by a
-- later webhook replay.
CREATE UNIQUE INDEX "uq_jobs_post_call_digest_call"
  ON "wireline_jobs" USING btree ("user_id", ("payload"->>'callLogId'))
  WHERE "wireline_jobs"."type" = 'post_call_digest';

-- Only new post-call child rows carry postCallDigestJobId, so this can be
-- deployed without deleting or mutating historical jobs. A parent retry after
-- an interrupted enqueue adopts the existing child instead of silently losing
-- the artifact/QA run or scheduling it twice.
CREATE UNIQUE INDEX "uq_jobs_post_call_child_per_digest"
  ON "wireline_jobs" USING btree (
    "user_id",
    "type",
    ("payload"->>'postCallDigestJobId')
  )
  WHERE "wireline_jobs"."type" IN ('post_call_artifact', 'auto_qa_score')
    AND ("wireline_jobs"."payload"->>'postCallDigestJobId') IS NOT NULL;
