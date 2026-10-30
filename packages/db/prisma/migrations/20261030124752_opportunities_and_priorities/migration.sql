-- CreateEnum
CREATE TYPE "OpportunityKind" AS ENUM ('EVENT', 'AWARD', 'SPEAKING');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('SUGGESTED', 'PLANNED', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "WeeklyPriorityStatus" AS ENUM ('PRIORITY', 'ONGOING', 'DONE');

-- CreateTable
CREATE TABLE "opportunity" (
    "id" TEXT NOT NULL,
    "kind" "OpportunityKind" NOT NULL,
    "title" TEXT NOT NULL,
    "organiser" TEXT,
    "url" TEXT NOT NULL,
    "urlKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "location" TEXT,
    "startsAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "businessId" TEXT,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'SUGGESTED',
    "ownerId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weeklyPriority" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "deliverable" TEXT,
    "status" "WeeklyPriorityStatus" NOT NULL DEFAULT 'PRIORITY',
    "weekStart" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weeklyPriority_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunity_kind_status_deadlineAt_startsAt_idx" ON "opportunity"("kind", "status", "deadlineAt", "startsAt");

-- CreateIndex
CREATE INDEX "opportunity_ownerId_idx" ON "opportunity"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_kind_urlKey_key" ON "opportunity"("kind", "urlKey");

-- CreateIndex
CREATE INDEX "weeklyPriority_status_weekStart_idx" ON "weeklyPriority"("status", "weekStart");

-- CreateIndex
CREATE INDEX "weeklyPriority_status_completedAt_idx" ON "weeklyPriority"("status", "completedAt");

-- CreateIndex
CREATE INDEX "weeklyPriority_ownerId_status_idx" ON "weeklyPriority"("ownerId", "status");

-- AddForeignKey
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weeklyPriority" ADD CONSTRAINT "weeklyPriority_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weeklyPriority" ADD CONSTRAINT "weeklyPriority_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weeklyPriority" ADD CONSTRAINT "weeklyPriority_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
