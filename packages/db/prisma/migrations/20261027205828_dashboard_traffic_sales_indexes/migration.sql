-- CreateIndex
CREATE INDEX "deal_stage_closedAt_idx" ON "deal"("stage", "closedAt");

-- CreateIndex
CREATE INDEX "trackedEvent_type_occurredAt_host_visitorId_idx" ON "trackedEvent"("type", "occurredAt", "host", "visitorId");
